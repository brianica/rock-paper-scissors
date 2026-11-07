# Rock Paper Scissors AI verification map

This directory is the maintained source for verifying user-facing behavior of the Rock Paper Scissors AI static web app. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `control-rps launch` and keep `VERIFY_RPS_RUN_ID` exported for the rest of the run.
- Run `control-rps doctor` and require `"ok": true` for the recorded URL and PID.
- Serve the repo root (`index.html`, `rockpaperscissor.js`). Do not drive a server started outside this skill.
- Prefer a fresh `VERIFY_RPS_RUN_ID` per concurrent agent so ports and Chrome profiles do not collide.
- Button play does not need a webcam. Webcam play does (see that feature’s Gotchas).

## Driving conventions

- Start every recipe from a freshly launched instance unless preconditions say otherwise.
- Prefer DOM ids (`#rock`, `#reset-score-btn`) and visible button names over coordinates.
- Treat every `control-rps` command as literal.
- After mutations, re-read `#player-move`, `#agent-move`, `#results`, and `#win-rate` (or snapshot them).
- Keep proof under `.cursor/skills/verify-rps/artifacts/<feature>/`. Cleanup must not remove those files.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes a JSON snapshot and a screenshot with the page heading `Play Rock, Paper, Scissors with AI` visible.
- Report an unreachable path with the command attempted and the unmet precondition (for example Start Game still disabled).
- Do not report webcam play as verified by clicking the button controls instead.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-rps`, `Gotchas`.

## Features

- [Button play](./button-play.md) — Rock / Paper / Scissors buttons vs the AI, results and win-rate updates.
- [Reset score](./reset-score.md) — clear the Agent win-rate counters.
- [Theme and sound](./theme-and-sound.md) — light/dark theme toggle and countdown sound select.
- [Webcam play](./webcam-play.md) — Start Game countdown path with camera gesture detection.
