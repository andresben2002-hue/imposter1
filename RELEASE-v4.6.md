# Imposter Party v4.6 — bilingual UI and guided pass-the-phone

## Language changes

- All static host, player and home screen labels with translation tags have Spanish equivalents.
- Removed the combined English / Spanish wording from the newer host controls, shared phone controls, alerts and confirmations. The EN/ES selector switches the entire interface.
- Added locale-aware rendering for host-managed player controls and their status messages, including new-word/restart prompts.
- Player-submitted clues remain exactly as typed; player names are not translated. English and Spanish versions of the secret word are still drawn from the same bilingual word record.
- The game's wordmark is translated as IMPOSTER PARTY / IMPOSTOR FIESTA as a language-specific label.

## Guided shared-phone flow

1. Start a round with a player who has a connected phone plus one or more host-created players assigned to that phone. Host: **Manage players** → assign a phone controller.
2. On that phone, the previous separate reveal controls are replaced by one guided pass-the-phone card. It shows the next player's name.
3. Hand the phone to that person and tap **Reveal my role**.
4. They can speak their clue and type their word/phrase, then tap **Submit clue and hide role**.
5. The phone displays a private-safe handoff screen and a **Pass to next player** button; the next person's name appears before their role can be revealed.
6. If someone already submitted a clue or needs to postpone their turn, **Hide and pass phone** safely hides the role without submitting anything. The host cannot open voting until everyone required has submitted.
7. In voting, the guided flow also supports separate votes for each person using that phone. A vote is locked after submission until they explicitly choose **Change vote**.

Standalone player phones retain their original reveal/clue/voting workflow. No server gameplay rules were changed.

## Deployment

Replace your existing repository files with the **contents** of this `imposter-party` directory (including `public/`); do not upload the ZIP or create an extra nested directory. Commit to the branch Render deploys. Confirm matching GitHub/Render commit hashes, deploy the latest commit, and hard-refresh the host and player browsers. Cache-buster query strings were updated to `v=4.6`.

## Verification

- `npm test`: 38/38 automated tests passed, including four added presentation/translation tests.
- `node --check public/*.js`: no JavaScript syntax errors.
- Browser and live Render multi-device tests were not performed. Verify the guided flow with at least two people sharing one phone and another connected player before game night.
