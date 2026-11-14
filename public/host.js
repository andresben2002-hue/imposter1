const socket=io();const $=id=>document.getElementById(id);const t=s=>I18N.t(s);
let roomCode=sessionStorage.getItem('imposter-host-code'),hostToken=sessionStorage.getItem('imposter-host-token'),state=null,networkUrl='',pending=false,hostReady=false;
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function word(w){return typeof w==='object'?(w[I18N.lang]||w.en):w||'';}
function error(s){$('error').textContent=s||'';}
function send(ev){
 if(pending)return;
 if(!hostReady || !state){error('Host room is not synchronized. Check the host connection message, then refresh.');return;}
 if(!socket.connected){error(t('The server is disconnected. Wait for reconnection and try again.'));return;}
 pending=true;error('');$('primary').disabled=true;$('reset').disabled=true;$('reroll').disabled=true;$('restart').disabled=true;
 socket.timeout(12000).emit(ev,ev==='host:vote'?{code:roomCode,seconds:Number($('timerDuration').value)}:{code:roomCode},(err,r)=>{pending=false;
 if(err)error(t('The server did not respond. Check your connection and try again.'));
 else error(r?.ok?'':r?.error||'Request failed.');
 if(state)render(state);
 });
}
function base(){return $('baseUrl').value.trim().replace(/\/$/,'')||location.origin;}
function updateQR(){if(!roomCode)return;const link=base()+'/player.html?room='+roomCode;$('joinLink').href=link;$('joinLink').textContent=link;$('qr').src='/api/qr?url='+encodeURIComponent(link);}
function show(){$('intro').classList.add('hidden');$('game').classList.remove('hidden');$('code').textContent=roomCode;updateQR();}
async function getNetwork(){try{const r=await fetch('/api/network');const j=await r.json();networkUrl=j.urls[0]||'';if(networkUrl&&['localhost','127.0.0.1'].includes(location.hostname)){$('baseUrl').value=networkUrl;updateQR();}}catch{}}
function render(s){if(!s||!roomCode||s.code!==roomCode)return;
 if(state&&(s.round!==state.round||(['clues','voting'].includes(state.phase)&&!['clues','voting'].includes(s.phase)))){$('managePrivate').classList.add('hidden');$('managePrivateText').textContent='';}
 state=s;hostReady=socket.connected;show();$('phase').textContent=t(s.phase.toUpperCase());$('round').textContent=t('ROUND')+' '+s.round;$('count').textContent=`(${s.onlineCount??s.players.filter(p=>p.online).length} present / ${s.players.length} ${t('registered')})`;
 $('players').innerHTML=s.players.map(p=>`<div class="player ${p.online?'':'off'}"><span>${safe(p.name)}</span><span>${!p.online?t('offline'):s.phase!=='lobby'&&!p.active?t('spectator'):s.phase==='voting'?(p.hasVoted?'✓ '+t('voted'):'…'):'●'}${!p.online&&['lobby','results'].includes(s.phase)?` <button class="secondary remove-offline" data-id="${safe(p.id)}" title="Remove disconnected player / Quitar jugador desconectado" style="padding:5px 8px;font-size:12px">Remove / Quitar</button>`:''}</span></div>`).join('');
 $('players').querySelectorAll('.remove-offline').forEach(btn=>btn.onclick=()=>{
  if(!socket.connected||!hostReady){error('Server disconnected.');return;}
  socket.emit('host:remove-player',{code:roomCode,id:btn.dataset.id},r=>{if(!r?.ok)error(r?.error||'Could not remove player.');});
 });
 renderManage(s);
 $('noPlayers').classList.toggle('hidden',s.players.length!==0);
 const online=s.players.filter(p=>p.online).length;
 $('clueList').classList.toggle('hidden',!['clues','voting','results'].includes(s.phase));$('clueList').innerHTML=(s.clues||[]).map(c=>`<div class="player"><strong>${safe(c.name)}</strong><span>${safe(c.text)}</span></div>`).join('') || `<p class="muted">${t('No clues submitted yet.')}</p>`;
 $('clueProgress').textContent=`${s.submittedRequiredClues||0}/${s.requiredClues||0} ${t('clues submitted')}`;$('timerSettings').classList.toggle('hidden',s.phase!=='clues');$('voteTimer').classList.toggle('hidden',s.phase!=='voting');
 $('votes').classList.toggle('hidden',s.phase!=='voting');$('votes').textContent=`${s.voteCount}/${s.eligibleCount} ${t('votes')}`;
 if($('wordStats')) $('wordStats').textContent=`${t('New words left')}: ${s.wordStats?.remaining??'?'} / ${s.wordStats?.total??'?'} · ${t('Word cycles')}: ${s.wordStats?.cycles??0}`;
 $('primary').classList.remove('hidden');$('reset').classList.add('hidden');$('result').classList.add('hidden');
 const midround=['clues','voting'].includes(s.phase);
 for(const id of ['reroll','restart']){$(id).classList.toggle('hidden',!midround);$(id).disabled=pending||!socket.connected||!hostReady||online<3;}
 if(s.phase==='lobby'){$('actionTitle').textContent=t('Ready to begin?');$('description').textContent=t('Start when 3 players are present (own phones, shared seats, or host-managed).');$('primary').textContent=t('Start round');$('primary').disabled=pending||!socket.connected||!hostReady;$('description').textContent=online<3?`${t('Need 3 present players to start.')} ${online}/3. ${t('The host screen does not count as a player.')} ${t('Disconnected players can rejoin with their original link.')}`:t('Start when 3 players are present (own phones, shared seats, or host-managed).');$('primary').onclick=()=>send('host:start');}
 if(s.phase==='clues'){$('actionTitle').textContent=t('Give your clues');$('description').textContent=t('Every player privately sees their role. Go around the room; each person says ONE related word. Discuss who seems suspicious, then open voting.');$('primary').textContent=t('Open voting');$('description').textContent+=` ${s.submittedRequiredClues}/${s.requiredClues} ${t('clues submitted')}.`;$('primary').disabled=pending||!socket.connected||!hostReady||s.requiredClues===0||s.submittedRequiredClues<s.requiredClues;$('primary').onclick=()=>send('host:vote');}
 if(s.phase==='voting'){$('actionTitle').textContent=t('Cast your votes');$('description').textContent=t('Everyone selects the person they suspect on their phone. Once all votes are in (or whenever you are ready), reveal the answer.');$('primary').textContent=t('Reveal Imposter');$('primary').disabled=pending||!socket.connected||!hostReady;$('primary').onclick=()=>send('host:reveal');}
 if(s.phase==='results'){$('actionTitle').textContent=t('The reveal');$('description').textContent=t('Discuss the outcome, then return to the lobby for another round.');$('primary').classList.add('hidden');$('reset').classList.remove('hidden');$('reset').disabled=pending||!socket.connected||!hostReady;$('result').classList.remove('hidden');let r=s.result;
 const rows=s.players.map(p=>({name:p.name,v:r.tally[p.id]||0})).sort((a,b)=>b.v-a.v);
 $('result').innerHTML=`<div class="result">${safe(r.imposterName)} ${t('was the Imposter!')}</div><div class="word">${safe(word(r.word))}</div><div class="winner ${r.correct?'':'loser'}">${t(r.correct?'Players caught the Imposter!':'Imposter escaped!')}</div><h3>${t('votes')}</h3>${rows.map(p=>`<div class="row between step"><span>${safe(p.name)}</span><b>${p.v}</b></div>`).join('')}<p class="muted mini">${t(r.unique?'Highest vote-getter decides the outcome.':'No unique top vote-getter (tie or no votes), so the Imposter escapes.')}</p>`;}
}
function forgetRoom(message){hostReady=false;roomCode=null;hostToken=null;state=null;sessionStorage.removeItem('imposter-host-code');sessionStorage.removeItem('imposter-host-token');$('game').classList.add('hidden');$('intro').classList.remove('hidden');$('introError').textContent=message||'Room unavailable.';}
function resumeHost(){
 if(!socket.connected||!roomCode||!hostToken)return;
 hostReady=false;
 $('connection').textContent='● Synchronizing room '+roomCode+'…';
 socket.timeout(10000).emit('host:resume',{code:roomCode,hostToken},(err,r)=>{
   if(err){$('connection').textContent='● Server did not respond. Retry by refreshing this page.';return;}
   if(r?.ok&&r.state&&r.state.code===roomCode){render(r.state);$('connection').textContent='● '+t('Connected')+' · Room '+roomCode;}
   else {hostReady=false;$('connection').textContent='● '+(r?.error||'Host unavailable');$('introError').textContent=(r?.error||'Host unavailable')+' Create a new room.';$('game').classList.add('hidden');$('intro').classList.remove('hidden');}
 });
}
function syncHost(){
 if(!socket.connected||!roomCode||!hostToken)return;
 socket.timeout(8000).emit('host:sync',{code:roomCode,hostToken},(err,r)=>{
   if(err){$('connection').textContent='● Room sync timed out. Check Render logs and refresh.';return;}
   if(r?.ok&&r.state&&r.state.code===roomCode){render(r.state);$('connection').textContent='● '+t('Connected')+' · Room '+roomCode;}
   else {hostReady=false;$('connection').textContent='● '+(r?.error||'Host session unavailable');error(r?.error||'Host session unavailable');}
 });
}
socket.on('connect',()=>{hostReady=false;$('connection').textContent='● '+t('Connected');if(roomCode&&hostToken)resumeHost();});
socket.on('room:closed',r=>{if(r?.code===roomCode)forgetRoom(r.message||'This room has ended.');});
socket.on('disconnect',()=>{hostReady=false;$('connection').textContent='● '+t('Reconnecting...');if(state)render(state);});socket.on('room:state',render);
$('create').onclick=()=>socket.emit('host:create',{},r=>{if(!r?.ok){$('introError').textContent=r?.error||'Could not create room.';return;}roomCode=r.code;hostToken=r.hostToken;sessionStorage.setItem('imposter-host-code',roomCode);sessionStorage.setItem('imposter-host-token',hostToken);if(r.state){render(r.state);$('connection').textContent='● '+t('Connected')+' · Room '+roomCode;}else{show();syncHost();}});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('joinLink').href);$('copy').textContent=t('Copied!');setTimeout(()=>$('copy').textContent=t('Copy join link'),1400);}catch{error('Select and copy the join URL above.');}};
$('useNetwork').onclick=()=>{if(networkUrl){$('baseUrl').value=networkUrl;updateQR();}else error('No local IPv4 address found. Enter the host LAN address manually.');};
$('baseUrl').addEventListener('input',updateQR);$('reset').onclick=()=>send('host:reset');
$('reroll').onclick=()=>{if(confirm('Give everyone a NEW word, keep the SAME Imposter, and clear all votes? / ¿Nueva palabra, mismo impostor y borrar votos?'))send('host:reroll');};
$('restart').onclick=()=>{if(confirm('Restart with a NEW word and NEW random Imposter? All votes will be cleared. / ¿Reiniciar con palabra e impostor nuevos?'))send('host:restart');};
window.addEventListener('languagechange',()=>{if(state)render(state);else $('connection').textContent='● '+t(socket.connected?'Connected':'Reconnecting...');});getNetwork();

// Periodic state sync prevents a stale UI if a room state update was missed.
setInterval(()=>{if(roomCode&&socket.connected&&!pending)syncHost();},7000);
// Initial disabled state is set in HTML. Do not overwrite live controls after render().

// Informational voting countdown only. Never automatically submits, closes or reveals votes.
function updateClock(){const el=$('voteTimer');if(!el||!state||state.phase!=='voting'||!state.votingStartedAt)return;const left=state.votingSeconds-Math.floor((Date.now()-state.votingStartedAt)/1000);const abs=Math.abs(left);el.textContent=(left<0?t('Overtime')+': +':t('Voting timer')+': ')+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');}
setInterval(updateClock,1000);


// Lightweight host management. Role secrets are fetched only on an explicit reveal.
function manageEmit(event,data,callback){
 if(!socket.connected||!hostReady)return $('manageError').textContent='Host not connected / Anfitrión desconectado';
 socket.timeout(10000).emit(event,{code:roomCode,...data},(err,r)=>{
  $('manageError').textContent=err?'Server timeout / Tiempo agotado':r?.ok?'':r?.error||'Action failed';
  if(!err&&r?.ok&&callback)callback(r);
 });
}
function renderManage(s){
 if(s.phase!=='voting'){$('managed-vote-editor').innerHTML='';$('managed-vote-editor').classList.add('hidden');}
 const controllers=s.players.filter(p=>!p.managed);
 const availableControllers=controllers.filter(p=>p.online);
 const dropdown=$('managedController'),current=dropdown.value;
 dropdown.innerHTML='<option value="">Host-managed / Anfitrión</option>'+availableControllers.map(p=>`<option value="${safe(p.id)}">${safe(p.name)} — phone</option>`).join('');
 dropdown.value=availableControllers.some(p=>p.id===current)?current:'';
 $('manageList').innerHTML=s.players.map(p=>{
  const assigned=p.managed?(p.controllerId?s.players.find(x=>x.id===p.controllerId)?.name||'Missing phone':'Host'):'Own phone';
  const controls=p.managed?`<select class="manage-controller" data-id="${safe(p.id)}" aria-label="Assign phone for ${safe(p.name)}"><option value="">Host-managed</option>${controllers.map(c=>`<option value="${safe(c.id)}" ${c.id===p.controllerId?'selected':''} ${c.online?'':'disabled'}>${safe(c.name)}'s phone${c.online?'':' (offline)'}</option>`).join('')}</select><button class="secondary manage-role" data-id="${safe(p.id)}">Private role</button><button class="secondary manage-remove" data-id="${safe(p.id)}">Remove</button>`:'';
  const phaseControls=s.phase==='clues'?`<button class="secondary manage-clue" data-id="${safe(p.id)}">Edit clue</button>`:s.phase==='voting'?`<button class="secondary manage-vote" data-id="${safe(p.id)}">Edit vote</button>`:'';
  return `<div class="player" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:125px"><strong>${safe(p.name)}</strong><div class="muted mini">${safe(assigned)} · ${p.online?'Present':'Offline'}</div></div><div class="row" style="flex-wrap:wrap">${controls}${phaseControls}</div></div>`;
 }).join('')||'<p class="muted mini">No players yet</p>';
 $('manageList').querySelectorAll('.manage-controller').forEach(el=>el.onchange=()=>{
  $('managePrivate').classList.add('hidden');$('managePrivateText').textContent='';
  manageEmit('host:assign-managed',{id:el.dataset.id,controllerId:el.value});
 });
 $('manageList').querySelectorAll('.manage-remove').forEach(el=>el.onclick=()=>{if(confirm('Remove this player? / ¿Quitar jugador?'))manageEmit('host:remove-managed',{id:el.dataset.id});});
 $('manageList').querySelectorAll('.manage-role').forEach(el=>el.onclick=()=>{
  if(!confirm('This role is private. Make sure the TV and other players cannot see the screen. Continue?'))return;
  const requestedId=el.dataset.id,requestedRound=s.round;
  manageEmit('managed:role',{id:requestedId},r=>{
   if(state?.round!==requestedRound||!state?.players.some(x=>x.id===requestedId&&x.managed&&!x.controllerId)||!['clues','voting'].includes(state?.phase))return;
   const p=state.players.find(x=>x.id===requestedId);
   $('managePrivateName').textContent=p?.name||'Player';$('managePrivateText').textContent=r.imposter?'IMPOSTER':word(r.word);
   $('managePrivate').classList.remove('hidden');
  });
 });
 $('manageList').querySelectorAll('.manage-clue').forEach(el=>el.onclick=()=>{
  const old=s.clues.find(c=>c.id===el.dataset.id)?.text||'';
  const clue=prompt('Edit clue / Editar pista',old);if(clue!==null)manageEmit('host:edit-clue',{id:el.dataset.id,text:clue});
 });
 $('manageList').querySelectorAll('.manage-vote').forEach(el=>el.onclick=()=>{
  const choices=s.players.filter(p=>p.active&&p.id!==el.dataset.id);
  const editor=$('managed-vote-editor');
  editor.innerHTML='';editor.className='row';editor.style.width='100%';
  const label=document.createElement('span');label.textContent='Vote for / Votar por:';
  const picker=document.createElement('select');
  for(const player of choices){const option=document.createElement('option');option.value=player.id;option.textContent=player.name;picker.appendChild(option);}
  const save=document.createElement('button');save.className='secondary';save.textContent='Save / Guardar';
  save.onclick=()=>manageEmit('host:edit-vote',{id:el.dataset.id,targetId:picker.value},()=>{editor.innerHTML='';editor.classList.add('hidden');});
  const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Cancel / Cancelar';cancel.onclick=()=>{editor.innerHTML='';editor.classList.add('hidden');};
  editor.append(label,picker,save,cancel);
 });
}
$('managedAdd').onclick=()=>{
 const name=$('managedName').value.trim();if(!name)return $('manageError').textContent='Enter a name / Escribe un nombre';
 manageEmit('host:add-managed',{name,controllerId:$('managedController').value},()=>{$('managedName').value='';});
};
$('manageHide').onclick=()=>{$('managePrivate').classList.add('hidden');$('managePrivateText').textContent='';};
