const socket=io();const $=id=>document.getElementById(id);const t=s=>I18N.t(s);
let roomCode=sessionStorage.getItem('imposter-host-code'),hostToken=sessionStorage.getItem('imposter-host-token'),state=null,networkUrl='',pending=false;
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function word(w){return typeof w==='object'?(w[I18N.lang]||w.en):w||'';}
function error(s){$('error').textContent=s||'';}
function send(ev){
 if(pending)return;
 if(!socket.connected){error(t('The server is disconnected. Wait for reconnection and try again.'));return;}
 pending=true;error('');$('primary').disabled=true;$('reset').disabled=true;
 socket.timeout(12000).emit(ev,{code:roomCode},(err,r)=>{pending=false;
 if(err)error(t('The server did not respond. Check your connection and try again.'));
 else error(r?.ok?'':r?.error||'Request failed.');
 if(state)render(state);
 });
}
function base(){return $('baseUrl').value.trim().replace(/\/$/,'')||location.origin;}
function updateQR(){if(!roomCode)return;const link=base()+'/player.html?room='+roomCode;$('joinLink').href=link;$('joinLink').textContent=link;$('qr').src='/api/qr?url='+encodeURIComponent(link);}
function show(){$('intro').classList.add('hidden');$('game').classList.remove('hidden');$('code').textContent=roomCode;updateQR();}
async function getNetwork(){try{const r=await fetch('/api/network');const j=await r.json();networkUrl=j.urls[0]||'';if(networkUrl&&['localhost','127.0.0.1'].includes(location.hostname)){$('baseUrl').value=networkUrl;updateQR();}}catch{}}
function render(s){state=s;show();$('phase').textContent=t(s.phase.toUpperCase());$('round').textContent=t('ROUND')+' '+s.round;$('count').textContent=`(${s.onlineCount??s.players.filter(p=>p.online).length} ${t('connected')} / ${s.players.length} ${t('registered')})`;
 $('players').innerHTML=s.players.map(p=>`<div class="player ${p.online?'':'off'}"><span>${safe(p.name)}</span><span>${!p.online?t('offline'):s.phase!=='lobby'&&!p.active?t('spectator'):s.phase==='voting'?(p.hasVoted?'✓ '+t('voted'):'…'):'●'}</span></div>`).join('');$('noPlayers').classList.toggle('hidden',s.players.length!==0);
 const online=s.players.filter(p=>p.online).length;
 $('votes').classList.toggle('hidden',s.phase!=='voting');$('votes').textContent=`${s.voteCount}/${s.eligibleCount} ${t('votes')}`;
 $('wordStats').textContent=`${t('New words left')}: ${s.wordStats?.remaining??'?'} / ${s.wordStats?.total??'?'} · ${t('Word cycles')}: ${s.wordStats?.cycles??0}`;
 $('primary').classList.remove('hidden');$('reset').classList.add('hidden');$('result').classList.add('hidden');
 if(s.phase==='lobby'){$('actionTitle').textContent=t('Ready to begin?');$('description').textContent=t('Players join from their phones. Start when at least 3 players are connected.');$('primary').textContent=t('Start round');$('primary').disabled=pending||!socket.connected;$('description').textContent=online<3?`${t('Need 3 connected players to start.')} ${online}/3. ${t('The host screen does not count as a player.')} ${t('Disconnected players can rejoin with their original link.')}`:t('Players join from their phones. Start when at least 3 players are connected.');$('primary').onclick=()=>send('host:start');}
 if(s.phase==='clues'){$('actionTitle').textContent=t('Give your clues');$('description').textContent=t('Every player privately sees their role. Go around the room; each person says ONE related word. Discuss who seems suspicious, then open voting.');$('primary').textContent=t('Open voting');$('primary').disabled=pending||!socket.connected;$('primary').onclick=()=>send('host:vote');}
 if(s.phase==='voting'){$('actionTitle').textContent=t('Cast your votes');$('description').textContent=t('Everyone selects the person they suspect on their phone. Once all votes are in (or whenever you are ready), reveal the answer.');$('primary').textContent=t('Reveal Imposter');$('primary').disabled=pending||!socket.connected;$('primary').onclick=()=>send('host:reveal');}
 if(s.phase==='results'){$('actionTitle').textContent=t('The reveal');$('description').textContent=t('Discuss the outcome, then return to the lobby for another round.');$('primary').classList.add('hidden');$('reset').classList.remove('hidden');$('reset').disabled=pending||!socket.connected;$('result').classList.remove('hidden');let r=s.result;
 const rows=s.players.map(p=>({name:p.name,v:r.tally[p.id]||0})).sort((a,b)=>b.v-a.v);
 $('result').innerHTML=`<div class="result">${safe(r.imposterName)} ${t('was the Imposter!')}</div><div class="word">${safe(word(r.word))}</div><div class="winner ${r.correct?'':'loser'}">${t(r.correct?'Players caught the Imposter!':'Imposter escaped!')}</div><h3>${t('votes')}</h3>${rows.map(p=>`<div class="row between step"><span>${safe(p.name)}</span><b>${p.v}</b></div>`).join('')}<p class="muted mini">${t(r.unique?'Highest vote-getter decides the outcome.':'No unique top vote-getter (tie or no votes), so the Imposter escapes.')}</p>`;}
}
socket.on('connect',()=>{$('connection').textContent='● '+t('Connected');if(roomCode&&hostToken)socket.emit('host:resume',{code:roomCode,hostToken},r=>{if(!r?.ok){roomCode=null;hostToken=null;sessionStorage.removeItem('imposter-host-code');sessionStorage.removeItem('imposter-host-token');state=null;$('game').classList.add('hidden');$('intro').classList.remove('hidden');$('introError').textContent=r?.error||'Room unavailable.';}});});
socket.on('disconnect',()=>{$('connection').textContent='● '+t('Reconnecting...');if(state)render(state);});socket.on('room:state',render);
$('create').onclick=()=>socket.emit('host:create',{},r=>{if(!r?.ok){$('introError').textContent=r?.error||'Could not create room.';return;}roomCode=r.code;hostToken=r.hostToken;sessionStorage.setItem('imposter-host-code',roomCode);sessionStorage.setItem('imposter-host-token',hostToken);show();});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('joinLink').href);$('copy').textContent=t('Copied!');setTimeout(()=>$('copy').textContent=t('Copy join link'),1400);}catch{error('Select and copy the join URL above.');}};
$('useNetwork').onclick=()=>{if(networkUrl){$('baseUrl').value=networkUrl;updateQR();}else error('No local IPv4 address found. Enter the host LAN address manually.');};
$('baseUrl').addEventListener('input',updateQR);$('reset').onclick=()=>send('host:reset');
window.addEventListener('languagechange',()=>{if(state)render(state);else $('connection').textContent='● '+t(socket.connected?'Connected':'Reconnecting...');});getNetwork();
