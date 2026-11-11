const socket=io();const $=id=>document.getElementById(id);const t=s=>I18N.t(s);
const codeFromUrl=new URLSearchParams(location.search).get('room');$('room').value=codeFromUrl||'';
// Each browser tab now owns its player identity independently.
let session=null,state=null,role=null,selected=null,shown=false;
try{session=JSON.parse(sessionStorage.getItem('imposter-player-session')||'null');}catch{}
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function word(w){return typeof w==='object'?(w[I18N.lang]||w.en):w||'';}
function join(resume=false){const code=resume?session?.code:$('room').value.trim(),name=resume?session?.name:$('name').value.trim(),playerToken=resume?session?.playerToken:undefined;
 socket.emit('player:join',{code,name,playerToken},r=>{
 if(!r?.ok){if(resume){session=null;sessionStorage.removeItem('imposter-player-session');$('join').classList.remove('hidden');$('play').classList.add('hidden');$('joinError').textContent=r?.error||'This session is already active in another tab.';}else $('joinError').textContent=r?.error||'Unable to join.';return;}
 // Do not reset the role after the server has already sent it on this connection.
 if(session?.code!==r.code||session?.id!==r.id){state=null;role=null;shown=false;selected=null;}
 session={code:r.code,name:r.name,playerToken:r.playerToken,id:r.id};sessionStorage.setItem('imposter-player-session',JSON.stringify(session));$('join').classList.add('hidden');$('play').classList.remove('hidden');$('welcome').textContent=`${t('Hi,')} ${session.name}`;$('joinError').textContent='';if(state)render(state);
 });}
function render(s){if(!session||s.code!==session.code)return;let prevRound=state?.round;state=s;
 if(prevRound!==undefined&&prevRound!==s.round){if(role?.round!==s.round)role=null;shown=false;selected=null;$('voteError').textContent='';}
 const me=s.players.find(p=>p.id===session.id),playing=!!me?.active;
 $('phase').textContent=t(s.phase.toUpperCase());$('round').textContent=t('ROUND')+' '+s.round;
 $('secretCard').classList.toggle('hidden',!playing||!['clues','voting'].includes(s.phase));$('voteCard').classList.toggle('hidden',!playing||s.phase!=='voting');$('results').classList.toggle('hidden',s.phase!=='results');
 if(s.phase==='lobby')$('instructions').textContent=`${t('Waiting for the host to start.')} ${s.players.length} ${t('player(s) in the room.')}`;
 if(s.phase==='clues')$('instructions').textContent=playing?t('Look at your private role. Take turns giving one-word clues. Do not say the secret word itself.'):t('Waiting for the host to start.');
 if(s.phase==='voting'){$('instructions').textContent=`${t('Time to vote!')} ${s.voteCount} ${t('of')} ${s.eligibleCount} ${t('votes received.')}`;
 $('voteOptions').innerHTML=s.players.filter(p=>p.active&&p.id!==session.id).map(p=>`<button class="vote ${selected===p.id?'selected':''}" data-id="${safe(p.id)}">${safe(p.name)}</button>`).join('');
 for(const btn of $('voteOptions').querySelectorAll('button'))btn.onclick=()=>{selected=btn.dataset.id;render(state);};
 $('voteBtn').disabled=!playing||!selected||!!me?.hasVoted;$('voteBtn').textContent=t(me?.hasVoted?'Vote submitted ✓':'Submit vote');}
 if(s.phase==='results'){const r=s.result;$('instructions').textContent=t('Round complete. Watch the host screen for the full voting breakdown.');
 $('results').innerHTML=`<div class="eyebrow">${t('THE REVEAL')}</div><div class="result" style="margin:18px 0">${safe(r.imposterName)} ${t('was the Imposter')}</div><div class="muted">${t('Secret word')}</div><div class="word">${safe(word(r.word))}</div><div class="winner ${r.correct?'':'loser'}">${t(r.correct?'Players win!':'Imposter wins!')}</div>`;}
 if(s.hostOnline===false&&s.phase!=='results')$('instructions').textContent+=' Host temporarily offline — waiting for reconnection (up to 2 minutes). / Anfitrión desconectado — esperando reconexión (hasta 2 minutos).';
 updateRole();}
function updateRole(){if(!state||!['clues','voting'].includes(state.phase))return;
 $('cover').classList.toggle('hidden',shown);$('secret').classList.toggle('hidden',!shown);
 if(!role||role.round!==state.round){$('cover').querySelector('h2').textContent=t('Loading your role...');$('reveal').disabled=true;return;}
 $('cover').querySelector('h2').textContent=t('Your secret is ready');$('reveal').disabled=false;
 $('secretCard').classList.toggle('imposter',shown&&role.imposter);$('secretCard').classList.toggle('civilian',shown&&!role.imposter);
 $('roleLabel').textContent=t(role.imposter?'YOU ARE THE IMPOSTER':'SECRET WORD');$('word').textContent=role.imposter?t('IMPOSTER'):word(role.word);
 $('roleText').textContent=t(role.imposter?'Blend in. Listen closely. Pretend you know the word.':'Give one word related to the secret. Do not say the word itself.');}
$('joinBtn').onclick=()=>join(false);$('name').addEventListener('keydown',e=>{if(e.key==='Enter')join(false)});
$('reveal').onclick=()=>{shown=true;updateRole()};$('hide').onclick=()=>{shown=false;updateRole()};
$('voteBtn').onclick=()=>{if(!selected||$('voteBtn').disabled)return;$('voteBtn').disabled=true;socket.emit('player:vote',{id:selected},r=>{$('voteError').textContent=r?.ok?t('Vote recorded.'):r?.error||'Vote failed.';if(!r?.ok)$('voteBtn').disabled=false;});};
socket.on('room:closed',r=>{
 if(!session || r?.code!==session.code)return;
 session=null;state=null;role=null;selected=null;shown=false;
 sessionStorage.removeItem('imposter-player-session');
 $('play').classList.add('hidden');$('join').classList.remove('hidden');
 $('joinError').textContent=r.message||'The host left. This room has ended. Join a new room.';
 $('room').value='';
});
socket.on('player:role',r=>{if(role?.round===r.round&&shown)return;role=r;updateRole()});socket.on('room:state',render);
socket.on('connect',()=>{$('connection').textContent='● '+t('Connected');if(session&&(!codeFromUrl||codeFromUrl===session.code))join(true);});socket.on('disconnect',()=>{$('connection').textContent='● '+t('Reconnecting...');});
window.addEventListener('languagechange',()=>{if(state)render(state);if(session)$('welcome').textContent=`${t('Hi,')} ${session.name}`;});
if(codeFromUrl&&session&&session.code!==codeFromUrl){session=null;sessionStorage.removeItem('imposter-player-session');}
