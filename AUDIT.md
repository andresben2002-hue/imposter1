# Imposter Party v4.2.1 — Connectivity and Gameplay Audit

## Implemented fixes

1. **Ghost player names**: `player:join` now validates existing tab ownership before creating a player record. Previously, a second join attempt from a socket already assigned to another player could add a new name and then reject the join, permanently reserving the name until the host removed it. The host socket cannot register a player in that same socket.
2. **Host error messages disappearing**: Routine `room:state` updates no longer clear action errors (previously errors vanished within the 7-second sync interval). UI readiness now reflects `socket.connected`.
3. **Browser stale-file mitigation**: Updated the host/player JavaScript version query parameters to `v=4.2.1` to prompt browsers to request the latest client scripts following deployment.

## Verified

- 28 automated tests pass (`npm test`), including the original 25 and three new regression tests.
- JavaScript syntax checks pass for `server.js`, `public/host.js` and `public/player.js`.
- This is simulated testing. Real network failovers and phone/browser behavior have not been proven by it.

## Unresolved risks and recommended improvements (not implemented)

**High priority:**

- **Host disconnect destroys active rooms after ~4 seconds** (unless `HOST_DISCONNECT_GRACE_MS` overrides it). This meets the requested no-recovery-key behavior, but even a short cellular/Wi-Fi switch can exceed it. A configurable 15–30-second grace period with no recovery key is a safer usability compromise. Never claim closed rooms recover after expiration.
- **Server restarts/deploys lose all rooms.** Render cold starts, restarts, or deploys disconnect users. Preserving rooms after process restart requires durable storage and a different architecture; no such support exists here.
- **Returning player can be blocked by old active socket.** Existing `PLAYER_ACTIVE` retry logic avoids stolen identities, but recovery can be delayed until Socket.IO detects that the old connection has gone away. Display a retry indicator and an option to restart as a new player if original identity truly cannot be recovered. Do not automatically accept copied tokens from an additional active tab.
- **Voting-phase late joins bypass clues.** This is the currently documented intended rule, but it means 'all players submitted clues' does not apply to someone joining once voting begins. Consider deferring voting-phase joins to the next round or allowing the host to choose whether to admit them.

**Medium priority:**

- **Timer display is calculated from each device's `Date.now()`.** Phone clock inaccuracies may result in different countdowns. Use a server-to-client time offset or a relative monotonic countdown anchored to server timing.
- **Offline players remain potential voting choices** and eligible counts include disconnected participants. Decide whether players should be able to vote for a recently disconnected Imposter (currently yes), and explain it in UI.
- **Room membership and words are in-process by default.** Global word-history persistence requires `DATABASE_URL` or durable file storage. Multiple Node processes do not share rooms and a load balancer needs sticky sessions or an adapter and shared state.
- **Six-digit room codes are public join credentials,** and join/create/retry routes have no explicit rate limits. Add rate limiting and optional room lock before sharing publicly at scale.
- **Duplicated tabs share sessionStorage snapshots in some browsers.** Server rejects simultaneous takeover, but the duplicate tab may retry indefinitely. Add a clear 'Session in use in another tab' explanation and a new-player action.
- **Mixed English/Spanish text is not automatically translated.** Clues are shown verbatim by design; consider a small optional glossary display without modifying submitted text.

## Suggested manual acceptance tests on Render

1. Open host on a computer and join with three phones (including one on cellular data, one on Wi-Fi), then test Start Round, three clues, Open Voting, editable votes, result, and New Word/Restart.
2. Refresh one phone at each phase; verify that the same name, role, clue and submitted vote are retained.
3. Turn off a phone's Wi-Fi and switch to cellular; observe reconnect indicator and whether the room recognizes the old player.
4. Refresh the host in under four seconds, then test a host connection loss longer than four seconds. Confirm the room closes only in the latter case (unless a Render environment override changes the duration).
5. Open a duplicate host/player tab and verify it cannot take over an active session. After closing the original, test recovery within the room's lifetime.
6. Join a new player during clues and during voting; verify both have non-Imposter roles and that the clue/voting rules are as intended.
7. Keep two separate rooms open in different host tabs and check that closing one doesn't affect the other.
8. Run a complete voting session at the five-minute setting and verify that the timer entering overtime doesn't submit or end votes.
9. Deploy while a room is open to confirm everyone understands that rooms reset on server restart.

Run `npm test` locally to rerun the automated checks.
