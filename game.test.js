const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');const crypto=require('crypto');
function setup(){
 const sockets=new Map();let onConnect;const server={listen(){}};
 const io={sockets:{sockets},on(ev,fn){if(ev==='connection')onConnect=fn;},to(room){return{emit(ev,arg){for(const s of sockets.values())if(s.joined.has(room))s.emit(ev,arg)}}}};
 const fakeExpress=()=>({use(){},get(){}});fakeExpress.static=()=>{};
 const fakeRequire=x=>x==='express'?fakeExpress:x==='http'?{createServer:()=>server}:x==='socket.io'?{Server:class{constructor(){return io}}}:x==='qrcode'?{toBuffer:async()=>Buffer.from('')}:x==='./word-store'?{initialize:async()=>{},nextWord:async()=>({en:'Beach',es:'Playa',id:'beach'}),stats:()=>({total:270,remaining:269,cycles:0})}:require(x);
 vm.runInNewContext(fs.readFileSync(__dirname+'/server.js','utf8'),{require:fakeRequire,__dirname,process,console,Buffer});
 function connect(){const listeners={},events=[];const s={id:crypto.randomUUID(),data:{},joined:new Set(),on(e,cb){listeners[e]=cb},join(r){this.joined.add(r)},leave(r){this.joined.delete(r)},emit(e,v){events.push({e,v})},disconnect(){sockets.delete(this.id);listeners.disconnect?.()},call(e,arg={}){return new Promise((resolve,reject)=>{try{listeners[e](arg,r=>resolve(r));}catch(err){reject(err)}})},events};sockets.set(s.id,s);onConnect(s);return s;}
 return {connect};
}
test('private bilingual roles, voting and result',async()=>{
 const {connect}=setup(),host=connect(),c=await host.call('host:create');assert.equal(c.ok,true);
 const players=[];for(let i=0;i<3;i++){const s=connect(),j=await s.call('player:join',{code:c.code,name:'P'+i});assert.equal(j.ok,true);players.push({s,...j});}
 assert.equal((await host.call('host:start',{code:c.code})).ok,true);
 const roles=players.map(p=>p.s.events.find(e=>e.e==='player:role')?.v);assert.equal(roles.length,3);assert.equal(roles.filter(r=>r.imposter).length,1);
 assert.equal(roles.filter(r=>!r.imposter).every(r=>r.word.en==='Beach'&&r.word.es==='Playa'),true);
 assert.equal(host.events.some(e=>e.e==='player:role'),false);
 assert.equal((await host.call('host:vote',{code:c.code})).ok,true);
 assert.equal((await players[0].s.call('player:vote',{id:players[0].id})).ok,false);
 assert.equal((await players[0].s.call('player:vote',{id:players[1].id})).ok,true);
 assert.equal((await players[0].s.call('player:vote',{id:players[2].id})).ok,false);
 assert.equal((await host.call('host:reveal',{code:c.code})).ok,true);
 assert.equal((await host.call('host:reset',{code:c.code})).ok,true);
});
test('offline participants excluded; old host loses authority',async()=>{
 const {connect}=setup(),host=connect(),c=await host.call('host:create'),players=[];
 for(let i=0;i<4;i++){const s=connect();players.push({s,...await s.call('player:join',{code:c.code,name:'P'+i})});}
 await host.call('host:start',{code:c.code});await host.call('host:vote',{code:c.code});await host.call('host:reveal',{code:c.code});await host.call('host:reset',{code:c.code});
 players[3].s.disconnect();assert.equal((await host.call('host:start',{code:c.code})).ok,true);
 const reconnect=connect();assert.equal((await reconnect.call('player:join',{code:c.code,name:'P3',playerToken:players[3].playerToken})).ok,true);
 assert.equal(reconnect.events.some(e=>e.e==='player:role'),false);
 await host.call('host:vote',{code:c.code});assert.equal((await reconnect.call('player:vote',{id:players[0].id})).ok,false);
 const newHost=connect();assert.equal((await newHost.call('host:resume',{code:c.code,hostToken:c.hostToken})).ok,true);
 assert.equal((await host.call('host:reveal',{code:c.code})).ok,false);
 assert.equal((await newHost.call('host:reveal',{code:c.code})).ok,true);
});
test('host reports actual connected players and requires three live player sessions',async()=>{
 const {connect}=setup(), host=connect(), created=await host.call('host:create');
 const players=[];
 for(let i=0;i<3;i++){
   const s=connect(), joined=await s.call('player:join',{code:created.code,name:'Guest'+i});
   assert.equal(joined.ok,true); players.push({s,...joined});
 }
 let state=host.events.filter(e=>e.e==='room:state').at(-1).v;
 assert.equal(state.players.length,3);assert.equal(state.onlineCount,3);
 players[2].s.disconnect();
 state=host.events.filter(e=>e.e==='room:state').at(-1).v;
 assert.equal(state.players.length,3);assert.equal(state.onlineCount,2);
 const rejected=await host.call('host:start',{code:created.code});
 assert.equal(rejected.ok,false);
 assert.match(rejected.error,/Only 2 of 3 registered players are connected/);
 const reconnected=connect();
 const res=await reconnected.call('player:join',{code:created.code,name:'Guest2',playerToken:players[2].playerToken});
 assert.equal(res.ok,true);
 assert.equal(host.events.filter(e=>e.e==='room:state').at(-1).v.onlineCount,3);
 assert.equal((await host.call('host:start',{code:created.code})).ok,true);
 assert.equal(host.events.filter(e=>e.e==='room:state').at(-1).v.phase,'clues');
});
