// Navigation safety only; game sessions, server events and round rules remain unchanged.
(() => {
  const isHost = location.pathname.endsWith('/host.html');
  const isPlayer = location.pathname.endsWith('/player.html');
  document.querySelectorAll('.site-nav a, .brand-mini').forEach(a => a.addEventListener('click', e => {
    if (new URL(a.href).pathname === location.pathname) { e.preventDefault(); return; }
    const active = isHost ? !document.getElementById('game')?.classList.contains('hidden') : isPlayer && !document.getElementById('play')?.classList.contains('hidden');
    if (!active) return;
    const spanish = window.I18N?.lang === 'es';
    const msg = isHost
      ? (spanish ? '¿Salir de la pantalla de anfitrión? La sala se cerrará y los jugadores serán desconectados.' : 'Leave the host screen? Your room will close and all players will be disconnected.')
      : (spanish ? '¿Salir de la partida? Puedes regresar a esta sala si sigue abierta.' : 'Leave the player screen? You can return if the room is still open.');
    if (!window.confirm(msg)) e.preventDefault();
  }));
})();
