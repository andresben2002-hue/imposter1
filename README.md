# Imposter Party — Online + English/Español (v2)

A multiplayer Imposter game with a host display for a TV and private player screens on phones. The host can be in the US while players join from Mexico, using the same **public HTTPS URL**. Host and player can choose languages independently.

## Features

- Host lobby, 6-digit room code, join link and QR code
- 3–20 connected players; one random Imposter per round
- Private role reveal, clue period, voting and results
- English / Spanish toggle on host, player and landing pages
- 270 bilingual words, each used **once per cycle** before repeats; 30-word recent history limits quick repeats across cycles
- Persistent word-use history **if you configure durable storage**
- Room state survives player reconnects **while the server process stays running**

## Local setup

Install Node.js 18+; unzip and open a terminal in this directory.

```bash
npm install
npm start
```

Host: `http://localhost:3000/host.html`.

For same-Wi-Fi phones, click **Use Wi-Fi address** on the host screen if your URL says localhost. For players anywhere in the world, **deploy to a public host** as described below. `localhost` or `192.168.x.x` URLs will not work for someone in Mexico unless they have a special network tunnel/VPN.

## Put it online (Render)

1. Create a GitHub repository and upload **the contents of this directory**, including `package.json`, `server.js`, `public/`, and `words.json` (do not upload `node_modules` or `data/`).
2. Go to https://dashboard.render.com/ and choose **New > Web Service**, then connect that GitHub repository.
3. Choose the Node runtime, build command `npm install`, start command `npm start`, and one instance (the game rooms are held in server memory).
4. Once deployed, open `https://YOUR-SERVICE.onrender.com/host.html`. Create a room; the QR automatically points to the public HTTPS domain.
5. Send `https://YOUR-SERVICE.onrender.com/player.html?room=123456` (with your actual code) to someone in Mexico. They can choose **Español**; your host screen can remain **English**.

**Important Render caveat:** Free web services may sleep after inactivity. A sleeping/restarting instance loses active rooms. You will need a new room if the server restarts. Render's free instance has an ephemeral filesystem, so **word history does not persist** there without an external database.

### Persistent word history across deploys/restarts (strongly recommended)

Use a managed PostgreSQL database (for instance a paid/ongoing Render Postgres database or another compatible provider). Set `DATABASE_URL` as an environment variable in the web service with the database connection string. If your provider requires a TLS connection that isn't configured in the URL, set `DATABASE_SSL=true` (check your provider's TLS certificate requirements before disabling verification). The game automatically creates its `imposter_word_history` table. A database is **not needed to play locally**. Free Render Postgres instances are temporary and expire, so are not appropriate for permanent word history.

On a paid server with an attached persistent disk instead, set `DATA_DIR=/var/data` and attach the disk to that path. A database is better if you later want cross-device profiles or multiple servers.

History is **global** for the deployed server: words won't repeat across rooms until all 270 have been used. After exhaustion, a new cycle starts, while trying to keep the 30 most recently used words out of the next picks. This is not an infinite word generator.

## Add your own words

Open `words.json`. Add a new item to the array with both translations:

```json
["Secret garden", "Jardín secreto"]
```

Maintain valid JSON (commas between items), unique English entries, and natural translations for Mexican Spanish. Restart or redeploy after editing. Old word history is retained for matching IDs; newly added words are immediately eligible.

## Tests

```bash
npm test
```

Tests cover private bilingual words, participant eligibility, host control, cycle-wide no-repeat behavior, and saved word history. They are simulation/unit tests, not real-browser multi-phone validation.

## Practical limitations and next steps

- The host shares a public URL; currently rooms and players remain in process memory and are lost if hosting restarts.
- Only a single server instance is supported; multi-instance deployment requires shared room state and a Socket.IO adapter.
- `words.json` is curated, not AI-generated. The game can keep expanding with additional bilingual word pairs, categories, and optional difficulty modes.
- Spanish user-interface text is manually translated; server error messages still appear in English.
- No built-in audio/video calling: use a group call (such as WhatsApp/Meet) for remote players to say clues out loud.

## Start Round troubleshooting (v2.1)

The game requires **three connected player devices**, not simply three names listed in the lobby. The host screen is not itself a player. The host now displays `connected / registered`, and the Start Round button reports the exact reason if too few devices are connected. Offline entries remain visible to make reconnection easier. If the host wants to play, they must also join from a player phone or a separate browser tab.

If the host screen says `Reconnecting`, reload it after the server comes back and wait until all three phones appear as connected. If the server restarted on Render, the old room is gone; create a new room and have everyone join again. If Start Round displays a word-storage error, inspect Render logs and confirm the storage directory or PostgreSQL connection is writable. The server's word-history write must succeed before it can begin a round.

For a new deployment, push these changed files to your existing GitHub repository (`server.js`, `public/host.js`, `public/i18n.js`, and tests), then wait for Render to report a successful redeploy. Refresh the host and all player pages and create a new room before testing.


### Host button troubleshooting (2.1.1)

The host now initializes from the create/resume acknowledgment as well as room broadcasts. If the page says `Waiting for live room information`, check the bottom-right connection indicator, refresh with Ctrl+Shift+R, and check the browser console for page script errors. The host screen does not count as a player: start requires 3 connected player tabs/phones. After uploading to GitHub, ensure `public/host.html`, `public/host.js`, and `server.js` were all replaced and Render is Live on the latest commit.

## November 2026 host Start Round display repair

The host page previously referenced `#wordStats` without including that element in `host.html`. This caused a browser JavaScript exception after rendering the player list, leaving the action section stuck at "Waiting for live room information..." and Start Round disabled even when three people were connected. The element has been added and guarded, and an automated host UI regression test (`host-ui.test.js`) checks that the full page renders and progresses through Start Round, Open Voting and Reveal Imposter. Upload ALL changed files (at least `public/host.html`, `public/host.js`, and `host-ui.test.js`) and redeploy Render. Use a hard refresh after deployment.


## Per-tab sessions and leaving a room

Player identities are now stored in **sessionStorage** rather than device-wide
localStorage, so separate tabs on the same browser can join as separate players.
A page refresh in the same tab keeps its identity; closing the tab ends that
tab's session. Some browsers offer “restore closed tab” and can restore its
old session, but the server checks room existence when it reconnects.

When the host's tab disconnects, the server waits **4 seconds** to allow a
refresh or brief network interruption. If the host does not resume within
that time, the server removes the room and notifies every connected player tab,
which returns to the join screen. On closing the host tab, expect players to
reset within about four seconds. You can adjust the wait using the environment
variable `HOST_DISCONNECT_GRACE_MS` (milliseconds, minimum 1000).

This behavior applies to **each game room**, not every user sharing a Wi-Fi
network. Hosting a second room in another tab will not end the first one.
The global used-word history is intentionally shared between rooms so words
are not accidentally reused just because a different host starts a game.

## Session safety and recovering a host room (v2.4)

- Every player tab uses `sessionStorage` for its session. A duplicated tab may copy this storage, but the server **rejects** attempts to resume a player whose original tab is still connected. It does not kick the original player out.
- Likewise, a second host tab cannot replace a live host. Close the original host tab before recovering it.
- The host page has a collapsible **Host recovery key / Clave de recuperación** section. Save that secret somewhere private before a game. Do not expand it while projecting the page on a shared TV. It is distinct from the public six-digit room code.
- If the host tab closes or its connection drops, its room remains available for **120 seconds** by default. A quick refresh can reconnect automatically. Alternatively, reopen `/host.html` and use **Recover an existing room / Recuperar sala**, entering the six-digit room code and the private recovery key. This will work only when the original host is offline, and rotates its active session token.
- The grace period can be configured via `HOST_DISCONNECT_GRACE_MS` (milliseconds; default 120000). If you previously configured this variable on Render as `4000`, remove it or change it to `120000` to get two minutes.
- The room and recovery key live in server memory. A Render restart, server redeploy, or expired recovery window will destroy that room, and a new room must be created. Persistent word history is separate.
- To simulate a duplicated tab, duplicate a connected player tab and confirm the new tab shows an error without disrupting the original, or duplicate a connected host tab and confirm control is denied. To test recovery, close the host tab and enter its saved recovery key on a fresh host tab within two minutes.


## Player refresh/reconnect fix (v2.5)

- A refreshed tab can reach the server before the old Socket.IO connection has fully expired. The server continues to reject a competing tab, but the **refreshed tab now keeps its original saved token and retries** instead of discarding its identity. It may take up to ~45–60 seconds for a stale connection to expire if the original tab disappeared without a clean disconnect.
- If a previously deployed buggy version already erased your saved player token, that identity cannot be proved from the name alone. In the **lobby or results screen**, the host can click **Remove / Quitar** next to that *offline* entry, then the player can join again with their original name. This does not remove connected players or interrupt a live round.
- Refreshing or resuming with the original session preserves the same player ID and role; a duplicated tab cannot take control while its original Socket.IO connection is active.
- Update **server.js**, **public/player.js**, **public/player.html**, **public/host.js**, and **public/host.html** together, deploy the GitHub commit on Render, then hard-refresh pages and create a fresh room.
- Verify by joining with three phones, refreshing one mid-round and immediately reconnecting, and testing that its secret word and voting eligibility remain intact. Test a disconnected stale name removal in the lobby too.


## Mid-round participation and host controls (v3.0)

- New players may join during **Clues** or **Voting**; they are always ordinary players (never the Imposter for the current round). They immediately receive the current secret word and may vote if voting is open. Existing players and the Imposter stay unchanged. Late joining during **Results** is blocked until the lobby.
- **New word / Nueva palabra**: keeps the current Imposter if still connected, fetches a new word from the no-repeat word store, increments the round number, resets votes, and returns everyone to Clues. If the prior Imposter disconnected, a new Imposter is selected among currently connected players.
- **Restart round / Reiniciar ronda**: chooses a fresh word and a newly randomized Imposter from all connected players, clears votes and returns to Clues. A randomly selected new Imposter might coincidentally be the same person as before.
- Both host actions require at least three connected players and confirmation. Role cards must be revealed again after reroll or restart. The UI keeps the host-only word hidden.
- **Word history:** every reroll/restart consumes another unique word from the current cycle (unless the word bank has been exhausted).
- Players joining during voting can vote immediately; if you want everyone to give a clue first, the host can use New word to start a fresh clue phase.
