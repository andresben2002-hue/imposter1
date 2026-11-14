const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const root=path.join(__dirname,'public');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function translator(lang){const env={localStorage:{getItem:()=>lang,setItem:()=>{}},window:{dispatchEvent:()=>{}},document:{addEventListener:()=>{},querySelectorAll:()=>[],documentElement:{},body:{dataset:{}}},Event:function(){}};vm.runInNewContext(read('i18n.js'),env);return env.window.I18N;}
test('all tagged labels, placeholders and accessibility text have Spanish translations',()=>{
 const tr=translator('es');for(const file of ['index.html','player.html','host.html']){
  const missing=[...read(file).matchAll(/data-i18n(?:-placeholder|-aria|-title)?="([^"]+)"/g)].map(m=>m[1]).filter(x=>tr.t(x)===x&&x!=='IMPOSTOR');
  assert.deepEqual(missing,[],`${file} untranslated: ${missing.join('; ')}`);
 }
});
test('language selector shows neutral codes; no bilingual slash labels',()=>{
 for(const file of ['index.html','host.html','player.html']){
  const html=read(file);assert.match(html,/<option value="en">EN<\/option>/);assert.match(html,/<option value="es">ES<\/option>/);
  assert.doesNotMatch(html,/>[^<]*English\s*\/\s*Espa[nñ]ol/);
 }
 assert.doesNotMatch(read('host.js'),/New word \/ Nueva palabra|Restart round \/ Reiniciar ronda/);
});
test('single sequential pass screen names the recipient and hides roles between players',()=>{
 const html=read('player.html'),js=read('player.js');
 for(const id of ['passName','passReveal','passClueInput','passSubmit','passPrivate','passHandoff','passNext','passHide'])assert.match(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(html,/id="sharedChoices"|id="sharedActions"|id="sharedHide"/);
 assert.match(js,/passStep='cover'/);assert.match(js,/passStep='private'/);assert.match(js,/passStep='done'/);
 assert.match(js,/hidePassSecret\(\);shown=false/);
 assert.match(js,/passSeat!==requestedId/);
 assert.match(js,/state\?\.round!==requestedRound/);
 assert.match(js,/passSeats\(state\)\.some/);
});
test('shared-player vote can be explicitly changed; private display can always be concealed',()=>{
 const js=read('player.js');assert.match(js,/passVoteEditing\.add\(p.id\)/);assert.match(js,/passVoteEditing\.delete\(id\)/);assert.match(js,/passVoteEditing\.has\(p.id\)/);
 assert.match(js,/\$\('passHide'\)\.onclick/);
});
