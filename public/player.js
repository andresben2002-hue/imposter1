const socket=io();const $=id=>document.getElementById(id);const t=s=>I18N.t(s);
const codeFromUrl=new URLSearchParams(location.search).get('room');$('room').value=codeFromUrl||'';
// Each browser tab now owns its player identity independently.
let session=null,state=null,role=null,selected=null,shown=false,cluePending=false,votePending=false;
try{session=JSON.parse(sessionStorage.getItem('imposter-player-session')||'null');}catch{}
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function word(w){return typeof w==='object'?(w[I18N.lang]||w.en):w||'';}
// On refresh the old Socket.IO connection can remain visible briefly on the server.
// Keep the resume token and retry instead of destroying the only proof of identity.
let resumeTimer=null, resumeAttempt=0, resumeInFlight=false;
function cancelResume(){if(resumeTimer)clearTimeout(resumeTimer);resumeTimer=null;resumeInFlight=false;}
function scheduleResume(){
 if(!session||!socket.connected)return;
 const wait=Math.min(3500,800+resumeAttempt*350);
 resumeTimer=setTimeout(()=>{resumeTimer=null;join(true);},wait);
}
function join(resume=false){
 if(resume&&(!session||!socket.connected||resumeInFlight))return;
 const code=resume?session.code:$('room').value.trim();
 const name=resume?session.name:$('name').value.trim();
 const playerToken=resume?session.playerToken:undefined;
 if(resume)resumeInFlight=true;
 socket.timeout(10000).emit('player:join',{code,name,playerToken},(err,r)=>{
  if(resume)resumeInFlight=false;
  if(err){
   $('joinError').textContent='Connection timed out. Retrying... / Conexión agotada. Reintentando...';
   if(resume){resumeAttempt++;scheduleResume();}
   return;
  }
  if(!r?.ok){
   // A refresh can create the new connection before the old one times out.
   // A duplicated tab is also denied; it must never steal the active session.
   if(resume){
    $('joinError').textContent=r?.error||'Reconnecting...';
    if(r?.errorCode==='PLAYER_ACTIVE'){
     resumeAttempt++;scheduleResume();
     $('connection').textContent='● Waiting for previous connection to close / Esperando desconexión anterior';
    } else if(r?.errorCode==='ROOM_NOT_FOUND'){
     cancelResume();session=null;sessionStorage.removeItem('imposter-player-session');
     $('join').classList.remove('hidden');$('play').classList.add('hidden');
    } else {resumeAttempt++;scheduleResume();}
   }else $('joinError').textContent=r?.error||'Unable to join.';
   return;
  }
  cancelResume();resumeAttempt=0;
  if(session?.code!==r.code||session?.id!==r.id){state=null;role=null;shown=false;selected=null;}
  session={code:r.code,name:r.name,playerToken:r.playerToken,id:r.id};
  sessionStorage.setItem('imposter-player-session',JSON.stringify(session));
  $('join').classList.add('hidden');$('play').classList.remove('hidden');
  $('welcome').textContent=`${t('Hi,')} ${session.name}`;
  $('joinError').textContent='';$('connection').textContent='● '+t('Connected');
  if(state)render(state);
 });
}
function render(s){if(!session||s.code!==session.code)return;let prevRound=state?.round;state=s;
 if(prevRound!==undefined&&prevRound!==s.round){if(role?.round!==s.round)role=null;shown=false;selected=null;cluePending=false;votePending=false;$('clueInput').value='';$('voteError').textContent='';}
 const me=s.players.find(p=>p.id===session.id),playing=!!me?.active;
 $('phase').textContent=t(s.phase.toUpperCase());$('round').textContent=t('ROUND')+' '+s.round;
 $('clueCard').classList.toggle('hidden',!playing||s.phase!=='clues');const submitted=!!me?.clueSubmitted;$('clueInput').disabled=submitted||cluePending;$('clueBtn').disabled=submitted||cluePending;$('clueBtn').textContent=t(submitted?'Clue submitted ✓':'Submit clue');$('clueStatus').textContent=submitted?t('Your clue is visible to everyone.'):(cluePending?t('Submitting...'):'');
 $('clueBoard').classList.toggle('hidden',!['clues','voting','results'].includes(s.phase));$('clueBoardList').innerHTML=(s.clues||[]).map(c=>`<div class="player"><strong>${safe(c.name)}</strong><span>${safe(c.text)}</span></div>`).join('')||`<p class="muted">${t('No clues submitted yet.')}</p>`;
 $('secretCard').classList.toggle('hidden',!playing||!['clues','voting'].includes(s.phase));$('voteCard').classList.toggle('hidden',!playing||s.phase!=='voting');$('voteTimer').classList.toggle('hidden',s.phase!=='voting');$('results').classList.toggle('hidden',s.phase!=='results');
 if(s.phase==='lobby')$('instructions').textContent=`${t('Waiting for the host to start.')} ${s.players.length} ${t('player(s) in the room.')}`;
 if(s.phase==='clues')$('instructions').textContent=playing?t('Look at your private role. Take turns giving one-word clues. Do not say the secret word itself.'):t('Waiting for the host to start.');
 if(s.phase==='voting'){$('instructions').textContent=`${t('Time to vote!')} ${s.voteCount} ${t('of')} ${s.eligibleCount} ${t('votes received.')}`;
 $('voteOptions').innerHTML=s.players.filter(p=>p.active&&p.id!==session.id).map(p=>`<button class="vote ${selected===p.id?'selected':''}" ${me?.hasVoted?'disabled':''} data-id="${safe(p.id)}">${safe(p.name)}</button>`).join('');
 for(const btn of $('voteOptions').querySelectorAll('button'))btn.onclick=()=>{selected=btn.dataset.id;render(state);};
 $('voteBtn').disabled=!playing||!selected||!!me?.hasVoted||votePending;$('changeVote').classList.toggle('hidden',!me?.hasVoted);$('changeVote').disabled=votePending;$('voteBtn').textContent=t(me?.hasVoted?'Vote submitted ✓':'Submit vote');}
 if(s.phase==='results'){const r=s.result;$('instructions').textContent=t('Round complete. Watch the host screen for the full voting breakdown.');
 $('results').innerHTML=`<div class="eyebrow">${t('THE REVEAL')}</div><div class="result" style="margin:18px 0">${safe(r.imposterName)} ${t('was the Imposter')}</div><div class="muted">${t('Secret word')}</div><div class="word">${safe(word(r.word))}</div><div class="winner ${r.correct?'':'loser'}">${t(r.correct?'Players win!':'Imposter wins!')}</div>`;}
 if(s.hostOnline===false&&s.phase!=='results')$('instructions').textContent+=' Host disconnected — the room will close shortly unless the same tab reconnects. / Anfitrión desconectado — la sala se cerrará pronto si no regresa la misma pestaña.';
 updateRole();}
function updateRole(){if(!state||!['clues','voting'].includes(state.phase))return;
 $('cover').classList.toggle('hidden',shown);$('secret').classList.toggle('hidden',!shown);
 if(!role||role.round!==state.round){$('cover').querySelector('h2').textContent=t('Loading your role...');$('reveal').disabled=true;return;}
 $('cover').querySelector('h2').textContent=t('Your secret is ready');$('reveal').disabled=false;
 $('secretCard').classList.toggle('imposter',shown&&role.imposter);$('secretCard').classList.toggle('civilian',shown&&!role.imposter);
 $('roleLabel').textContent=t(role.imposter?'YOU ARE THE IMPOSTER':'SECRET WORD');$('word').textContent=role.imposter?t('IMPOSTER'):word(role.word);
 $('roleText').textContent=t(role.imposter?'Blend in. Listen closely. Pretend you know the word.':'Give one word related to the secret. Do not say the word itself.');}
$('joinBtn').onclick=()=>{if(session){cancelResume();join(true);}else join(false);};$('name').addEventListener('keydown',e=>{if(e.key==='Enter')join(false)});
$('reveal').onclick=()=>{shown=true;updateRole()};$('hide').onclick=()=>{shown=false;updateRole()};
$('voteBtn').onclick=()=>{if(!selected||$('voteBtn').disabled)return;votePending=true;$('voteBtn').disabled=true;socket.timeout(10000).emit('player:vote',{id:selected},(err,r)=>{votePending=false;$('voteError').textContent=err?'Request timed out. Try again.':r?.ok?t('Vote recorded.'):r?.error||'Vote failed.';if(state)render(state);});};
$('changeVote').onclick=()=>{if(votePending)return;votePending=true;$('changeVote').disabled=true;socket.timeout(10000).emit('player:change-vote',{},(err,r)=>{votePending=false;if(!err&&r?.ok){selected=null;$('voteError').textContent=t('Choose your new vote.');}else $('voteError').textContent=err?'Request timed out. Try again.':r?.error||'Could not change vote.';if(state)render(state);});};
$('clueBtn').onclick=()=>{const clue=$('clueInput').value.trim();if(!clue||clue.length>100){$('clueStatus').textContent=t('Enter a clue (1–100 characters).');return;}cluePending=true;$('clueBtn').disabled=true;socket.timeout(10000).emit('player:clue',{text:clue},(err,r)=>{cluePending=false;$('clueStatus').textContent=err?'Request timed out. Try again.':r?.ok?t('Clue submitted ✓'):r?.error||'Could not submit clue.';if(state)render(state);});};
socket.on('room:closed',r=>{
 if(!session || r?.code!==session.code)return;
 cancelResume();session=null;state=null;role=null;selected=null;shown=false;cluePending=false;votePending=false;
 sessionStorage.removeItem('imposter-player-session');
 $('play').classList.add('hidden');$('join').classList.remove('hidden');
 $('joinError').textContent=r.message||'The host left. This room has ended. Join a new room.';
 $('room').value='';
});
socket.on('player:role',r=>{if(role?.round===r.round&&shown)return;role=r;updateRole()});socket.on('room:state',render);
socket.on('connect',()=>{$('connection').textContent='● '+t('Connected');if(session&&(!codeFromUrl||codeFromUrl===session.code)){cancelResume();join(true);}});socket.on('disconnect',()=>{cancelResume();$('connection').textContent='● '+t('Reconnecting...');});
window.addEventListener('languagechange',()=>{if(state)render(state);if(session)$('welcome').textContent=`${t('Hi,')} ${session.name}`;});
if(codeFromUrl&&session&&session.code!==codeFromUrl){session=null;sessionStorage.removeItem('imposter-player-session');}

function updateClock(){const el=$('voteTimer');if(!el||!state||state.phase!=='voting'||!state.votingStartedAt)return;const left=state.votingSeconds-Math.floor((Date.now()-state.votingStartedAt)/1000);const abs=Math.abs(left);el.textContent=(left<0?t('Overtime')+': +':t('Voting timer')+': ')+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');}
setInterval(updateClock,1000);
