# Version 4.7 — Shared-phone navigation repair

- Fixed `managed:role` response handling. The server's role payload is now passed through the request callback to the shared player's reveal screen. This specifically fixes the second person's reveal failure.
- Shared-phone controls now include **Previous player** and **Next player** in both English and Spanish.
- The controls are available before reveal, during a private turn, and after submission. Switching always clears the prior person's private word and clue entry and returns to the named-person reveal cover.
- The phone owner's seat plus up to two managed seats can share one phone (maximum three players). The server rejects an additional assignment to that phone; other phones and host-managed players remain supported.
- Submitted clues/votes remain recorded when going backward or forward. A person can return to view their private role, but cannot submit the same clue twice. Managed votes can be edited with Change vote.
- No changes to normal online play, word selection, or timing.

## Deploy
Upload the **contents** of this folder into the existing GitHub repository, keeping `server.js` at repository root and `public/` in place. Deploy that commit in Render. On phone, reopen the page after deployment to refresh cached JS.

## Test coverage
`node --test`: 40/40 passed, including previous regression tests, shared-role callback wiring, navigation, and max seats per phone. These are automated tests, not physical-device verification.
