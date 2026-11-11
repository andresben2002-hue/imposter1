'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const WORDS = require('./words.json').map(([en,es]) => ({id:en.toLowerCase(),en,es}));
const ids = new Set();
for (const w of WORDS) { if (!w.en || !w.es || ids.has(w.id)) throw Error('Invalid/duplicate bilingual word: '+w.en); ids.add(w.id); }
const file = path.join(process.env.DATA_DIR || path.join(__dirname,'data'),'word-history.json');
const database = process.env.DATABASE_URL ? new (require('pg').Pool)({connectionString:process.env.DATABASE_URL, ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined}) : null;
let history = {used:[],recent:[],cycles:0};
const random = max => crypto.randomInt(max);
async function initialize() {
  if (database) {
    await database.query('CREATE TABLE IF NOT EXISTS imposter_word_history (id TEXT PRIMARY KEY, payload JSONB NOT NULL)');
    const rows=await database.query("SELECT payload FROM imposter_word_history WHERE id='global'");
    if (rows.rows.length) history=rows.rows[0].payload;
    console.log('Word history: PostgreSQL');
  } else {
    try {history=JSON.parse(await fs.readFile(file,'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
    console.log('Word history: '+file+' (set DATABASE_URL for persistent cloud hosting)');
  }
  history.used = [...new Set((history.used||[]).filter(id=>ids.has(id)))];
  history.recent = (history.recent||[]).filter(id=>ids.has(id)).slice(-Math.min(30,WORDS.length-1));
  history.cycles = Number(history.cycles)||0;
}
async function persist() {
  if (database) await database.query("INSERT INTO imposter_word_history(id,payload) VALUES('global',$1::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",[JSON.stringify(history)]);
  else {await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomBytes(5).toString('hex')+'.tmp'; await fs.writeFile(tmp,JSON.stringify(history,null,2));await fs.rename(tmp,file);}
}
// Call from a single Node server process. Each round awaits persistence before a word is sent.
async function selectWord() {
  const old=structuredClone(history);
  let candidates=WORDS.filter(w=>!history.used.includes(w.id));
  if (!candidates.length) {history.used=[];history.cycles++;candidates=WORDS;}
  let fresh=candidates.filter(w=>!history.recent.includes(w.id));
  if (!fresh.length) fresh=candidates;
  const picked=fresh[random(fresh.length)];
  history.used.push(picked.id);
  history.recent.push(picked.id);
  history.recent=history.recent.slice(-Math.min(30,WORDS.length-1));
  try {await persist();} catch(e) {history=old;throw e;}
  return picked;
}
let queued=Promise.resolve();
function nextWord(){const result=queued.then(selectWord);queued=result.then(()=>{},()=>{});return result;}
function stats(){return {total:WORDS.length,remaining:Math.max(0,WORDS.length-history.used.length),cycles:history.cycles};}
module.exports={initialize,nextWord,stats,WORDS};
