# Imposter Party — Clues, Change Vote & Timer (v4)

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

## Session isolation and host lifetime (v4)

- Player identities belong to individual browser-tab sessions; refreshing keeps the same player identity, while a duplicate tab cannot take over an active connection.
- There is **no host recovery key** and no manual recovery feature. A host refresh in the same tab can reconnect during the short grace period. If that period expires, the entire room closes and every player must join a new room.
- Default host disconnect grace: **4 seconds**. Configure `HOST_DISCONNECT_GRACE_MS` only if you intentionally need a different duration. Remove any old Render setting of `120000` to use the new default.
- A server restart or Render deployment ends all active rooms. Word history may survive separately when a database is configured.

## The new clue and voting flow

1. Everyone joins, then the host starts the round with 3+ connected players.
2. Each player privately reveals the secret word or Imposter role. Players **take turns aloud in real life**; after speaking, each types a clue of up to 100 characters into their phone and taps **Submit clue / Enviar pista**.
3. Everyone sees each submitted clue exactly as typed in the shared clue board (without auto-translation). The host can open voting **only once all currently connected round participants have submitted**. If someone disconnects, their missing clue doesn't block the round; if someone joins during clues, they must also submit.
4. Voting shows a host-selected 30/60/90/120/180/240/300 second **informational countdown** (90 default). Overtime is displayed, but the game never auto-locks votes, reveals the Imposter, or advances when time runs out.
5. Players select a name, then **Submit vote / Enviar voto**. Their selection becomes locked after submission. **Change vote / Cambiar voto** explicitly withdraws the submitted vote and unlocks selection, so they can choose and submit a replacement before the host reveals results.
6. The host can reveal results at any time during voting, regardless of vote count or timer. **New word** and **Restart round** clear submitted clues, votes and the timer, returning to clues with appropriate role behavior.

Late joins during **voting** receive the secret word as a non-Imposter, can see the already submitted clues and can vote without submitting a clue. Late joins during clues must submit before the host can start voting. New joins are disabled during results. Submitted clues are public to room participants (and anyone with the live room code). Avoid including private information.

## Verification

Run `npm test`: simulated server, UI-structure and word-history tests. These tests do not verify real phones or hosted Socket.IO connections. Before a game night, confirm the full flow with 3 phones on your Render deployment.


## Audit v4.2.1

See `AUDIT.md` for confirmed fixes, remaining connectivity limitations, and recommended live-device acceptance checks.
