const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'public');
function createHostDOM(){
 const html=fs.readFileSync(path.join(root,'host.html'),'utf8');
 const names=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const nodes=new Map(names.map(id=>[id,{textContent:'',value:'',disabled:false,href:'',src:'',onclick:null,style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelectorAll(){return [];}}]));
 const handlers={};const store=new Map();
 const socket={connected:true,on(event,fn){handlers[event]=fn;},emit(event,payload,ack){if(event==='host:create')ack({ok:true,code:'123456',hostToken:'token',state:{code:'123456',phase:'lobby',round:0,players:[],onlineCount:0,voteCount:0,eligibleCount:0,wordStats:{remaining:270,total:270,cycles:0}}});else if(event==='host:start')ack({ok:true});},timeout(){return this;}};
 const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const document={getElementById:id=>nodes.get(id)||null};
 const context={document,sessionStorage,location:{origin:'https://game.example',hostname:'game.example'},io:()=>socket,I18N:{lang:'en',t:s=>s},window:{addEventListener(){}},fetch:async()=>({json:async()=>({urls:[]})}),setInterval(){},setTimeout(){},navigator:{clipboard:{writeText:async()=>{}}},console};
 return {nodes,handlers,context};
}
test('host page defines all element IDs referenced by host.js',()=>{
 const js=fs.readFileSync(path.join(root,'host.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'host.html'),'utf8');
 const ids=[...js.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
 for(const id of ids)assert.match(html,new RegExp(`\\bid="${id}"`),`Missing ${id} in host.html`);
});
test('three connected players allow host to start round and progress through phases',()=>{
 const {nodes,context,handlers}=createHostDOM();
 vm.runInNewContext(fs.readFileSync(path.join(root,'host.js'),'utf8'),context);
 nodes.get('create').onclick();
 const lobby={code:'123456',phase:'lobby',round:0,players:['A','B','C'].map((name,i)=>({id:String(i),name,online:true,active:false,hasVoted:false})),onlineCount:3,voteCount:0,eligibleCount:0,wordStats:{remaining:270,total:270,cycles:0}};
 assert.doesNotThrow(()=>handlers['room:state'](lobby));
 assert.equal(nodes.get('primary').disabled,false);
 assert.equal(nodes.get('primary').textContent,'Start round');
 nodes.get('primary').onclick();
 assert.doesNotThrow(()=>handlers['room:state']({...lobby,phase:'clues',round:1}));
 assert.equal(nodes.get('primary').textContent,'Open voting');
 assert.equal(nodes.get('primary').disabled,false);
 assert.doesNotThrow(()=>handlers['room:state']({...lobby,phase:'voting',round:1}));
 assert.equal(nodes.get('primary').textContent,'Reveal Imposter');
});
