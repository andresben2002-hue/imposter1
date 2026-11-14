# Imposter Party v4.5 — Bug audit

## Confirmed issues fixed

1. **Offline phone assignment:** previously, the host could assign a managed player to a disconnected controller phone, causing that participant to be treated as absent and preventing self-service clue/vote submission. The server now rejects NEW assignments to offline controllers; the host can reassign to a connected phone or to host-managed. Offline existing assignments remain clearly labeled.
2. **Out-of-order private-role responses on shared phones:** a late Socket.IO reply could display the prior player's secret after the phone was passed to another person or after the round rerolled. The client now validates selected player, controller ownership, phase, and round before displaying any returned secret.
3. **Host private-role disclosure across rounds:** an already revealed host-managed secret could remain visible after the round changed or ended. It now clears on round/phase transition, and stale role requests are discarded. Avoid opening private roles on a projected display.
4. **Host vote editor disappeared during updates:** the vote-edit UI was attached to a player-list item that was destroyed on every `room:state` broadcast. It now sits in its own persistent container, so state updates do not remove an in-progress edit.
5. **Shared-phone old role shown outside round:** active shared private views now close on return to lobby/results.

## Verification

- `node --test *.test.js`: **34/34 pass** (31 original + 3 new audit tests).
- `node --check` on all JavaScript files: pass.
- Static host HTML ID check is included in the suite.
- Live browser testing and Render deployment not carried out; the available runtime has no installed app dependencies.

## Remaining risks / improvements

- Unstable networks can cause the host's intentional four-second disconnect grace period to close the game. This remains unchanged by design.
- A shared-phone controller going offline after assignment makes their seats temporarily absent until the phone reconnects or the host reassigns them.
- Room state is memory-resident and is lost on Render restarts/redeployments.
- Room creation and connection endpoints need rate limiting before broader public use.
- The host-managed private-role control should **never** be operated on a TV or projected display.
- Real devices should be tested for duplicated tabs, backgrounded mobile browsers, and cross-country latency.

## Deploy

Replace repository files with the contents of this `imposter-party` folder, commit, and deploy the latest commit in Render. Hard-refresh host and player pages. Keep server and client files in the same release.
