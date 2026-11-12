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
// Allow quick refreshes/temporary network drops without leaving an abandoned room online.
const HOST_DISCONNECT_GRACE_MS = Math.max(1000, Number(process.env.HOST_DISCONNECT_GRACE_MS) || 120000);
const { initialize, nextWord, stats } = require('./word-store');
const rand = (n) => crypto.randomInt(n);
const token = () => crypto.randomBytes(24).toString('hex');
function roomCode() { let c; do { c = crypto.randomInt(100000,999999).toString(); } while(rooms.has(c)); return c; }
function publicState(room) {
  const players = [...room.players.values()].map(p=>({id:p.id,name:p.name,online:!!p.socketId,active:room.participants.has(p.id),hasVoted:room.votes.has(p.id)}));
  return { code:room.code,phase:room.phase,round:room.round,players,onlineCount:players.filter(p=>p.online).length,voteCount:room.votes.size,eligibleCount:room.participants.size,hostOnline:!!(room.hostSocket&&io.sockets.sockets.has(room.hostSocket)),
    result:room.phase==='results' ? room.result : null, wordStats:stats() };
}
function broadcast(room) { io.to('room:'+room.code).emit('room:state',publicState(room)); }
function closeRoom(room, reason='The host left. This room has ended.') {
  if (rooms.get(room.code)!==room) return;
  if (room.closeTimer) { clearTimeout(room.closeTimer); room.closeTimer=null; }
  // Notify players, including other tabs on the same machine, before removing the room.
  io.to('room:'+room.code).emit('room:closed',{code:room.code,message:reason});
  rooms.delete(room.code);
  for (const p of room.players.values()) {
    const sock=p.socketId&&io.sockets.sockets.get(p.socketId);
    if(sock){sock.leave('room:'+room.code);sock.data.room=null;sock.data.playerId=null;}
  }
  const host=room.hostSocket&&io.sockets.sockets.get(room.hostSocket);
  if(host){host.leave('room:'+room.code);host.data.room=null;host.data.hostToken=null;}
}
function scheduleHostClosure(room, socketId) {
  if(room.hostSocket!==socketId) return;
  if(room.closeTimer) clearTimeout(room.closeTimer);
  room.closeTimer=setTimeout(()=>{
    room.closeTimer=null;
    if(room.hostSocket===socketId) closeRoom(room,'Host recovery period expired. This room has ended.');
  },HOST_DISCONNECT_GRACE_MS);
  room.closeTimer.unref?.();
}
function reply(ack, o) { if(typeof ack==='function') ack(o); }
function fail(ack,msg,errorCode) { reply(ack,{ok:false,error:msg,...(errorCode?{errorCode}:{})}); }
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
    const code=roomCode(), hostToken=token(), recoveryKey=token();
    const room={code,hostToken,recoveryKey,hostSocket:socket.id,players:new Map(),phase:'lobby',round:0,
      word:null,imposterId:null,participants:new Set(),votes:new Map(),result:null,starting:false,closeTimer:null};
    rooms.set(code,room); socket.data.room=code;socket.data.hostToken=hostToken;
    socket.join('room:'+code);
    reply(ack,{ok:true,code,hostToken,recoveryKey,state:publicState(room)});broadcast(room);
  });
  // An existing live host tab owns the room. A duplicated tab cannot seize it.
  socket.on('host:resume',({code,hostToken}={},ack)=>{
    const room=rooms.get(String(code||''));
    if(!room||room.hostToken!==hostToken) return fail(ack,'Host session expired. Use the recovery option or create a room.');
    if(socket.data.room && socket.data.room!==room.code) return fail(ack,'This tab already belongs to another room.');
    const active=room.hostSocket&&io.sockets.sockets.get(room.hostSocket);
    if(active&&active.id!==socket.id) return fail(ack,'Another host tab is currently active. This tab cannot take control.');
    if(room.closeTimer){clearTimeout(room.closeTimer);room.closeTimer=null;}
    socket.data.room=room.code;socket.data.hostToken=hostToken;room.hostSocket=socket.id;
    socket.join('room:'+room.code);reply(ack,{ok:true,state:publicState(room)});broadcast(room);
  });
  // Explicit recovery for a closed/lost host tab, but never while the original host is online.
  socket.on('host:recover',({code,recoveryKey}={},ack)=>{
    const room=rooms.get(String(code||''));
    if(!room||!recoveryKey||room.recoveryKey!==recoveryKey) return fail(ack,'Invalid room or recovery key.');
    if(socket.data.room && socket.data.room!==room.code) return fail(ack,'This tab already belongs to another room.');
    if(room.hostSocket&&io.sockets.sockets.has(room.hostSocket)) return fail(ack,'The original host is still connected. Recovery is not allowed.');
    if(room.closeTimer){clearTimeout(room.closeTimer);room.closeTimer=null;}
    room.hostToken=token();room.hostSocket=socket.id;
    socket.data.room=room.code;socket.data.hostToken=room.hostToken;
    socket.join('room:'+room.code);
    reply(ack,{ok:true,code:room.code,hostToken:room.hostToken,recoveryKey:room.recoveryKey,state:publicState(room)});
    broadcast(room);
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
    if(!room) return fail(ack,'Room not found. Check the code.','ROOM_NOT_FOUND');
    name=String(name||'').trim().slice(0,22);
    if(!name) return fail(ack,'Enter a player name.');
    let p=[...room.players.values()].find(p=>p.token===playerToken);
    const isNewPlayer=!p;
    if(!p) {
      // Late arrivals are ordinary players and can never become the Imposter in the current round.
      if(!['lobby','clues','voting'].includes(room.phase)) return fail(ack,'Wait for the next round to join.');
      if(room.players.size>=20) return fail(ack,'This room is full (20 players).');
      if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase())) return fail(ack,'That name is already registered. If you lost your saved session, ask the host to remove the offline player from the lobby.','NAME_TAKEN');
      p={id:token().slice(0,12),token:token(),name,socketId:null};room.players.set(p.id,p);
    }
    if(socket.data.playerId && (socket.data.room!==room.code || socket.data.playerId!==p.id)) return fail(ack,'This tab has already joined a player. Open another tab to switch players.');
    if(p.socketId && p.socketId!==socket.id && io.sockets.sockets.has(p.socketId)) return fail(ack,'Previous connection is still active. Reconnecting automatically; keep this tab open.','PLAYER_ACTIVE');
    p.socketId=socket.id;socket.data.room=room.code;socket.data.playerId=p.id;
    // Assign a late arrival to the current round without changing the existing Imposter.
    // This also allows late players to vote if voting is already underway.
    if(isNewPlayer && (room.phase==='clues'||room.phase==='voting')) room.participants.add(p.id);
    socket.join('room:'+room.code);
    reply(ack,{ok:true,id:p.id,playerToken:p.token,name:p.name,code:room.code});
    socket.emit('room:state',publicState(room));giveRole(socket,room,p);broadcast(room);
  });
  socket.on('host:remove-player',({code,id}={},ack)=>{
    const room=hostOnly(socket,String(code||''),ack);if(!room)return;
    if(room.phase!=='lobby'&&room.phase!=='results')return fail(ack,'Wait for the round to end before removing players.');
    const p=room.players.get(String(id||''));
    if(!p)return fail(ack,'Player no longer exists.');
    if(p.socketId&&io.sockets.sockets.has(p.socketId))return fail(ack,'This player is connected. Ask them to leave first.');
    room.players.delete(p.id);room.participants.delete(p.id);room.votes.delete(p.id);
    reply(ack,{ok:true});broadcast(room);
  });
  // start: new round and randomly choose an imposter.
  // reroll: new word, keep the same imposter, return to clues and erase all votes.
  // restart: new word AND freshly choose the imposter, return to clues.
  async function beginRound(socket, code, ack, mode) {
    const room=hostOnly(socket,String(code||''),ack);if(!room)return;
    const isNew=mode==='start';
    if(room.starting)return fail(ack,'A round update is already in progress.');
    if(isNew && !['lobby','results'].includes(room.phase))return fail(ack,'Finish this round first, or use reroll/restart.');
    if(!isNew && !['clues','voting'].includes(room.phase))return fail(ack,'You can only reroll or restart during clues or voting.');
    const connected=[...room.players.values()].filter(p=>p.socketId && io.sockets.sockets.has(p.socketId));
    if(connected.length<3)return fail(ack,`Only ${connected.length} of ${room.players.size} registered players are connected. At least 3 connected player phones are required.`);
    room.starting=true;
    try {
      const next=await nextWord();
      if(rooms.get(room.code)!==room || room.hostSocket!==socket.id)return fail(ack,'Host session changed. Refresh the host page.');
      const live=connected.filter(p=>p.socketId && io.sockets.sockets.has(p.socketId));
      if(live.length<3)return fail(ack,'A player disconnected. Reconnect at least 3 players and try again.');
      // The active group includes players who joined while the new word was being loaded.
      const allLive=[...room.players.values()].filter(p=>p.socketId&&io.sockets.sockets.has(p.socketId));
      const previousImposter=room.imposterId;
      const keepImposter=mode==='reroll' && allLive.some(p=>p.id===previousImposter);
      room.round++;
      room.phase='clues';room.votes=new Map();room.result=null;
      room.participants=new Set(allLive.map(p=>p.id));room.word=next;
      room.imposterId=keepImposter?previousImposter:allLive[rand(allLive.length)].id;
      for(const p of allLive){const connectedSocket=io.sockets.sockets.get(p.socketId);if(connectedSocket)giveRole(connectedSocket,room,p);}
      broadcast(room);reply(ack,{ok:true});
    }catch(e){console.error('Could not save word history:',e);fail(ack,'Could not save word history. Check server storage.');}
    finally{room.starting=false;}
  }
  socket.on('host:start',({code}={},ack)=>beginRound(socket,code,ack,'start'));
  socket.on('host:reroll',({code}={},ack)=>beginRound(socket,code,ack,'reroll'));
  socket.on('host:restart',({code}={},ack)=>beginRound(socket,code,ack,'restart'));
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
    // If the host tab closes, end its room after a short refresh/reconnect grace period.
    scheduleHostClosure(room,socket.id);
    if(room.hostSocket===socket.id) broadcast(room);
  });
});
initialize().then(()=>server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\nImposter Party host: http://localhost:${PORT}/host.html`);
  for(const entries of Object.values(os.networkInterfaces())) for(const a of entries||[])if(a.family==='IPv4'&&!a.internal) console.log(`On your Wi-Fi: http://${a.address}:${PORT}/host.html`);
})).catch(err=>{console.error('Unable to initialize word history:',err);process.exit(1);});
