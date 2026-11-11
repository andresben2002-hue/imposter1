const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const os=require('os');
test('uses each bilingual word before repeating and retains history after reload',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imposter-words-'));process.env.DATA_DIR=dir;
 try {
  const store=require('./word-store');await store.initialize();const ids=new Set();
  for(let i=0;i<store.WORDS.length;i++){const w=await store.nextWord();assert.ok(w.en&&w.es);assert.equal(ids.has(w.id),false);ids.add(w.id);}
  assert.equal(store.stats().remaining,0);const next=await store.nextWord();assert.ok(next.id);assert.equal(store.stats().cycles,1);
  const stored=JSON.parse(fs.readFileSync(path.join(dir,'word-history.json')));assert.equal(stored.cycles,1);assert.equal(stored.used.length,1);
 } finally {delete process.env.DATA_DIR;fs.rmSync(dir,{recursive:true,force:true});}
});
