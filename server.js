const express = require('express');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const PORT = process.env.PORT || 3000;
const { initialize, nextWord, stats } = require('./word-store');
const rand = (n) => crypto.randomInt(n);
const token = () => crypto.randomBytes(24).toString('hex');
function roomCode() { let c; do { c = crypto.randomInt(100000,999999).toString(); } while(rooms.has(c)); return c; }
function publicState(room) {
  const players = [...room.players.values()].map(p=>({id:p.id,name:p.name,online:!!p.socketId,active:room.participants.has(p.id),hasVoted:room.votes.has(p.id)}));
  return { code:room.code,phase:room.phase,round:room.round,players,onlineCount:players.filter(p=>p.online).length,voteCount:room.votes.size,eligibleCount:room.participants.size,
    result:room.phase==='results' ? room.result : null, wordStats:stats() };
}
function broadcast(room) { io.to('room:'+room.code).emit('room:state',publicState(room)); }
function reply(ack, o) { if(typeof ack==='function') ack(o); }
function fail(ack,msg) { reply(ack,{ok:false,error:msg}); }
function getPlayer(socket,room) { const p=room?.players.get(socket.data.playerId); return p?.socketId===socket.id ? p : null; }
function hostOnly(socket, code, ack) {
  const room=rooms.get(code);
  if(!room || room.hostToken!==socket.data.hostToken || socket.data.room!==code || room.hostSocket!==socket.id) { fail(ack,'Only the host can do this.'); return null; }
  return room;
}
function giveRole(socket,room,p) {
  if(room.phase==='lobby' || !room.participants.has(p.id)) return;
  socket.emit('player:role',{round:room.round,imposter:room.imposterId===p.id,word:room.imposterId===p.id?null:room.word});
}
app.use(express.static(path.join(__dirname,'public')));
app.get('/api/network',(_req,res)=>{
  const ips=[];
  for(const entries of Object.values(os.networkInterfaces())) for(const addr of entries||[]) if(addr.family==='IPv4'&&!addr.internal) ips.push(`http://${addr.address}:${PORT}`);
  res.json({urls:ips});
});
app.get('/api/qr',async(req,res)=>{
  const url=String(req.query.url||'');
  if(!/^https?:\/\//.test(url) || url.length>500) return res.status(400).end();
  res.type('png');
  try { res.send(await QRCode.toBuffer(url,{width:380,margin:2,color:{dark:'#111729',light:'#ffffff'}})); }
  catch { res.status(500).end(); }
});
io.on('connection',socket=>{
  socket.on('host:create',(_data,ack)=>{
    if(socket.data.room) return fail(ack,'This tab is already associated with a game. Open another tab to create a new room.');
    const code=roomCode(), hostToken=token();
    const room={code,hostToken,hostSocket:socket.id,players:new Map(),phase:'lobby',round:0,
      word:null,imposterId:null,participants:new Set(),votes:new Map(),result:null,starting:false};
    rooms.set(code,room); socket.data.room=code;socket.data.hostToken=hostToken;
    socket.join('room:'+code);
    reply(ack,{ok:true,code,hostToken,state:publicState(room)});broadcast(room);
  });
  socket.on('host:resume',({code,hostToken}={},ack)=>{
    const room=rooms.get(String(code||''));
    if(!room||room.hostToken!==hostToken) return fail(ack,'Host session expired. Create a new room.');
    if(socket.data.room && socket.data.room!==room.code) socket.leave('room:'+socket.data.room);
    socket.data.room=room.code;socket.data.hostToken=hostToken;room.hostSocket=socket.id;
    socket.join('room:'+room.code);reply(ack,{ok:true,state:publicState(room)});broadcast(room);
  });
  socket.on('host:sync',({code,hostToken}={},ack)=>{
    const room=rooms.get(String(code||''));
    if(!room || room.hostToken!==hostToken) return fail(ack,'Room is no longer available. Create a new room and have players join it.');
    // Only the current host tab may control this room. A returning tab must resume explicitly.
    if(room.hostSocket!==socket.id) return fail(ack,'This is not the active host tab. Close other host tabs, then refresh this tab.');
    socket.join('room:'+room.code);
    reply(ack,{ok:true,state:publicState(room)});
  });
  socket.on('player:join',({code,name,playerToken}={},ack)=>{
    const room=rooms.get(String(code||''));
    if(!room) return fail(ack,'Room not found. Check the code.');
    name=String(name||'').trim().slice(0,22);
    if(!name) return fail(ack,'Enter a player name.');
    let p=[...room.players.values()].find(p=>p.token===playerToken);
    if(!p) {
      if(room.phase!=='lobby') return fail(ack,'This round has already started. Join next game.');
      if(room.players.size>=20) return fail(ack,'This room is full (20 players).');
      if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase())) return fail(ack,'That name is taken.');
      p={id:token().slice(0,12),token:token(),name,socketId:null};room.players.set(p.id,p);
    }
    if(socket.data.playerId && (socket.data.room!==room.code || socket.data.playerId!==p.id)) return fail(ack,'This tab has already joined a player. Open another tab to switch players.');
    if(p.socketId && p.socketId!==socket.id) io.sockets.sockets.get(p.socketId)?.disconnect(true);
    p.socketId=socket.id;socket.data.room=room.code;socket.data.playerId=p.id;
    socket.join('room:'+room.code);
    reply(ack,{ok:true,id:p.id,playerToken:p.token,name:p.name,code:room.code});
    socket.emit('room:state',publicState(room));giveRole(socket,room,p);broadcast(room);
  });
  socket.on('host:start',async({code}={},ack)=>{
    const room=hostOnly(socket,String(code||''),ack);if(!room)return;
    if(!['lobby','results'].includes(room.phase)||room.starting) return fail(ack,'Finish this round first.');
    const participants=[...room.players.values()].filter(p=>p.socketId);
    if(participants.length<3) return fail(ack,`Only ${participants.length} of ${room.players.size} registered players are connected. At least 3 connected player phones are required. The host screen does not count as a player; join from another phone if you want to play.`);
    room.starting=true;
    try {
      const word=await nextWord();
      // The original host might have refreshed while waiting for storage.
      if(room.hostSocket!==socket.id) return fail(ack,'Host session changed. Refresh the host page.');
      const currentParticipants=participants.filter(p=>p.socketId && io.sockets.sockets.has(p.socketId));
      if(currentParticipants.length<3) return fail(ack,'A player disconnected while starting the round. Reconnect at least 3 players and try again.');
      room.round++;room.phase='clues';room.votes=new Map();room.result=null;
      room.participants=new Set(currentParticipants.map(p=>p.id));room.word=word;
      room.imposterId=currentParticipants[rand(currentParticipants.length)].id;
      for(const p of currentParticipants){const s=io.sockets.sockets.get(p.socketId);if(s)giveRole(s,room,p);}
      broadcast(room);reply(ack,{ok:true});
    } catch(e){ console.error('Could not save word history:',e);fail(ack,'Could not save word history. Check server storage.'); }
    finally {room.starting=false;}
  });
  socket.on('host:vote',({code}={},ack)=>{
    const room=hostOnly(socket,String(code||''),ack);if(!room)return;
    if(room.phase!=='clues') return fail(ack,'Not in clue phase.');
    room.phase='voting';broadcast(room);reply(ack,{ok:true});
  });
  socket.on('player:vote',({id}={},ack)=>{
    const room=rooms.get(socket.data.room);const p=getPlayer(socket,room);
    if(!p) return fail(ack,'Player not found.');
    if(room.phase!=='voting')return fail(ack,'Voting is not open.');
    if(!room.participants.has(p.id))return fail(ack,'You were not part of this round.');
    if(id===p.id || !room.participants.has(id))return fail(ack,'Invalid choice.');
    if(room.votes.has(p.id))return fail(ack,'You already voted.');
    room.votes.set(p.id,id);broadcast(room);reply(ack,{ok:true});
  });
  socket.on('host:reveal',({code}={},ack)=>{
    const room=hostOnly(socket,String(code||''),ack);if(!room)return;
    if(room.phase!=='voting')return fail(ack,'Voting has not started.');
    const tally={};for(const id of room.votes.values())tally[id]=(tally[id]||0)+1;
    const top=Math.max(0,...Object.values(tally));
    const leaders=Object.keys(tally).filter(id=>tally[id]===top);
    const unique=leaders.length===1&&top>0;
    room.result={word:room.word,imposterId:room.imposterId,imposterName:room.players.get(room.imposterId)?.name||'Unknown',
      tally,correct:unique&&leaders[0]===room.imposterId,leaders,unique};
    room.phase='results';broadcast(room);reply(ack,{ok:true});
  });
  socket.on('host:reset',({code}={},ack)=>{
    const room=hostOnly(socket,String(code||''),ack);if(!room)return;
    if(room.phase!=='results')return fail(ack,'Reveal the results first.');
    room.phase='lobby';room.word=null;room.imposterId=null;room.participants.clear();room.votes.clear();room.result=null;
    broadcast(room);reply(ack,{ok:true});
  });
  socket.on('disconnect',()=>{
    const room=rooms.get(socket.data.room);if(!room)return;
    const p=getPlayer(socket,room);
    if(p){p.socketId=null;broadcast(room);}
    // Host can reload or reconnect; keep the room in memory until server restart.
  });
});
initialize().then(()=>server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\nImposter Party host: http://localhost:${PORT}/host.html`);
  for(const entries of Object.values(os.networkInterfaces())) for(const a of entries||[])if(a.family==='IPv4'&&!a.internal) console.log(`On your Wi-Fi: http://${a.address}:${PORT}/host.html`);
})).catch(err=>{console.error('Unable to initialize word history:',err);process.exit(1);});
