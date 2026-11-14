const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');const crypto=require('crypto');
function setup(){const sockets=new Map();let onConnect;const io={sockets:{sockets},on(e,fn){if(e==='connection')onConnect=fn;},to(room){return{emit(e,v){for(const s of sockets.values())if(s.joined.has(room))s.emit(e,v);}}}};
const express=()=>({use(){},get(){}});express.static=()=>{};const fakeRequire=x=>x==='express'?express:x==='http'?{createServer:()=>({listen(){}})}:x==='socket.io'?{Server:class{constructor(){return io;}}}:x==='qrcode'?{toBuffer:async()=>Buffer.from('')}:x==='./word-store'?{initialize:async()=>{},nextWord:async()=>({en:'Beach',es:'Playa'}),stats:()=>({total:270,remaining:100,cycles:0})}:require(x);
vm.runInNewContext(fs.readFileSync(__dirname+'/server.js','utf8'),{require:fakeRequire,__dirname,process,console,Buffer,setTimeout,clearTimeout});
return{connect(){const handlers={},events=[];const s={id:crypto.randomUUID(),data:{},joined:new Set(),on(e,fn){handlers[e]=fn},join(r){this.joined.add(r)},leave(r){this.joined.delete(r)},emit(e,v){events.push({e,v})},events,call(e,arg={}){return new Promise((resolve,reject)=>{try{handlers[e](arg,r=>resolve(r))}catch(err){reject(err)}})},disconnect(){sockets.delete(this.id);handlers.disconnect?.()}};sockets.set(s.id,s);onConnect(s);return s}};}
function state(host){return host.events.filter(e=>e.e==='room:state').at(-1)?.v;}
test('one phone controls four distinct players and protected individual secrets',async()=>{
const {connect}=setup(),h=connect(),created=await h.call('host:create'),code=created.code,phone=connect();
const owner=await phone.call('player:join',{code,name:'Phone owner'});assert.equal(owner.ok,true);
const extras=[];for(let i=0;i<3;i++){const r=await h.call('host:add-managed',{code,name:'Friend '+i,controllerId:owner.id});assert.equal(r.ok,true);extras.push(r.id)}
assert.equal(state(h).onlineCount,4);assert.equal(state(h).players.length,4);
assert.equal((await h.call('host:start',{code})).ok,true);
for(const id of extras){const role=await phone.call('managed:role',{id});assert.equal(role.ok,true);assert.equal(role.round,1);assert.equal('word' in role,true)}
const intruder=connect();assert.equal((await intruder.call('managed:role',{id:extras[0]})).ok,false);
assert.equal((await phone.call('managed:clue',{id:extras[0],text:'Ocean'})).ok,true);
for(let i=1;i<3;i++)assert.equal((await phone.call('managed:clue',{id:extras[i],text:'Sand'})).ok,true);
assert.equal((await phone.call('player:clue',{text:'Sea'})).ok,true);
assert.equal(state(h).clueCount,4);assert.equal((await h.call('host:vote',{code,seconds:300})).ok,true);
for(const id of extras)assert.equal((await phone.call('managed:vote',{id,targetId:owner.id})).ok,true);
assert.equal(state(h).voteCount,3);
assert.equal((await phone.call('managed:vote',{id:extras[0],targetId:extras[1]})).ok,true);
assert.equal(state(h).voteCount,3);
assert.equal((await h.call('host:reveal',{code})).ok,true);
});
test('host-managed participant can play while offline and be corrected by host',async()=>{
const {connect}=setup(),h=connect(),c=await h.call('host:create'),phone=connect();const owner=await phone.call('player:join',{code:c.code,name:'A'});
const b=await h.call('host:add-managed',{code:c.code,name:'B'}),d=await h.call('host:add-managed',{code:c.code,name:'C'});
assert.equal(state(h).onlineCount,3);
assert.equal((await h.call('host:start',{code:c.code})).ok,true);
assert.equal((await h.call('managed:role',{id:b.id})).ok,true);
assert.equal((await phone.call('managed:role',{id:b.id})).ok,false);
assert.equal((await h.call('host:edit-clue',{code:c.code,id:b.id,text:'Air'})).ok,true);
assert.equal((await h.call('managed:clue',{id:d.id,text:'Water'})).ok,true);
assert.equal((await phone.call('player:clue',{text:'Wind'})).ok,true);
assert.equal((await h.call('host:vote',{code:c.code,seconds:90})).ok,true);
assert.equal((await h.call('host:edit-vote',{code:c.code,id:b.id,targetId:owner.id})).ok,true);
assert.equal((await h.call('host:edit-vote',{code:c.code,id:b.id,targetId:d.id})).ok,true);
assert.equal(state(h).voteCount,1);
});
test('shared player changes controllers without leaking roles; host-only management and names are unique',async()=>{
const {connect}=setup(),h=connect(),c=await h.call('host:create'),a=connect(),b=connect();
const pa=await a.call('player:join',{code:c.code,name:'A'}),pb=await b.call('player:join',{code:c.code,name:'B'});
const id=(await h.call('host:add-managed',{code:c.code,name:'C',controllerId:pa.id})).id;
assert.equal((await h.call('host:add-managed',{code:c.code,name:'c'})).ok,false);
assert.equal((await b.call('host:assign-managed',{code:c.code,id,controllerId:pb.id})).ok,false);
assert.equal((await h.call('host:assign-managed',{code:c.code,id,controllerId:pb.id})).ok,true);
assert.equal((await h.call('host:start',{code:c.code})).ok,true);
assert.equal((await a.call('managed:role',{id})).ok,false);
assert.equal((await b.call('managed:role',{id})).ok,true);
assert.equal((await h.call('host:edit-vote',{code:c.code,id,targetId:pa.id})).ok,false);
});

test('host cannot assign a shared participant to an offline phone',async()=>{
 const {connect}=setup(),host=connect(),created=await host.call('host:create'),a=connect(),b=connect();
 const owner=await a.call('player:join',{code:created.code,name:'Owner'});
 const other=await b.call('player:join',{code:created.code,name:'Other'});
 const shared=(await host.call('host:add-managed',{code:created.code,name:'Friend',controllerId:owner.id})).id;
 b.disconnect();
 const bad=await host.call('host:assign-managed',{code:created.code,id:shared,controllerId:other.id});
 assert.equal(bad.ok,false);
 assert.equal(state(host).players.find(p=>p.id===shared).controllerId,owner.id);
 assert.equal((await host.call('host:add-managed',{code:created.code,name:'Offline friend',controllerId:other.id})).ok,false);
 assert.equal((await host.call('host:assign-managed',{code:created.code,id:shared,controllerId:null})).ok,true);
 assert.equal(state(host).players.find(p=>p.id===shared).online,true);
});

test('shared-phone and host role reveals discard stale asynchronous responses',()=>{
 const playerSource=fs.readFileSync(__dirname+'/public/player.js','utf8');
 const hostSource=fs.readFileSync(__dirname+'/public/host.js','utf8');
 assert.match(playerSource,/activeShared!==requestedId/);
 assert.match(playerSource,/state\?\.round!==requestedRound/);
 assert.match(playerSource,/stillControlled/);
 assert.match(hostSource,/state\?\.round!==requestedRound/);
 assert.match(hostSource,/managePrivateText'\)\.textContent=''/);
});

test('host vote editor remains outside player list, avoiding destruction by state redraws',()=>{
 const html=fs.readFileSync(__dirname+'/public/host.html','utf8');
 const js=fs.readFileSync(__dirname+'/public/host.js','utf8');
 assert.match(html,/<div id="manageList"><\/div><div id="managed-vote-editor"/);
 assert.doesNotMatch(js,/closest\('\.player'\)\.appendChild\(editor\)/);
});
