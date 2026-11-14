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
   $('joinError').textContent=t('Connection timed out. Retrying...');
   if(resume){resumeAttempt++;scheduleResume();}
   return;
  }
  if(!r?.ok){
   // A refresh can create the new connection before the old one times out.
   // A duplicated tab is also denied; it must never steal the active session.
   if(resume){
    $('joinError').textContent=r?.error?t(r.error):t('Reconnecting...');
    if(r?.errorCode==='PLAYER_ACTIVE'){
     resumeAttempt++;scheduleResume();
     $('connection').textContent='● '+t('Waiting for previous connection to close');
    } else if(r?.errorCode==='ROOM_NOT_FOUND'){
     cancelResume();session=null;sessionStorage.removeItem('imposter-player-session');
     $('join').classList.remove('hidden');$('play').classList.add('hidden');
    } else {resumeAttempt++;scheduleResume();}
   }else $('joinError').textContent=(r?.error?t(r.error):null)||t('Unable to join.');
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
 if(prevRound!==undefined&&prevRound!==s.round){resetPass();if(role?.round!==s.round)role=null;shown=false;selected=null;cluePending=false;votePending=false;$('clueInput').value='';$('voteError').textContent='';}
 const me=s.players.find(p=>p.id===session.id),playing=!!me?.active;
 $('phase').textContent=t(s.phase.toUpperCase());$('round').textContent=t('ROUND')+' '+s.round;
 const hasSharedClues=s.players.some(p=>p.managed&&p.controllerId===session.id);$('clueCard').classList.toggle('hidden',hasSharedClues||!playing||s.phase!=='clues');const submitted=!!me?.clueSubmitted;$('clueInput').disabled=submitted||cluePending;$('clueBtn').disabled=submitted||cluePending;$('clueBtn').textContent=t(submitted?'Clue submitted ✓':'Submit clue');$('clueStatus').textContent=submitted?t('Your clue is visible to everyone.'):(cluePending?t('Submitting...'):'');
 $('clueBoard').classList.toggle('hidden',!['clues','voting','results'].includes(s.phase));$('clueBoardList').innerHTML=(s.clues||[]).map(c=>`<div class="player"><strong>${safe(c.name)}</strong><span>${safe(c.text)}</span></div>`).join('')||`<p class="muted">${t('No clues submitted yet.')}</p>`;
 const hasShared=s.players.some(p=>p.managed&&p.controllerId===session.id);$('secretCard').classList.toggle('hidden',hasShared||!playing||!['clues','voting'].includes(s.phase));$('voteCard').classList.toggle('hidden',hasShared||!playing||s.phase!=='voting');$('voteTimer').classList.toggle('hidden',s.phase!=='voting');$('results').classList.toggle('hidden',s.phase!=='results');
 if(s.phase==='lobby')$('instructions').textContent=`${t('Waiting for the host to start.')} ${s.players.length} ${t('player(s) in the room.')}`;
 if(s.phase==='clues')$('instructions').textContent=playing?t('Look at your private role. Take turns giving one-word clues. Do not say the secret word itself.'):t('Waiting for the host to start.');
 if(s.phase==='voting'){$('instructions').textContent=`${t('Time to vote!')} ${s.voteCount} ${t('of')} ${s.eligibleCount} ${t('votes received.')}`;
 $('voteOptions').innerHTML=s.players.filter(p=>p.active&&p.id!==session.id).map(p=>`<button class="vote ${selected===p.id?'selected':''}" ${me?.hasVoted?'disabled':''} data-id="${safe(p.id)}">${safe(p.name)}</button>`).join('');
 for(const btn of $('voteOptions').querySelectorAll('button'))btn.onclick=()=>{selected=btn.dataset.id;render(state);};
 $('voteBtn').disabled=!playing||!selected||!!me?.hasVoted||votePending;$('changeVote').classList.toggle('hidden',!me?.hasVoted);$('changeVote').disabled=votePending;$('voteBtn').textContent=t(me?.hasVoted?'Vote submitted ✓':'Submit vote');}
 if(s.phase==='results'){const r=s.result;$('instructions').textContent=t('Round complete. Watch the host screen for the full voting breakdown.');
 $('results').innerHTML=`<div class="eyebrow">${t('THE REVEAL')}</div><div class="result" style="margin:18px 0">${safe(r.imposterName)} ${t('was the Imposter')}</div><div class="muted">${t('Secret word')}</div><div class="word">${safe(word(r.word))}</div><div class="winner ${r.correct?'':'loser'}">${t(r.correct?'Players win!':'Imposter wins!')}</div>`;}
 if(s.hostOnline===false&&s.phase!=='results')$('instructions').textContent+=' '+t('Host disconnected. The room will close unless the host reconnects.');
 updateRole();renderPass(s);}
function updateRole(){if(!state||!['clues','voting'].includes(state.phase))return;
 $('cover').classList.toggle('hidden',shown);$('secret').classList.toggle('hidden',!shown);
 if(!role||role.round!==state.round){$('cover').querySelector('h2').textContent=t('Loading your role...');$('reveal').disabled=true;return;}
 $('cover').querySelector('h2').textContent=t('Your secret is ready');$('reveal').disabled=false;
 $('secretCard').classList.toggle('imposter',shown&&role.imposter);$('secretCard').classList.toggle('civilian',shown&&!role.imposter);
 $('roleLabel').textContent=t(role.imposter?'YOU ARE THE IMPOSTER':'SECRET WORD');$('word').textContent=role.imposter?t('IMPOSTER'):word(role.word);
 $('roleText').textContent=t(role.imposter?'Blend in. Listen closely. Pretend you know the word.':'Give one word related to the secret. Do not say the word itself.');}
$('joinBtn').onclick=()=>{if(session){cancelResume();join(true);}else join(false);};$('name').addEventListener('keydown',e=>{if(e.key==='Enter')join(false)});
$('reveal').onclick=()=>{shown=true;updateRole()};$('hide').onclick=()=>{shown=false;updateRole()};
$('voteBtn').onclick=()=>{if(!selected||$('voteBtn').disabled)return;votePending=true;$('voteBtn').disabled=true;socket.timeout(10000).emit('player:vote',{id:selected},(err,r)=>{votePending=false;$('voteError').textContent=err?t('Request timed out. Try again.'):r?.ok?t('Vote recorded.'):(r?.error?t(r.error):null)||t('Vote failed.');if(state)render(state);});};
$('changeVote').onclick=()=>{if(votePending)return;votePending=true;$('changeVote').disabled=true;socket.timeout(10000).emit('player:change-vote',{},(err,r)=>{votePending=false;if(!err&&r?.ok){selected=null;$('voteError').textContent=t('Choose your new vote.');}else $('voteError').textContent=err?t('Request timed out. Try again.'):(r?.error?t(r.error):null)||t('Could not change vote.');if(state)render(state);});};
$('clueBtn').onclick=()=>{const clue=$('clueInput').value.trim();if(!clue||clue.length>100){$('clueStatus').textContent=t('Enter a clue (1–100 characters).');return;}cluePending=true;$('clueBtn').disabled=true;socket.timeout(10000).emit('player:clue',{text:clue},(err,r)=>{cluePending=false;$('clueStatus').textContent=err?t('Request timed out. Try again.'):r?.ok?t('Clue submitted ✓'):(r?.error?t(r.error):null)||t('Could not submit clue.');if(state)render(state);});};
socket.on('room:closed',r=>{
 if(!session || r?.code!==session.code)return;
 cancelResume();session=null;state=null;role=null;selected=null;shown=false;cluePending=false;votePending=false;
 sessionStorage.removeItem('imposter-player-session');
 $('play').classList.add('hidden');$('join').classList.remove('hidden');
 $('joinError').textContent=r.message||t('The host left. This room has ended. Join a new room.');
 $('room').value='';
});
socket.on('player:role',r=>{if(role?.round===r.round&&shown)return;role=r;updateRole()});socket.on('room:state',render);
socket.on('connect',()=>{$('connection').textContent='● '+t('Connected');if(session&&(!codeFromUrl||codeFromUrl===session.code)){cancelResume();join(true);}});socket.on('disconnect',()=>{cancelResume();$('connection').textContent='● '+t('Reconnecting...');});
window.addEventListener('languagechange',()=>{if(passStep==='private'){hidePassSecret();passStep='cover';}if(state)render(state);if(session)$('welcome').textContent=`${t('Hi,')} ${session.name}`;});
if(codeFromUrl&&session&&session.code!==codeFromUrl){session=null;sessionStorage.removeItem('imposter-player-session');}

function updateClock(){const el=$('voteTimer');if(!el||!state||state.phase!=='voting'||!state.votingStartedAt)return;const left=state.votingSeconds-Math.floor((Date.now()-state.votingStartedAt)/1000);const abs=Math.abs(left);el.textContent=(left<0?t('Overtime')+': +':t('Voting timer')+': ')+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');}
setInterval(updateClock,1000);



// One guided pass-the-phone sequence. Always conceal a previous person's role
// before allowing another person to reveal their own.
let passSeat=null,passStep='cover',passBusy=false,passRound=null,passPhase=null;const passVoteEditing=new Set();
function passSeats(s){if(!session)return [];return s.players.filter(p=>p.id===session.id||(p.managed&&p.controllerId===session.id)).filter(p=>p.active);}
function resetPass(){passSeat=null;passStep='cover';passBusy=false;passRound=null;passPhase=null;passVoteEditing.clear();hidePassSecret();}
function hidePassSecret(){$('passWord').textContent='';$('passPrivate').classList.add('hidden');$('passClueInput').value='';}
function passPlayer(s){return passSeats(s).find(p=>p.id===passSeat);}
function nextUnfinished(s){const ps=passSeats(s);return ps.find(p=>s.phase==='clues'?!p.clueSubmitted:!p.hasVoted)||ps[0];}
function renderPass(s){
 const seats=passSeats(s),enabled=seats.length>1&&['clues','voting'].includes(s.phase);
 $('sharedPanel').classList.toggle('hidden',!enabled);
 if(!enabled){resetPass();return;}
 if(passRound!==s.round||passPhase!==s.phase){resetPass();passRound=s.round;passPhase=s.phase;}
 if(!seats.some(p=>p.id===passSeat)){passSeat=nextUnfinished(s)?.id;passStep='cover';}
 const p=passPlayer(s);if(!p)return;
 const idx=seats.findIndex(x=>x.id===p.id);
 $('passProgress').textContent=`${idx+1} ${t('of')} ${seats.length}`;
 $('passPrevious').disabled=passBusy||seats.length<2;
 $('passForward').disabled=passBusy||seats.length<2;
 $('passSwitchHint').textContent=t('Switch players any time. Private roles are hidden before each handoff.');
 $('passName').textContent=p.name;
 $('passHint').textContent=t('Hand the phone to the person named below.');
 $('passStatus').textContent=p.clueSubmitted&&s.phase==='clues'?t('Clue already submitted.'):p.hasVoted&&s.phase==='voting'?t('Vote already submitted.'):t('Only the named player should look at the screen.');
 $('passCover').classList.toggle('hidden',passStep!=='cover');$('passPrivate').classList.toggle('hidden',passStep!=='private');$('passHandoff').classList.toggle('hidden',passStep!=='done');
 $('passClueArea').classList.toggle('hidden',s.phase!=='clues');$('passVoteArea').classList.toggle('hidden',s.phase!=='voting');
 $('passSubmit').disabled=passBusy||p.clueSubmitted;
 $('passVoteSubmit').disabled=passBusy||(p.hasVoted&&!passVoteEditing.has(p.id));
 $('passChangeVote').classList.toggle('hidden',!p.hasVoted||s.phase!=='voting');
 $('passChangeVote').disabled=passBusy;
 $('passDoneTitle').textContent=t('Screen hidden');
 $('passDoneText').textContent=t('Your turn is finished. Give the phone to the next person.');
 const remaining=seats.filter(x=>s.phase==='clues'?!x.clueSubmitted:!x.hasVoted);
 $('passNext').textContent=remaining.length?t('Pass to next player'):t('Review players');
 if(s.phase==='voting'&&passStep==='private'){
  const old=$('passVoteTarget').value;
  $('passVoteTarget').innerHTML=s.players.filter(x=>x.active&&x.id!==p.id).map(x=>`<option value="${safe(x.id)}">${safe(x.name)}</option>`).join('');
  if([...$('passVoteTarget').options].some(x=>x.value===old))$('passVoteTarget').value=old;
 }
}
function passRequest(event,payload,onSuccess){passBusy=true;$('passError').textContent='';if(state)renderPass(state);
 socket.timeout(10000).emit(event,payload,(err,r)=>{
  passBusy=false;
  if(err||!r?.ok){$('passError').textContent=err?t('Request timed out. Try again.'):t(r?.error||'Request failed.');if(state)renderPass(state);return;}
  onSuccess?.(r);if(state)renderPass(state);
 });
}
$('passReveal').onclick=()=>{
 const p=passPlayer(state);if(!p||passBusy)return;
 if(p.id===session.id){if(!role||role.round!==state.round){$('passError').textContent=t('Loading your role...');return;}
  showPassRole(role.imposter,role.word);return;}
 const requestedId=p.id,requestedRound=state.round;
 passRequest('managed:role',{id:requestedId},r=>{
  if(passSeat!==requestedId||state?.round!==requestedRound||passPhase!==state?.phase||!passSeats(state).some(p=>p.id===requestedId))return;
  showPassRole(r.imposter,r.word);
 });
};
function showPassRole(imposter,secret){
 shown=false;updateRole();
 $('passRoleLabel').textContent=t(imposter?'YOU ARE THE IMPOSTER':'SECRET WORD');
 $('passWord').textContent=imposter?t('IMPOSTER'):word(secret);
 $('passRoleText').textContent=t(imposter?'Blend in. Listen closely. Pretend you know the word.':'Give one word related to the secret. Do not say the word itself.');
 if(state.phase==='clues')$('passClueInput').value=state.clues.find(x=>x.id===passSeat)?.text||'';
 passStep='private';renderPass(state);
}
$('passSubmit').onclick=()=>{
 const p=passPlayer(state),text=$('passClueInput').value.trim();if(!p||passBusy)return;
 if(!text||text.length>100){$('passError').textContent=t('Enter a clue (1–100 characters).');return;}
 const id=p.id,round=state.round;
 passRequest(p.id===session.id?'player:clue':'managed:clue',p.id===session.id?{text}:{id,text},()=>{
  if(passSeat!==id||state.round!==round)return;
  hidePassSecret();passStep='done';renderPass(state);
 });
};
$('passVoteSubmit').onclick=()=>{
 const p=passPlayer(state),targetId=$('passVoteTarget').value;if(!p||!targetId||passBusy)return;
 const id=p.id,round=state.round;
 passRequest(p.id===session.id?'player:vote':'managed:vote',p.id===session.id?{id:targetId}:{id,targetId},()=>{
  if(passSeat!==id||state.round!==round)return;
  passVoteEditing.delete(id);hidePassSecret();passStep='done';renderPass(state);
 });
};
$('passChangeVote').onclick=()=>{
 const p=passPlayer(state);if(!p||passBusy)return;
 if(p.id!==session.id){passVoteEditing.add(p.id);$('passError').textContent=t('Choose another player and submit a replacement vote.');renderPass(state);return;}
 passRequest('player:change-vote',{},()=>{if(state)renderPass(state);});
};
$('passHide').onclick=()=>{if(passBusy)return;hidePassSecret();passStep='done';renderPass(state);};
$('passNext').onclick=()=>{
 hidePassSecret();shown=false;updateRole();
 const seats=passSeats(state);if(!seats.length)return;
 const current=seats.findIndex(p=>p.id===passSeat);
 const pending=seats.filter(p=>state.phase==='clues'?!p.clueSubmitted:!p.hasVoted);
 const next=pending.find(p=>p.id!==passSeat)||seats[(current+1)%seats.length];
 passSeat=next.id;passStep='cover';$('passError').textContent='';renderPass(state);
};

// Navigate through up to three seats at any time, even after a clue or vote.
// Never carry a revealed role or an unsent clue over to another person's turn.
function movePassSeat(direction){
 if(passBusy||!state)return;
 const seats=passSeats(state);if(seats.length<2)return;
 const idx=seats.findIndex(p=>p.id===passSeat);
 hidePassSecret();shown=false;updateRole();
 passSeat=seats[((idx<0?0:idx)+direction+seats.length)%seats.length].id;
 passStep='cover';$('passError').textContent='';renderPass(state);
}
$('passPrevious').onclick=()=>movePassSeat(-1);
$('passForward').onclick=()=>movePassSeat(1);
