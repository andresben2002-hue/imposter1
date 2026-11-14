# Hybrid players — v4.4

## One host, individual phones and shared phones

1. Host creates a room and phone owners join normally (one owner per connected phone).
2. Host opens **Manage players / Administrar jugadores** and types the name of an additional person.
3. Host selects **Host-managed** for a person without a phone, or chooses the name of the **phone owner** to assign that person to a shared device.
4. Repeat for every additional person. A group of four on one phone = one regular player + three players assigned to that phone.
5. Start the round once at least three people are **present**, including managed/shared seats.
6. On a shared phone, open **Shared phone / Teléfono compartido**, choose the correct person's name, tap reveal, and then hide before handing the phone to the next person. Each person has a separate secret, clue and vote.
7. The host may edit a clue during clues or update a vote during voting under Manage players. **Host edits are authoritative** and can override a player's earlier submission.
8. For a completely offline host-managed player, the host can submit their clue and vote. To privately show a role, use **Private role** with the display *not visible* to other players. This is not suitable on a projected TV. Instead, assign offline players to a shared phone whenever possible.
9. You can change which connected phone controls a managed player using the dropdown. The host can remove extra seats in the lobby or after results.

## Rules and limits

- Each person gets one independent seat and one vote, regardless of phone count.
- The original single-Imposter selection still applies across all present people, including managed players.
- Joining mid-round is allowed; newly added people get the existing word and cannot be the Imposter until a new round.
- A host-managed person is considered present while the host connection is live. Shared people are considered present while their assigned phone owner is connected.
- The shared role is never included in public room broadcasts; only the authorized controller can request it.
- The role shown to an offline host-managed player is private only if the display itself is private.
- During voting, managed votes can be changed by the controlling phone or the host. Regular phone votes still require Change vote first.
- The host controls edit **submitted clue words**, not the secret word. New Word and Restart Round still work as before.
- Room data remains in server memory; Render restarts still end current rooms. Word-history persistence depends on configured storage.

## Deploy

Replace all application files in the existing GitHub repository (particularly server.js and public/host.js, public/host.html, public/player.js, public/player.html). Deploy the latest commit on Render, then hard refresh host and player pages and create a new room.

## Test before game night

Host + 1 phone owner + 3 shared seats; reveal each role in turn; enter four separate clues; open voting; cast/change four separate votes; reveal; then reassign a managed seat to another connected phone in the next round.

## Validation

Automated server and DOM-simulation tests; not a real-device deployment/browser end-to-end test.
