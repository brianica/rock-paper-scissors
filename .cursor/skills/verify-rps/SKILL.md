---
name: verify-rps
description: Verify the Rock Paper Scissors AI static web app (button play, score reset, theme/sound, webcam path) by launching a local static server and driving Chrome via control-rps. Use when proving user-facing game behavior after changes to index.html or rockpaperscissor.js.
---

# Verify Rock Paper Scissors AI

Project-local verification for the static web game at the repo root (`index.html` + `rockpaperscissor.js`). Primary surface is the browser UI. There is no CLI, API server, or package build — only static files.

Put `control-rps` on `PATH` for a run:

```bash
export PATH="$PWD/.cursor/skills/verify-rps/bin:$PATH"
```

Or invoke it with an absolute path. All commands below assume `control-rps` is on `PATH`.

## Launch

Starts an isolated Python static file server for this run and writes state under `/tmp/verify-rps-$VERIFY_RPS_RUN_ID/`.

```bash
export VERIFY_RPS_RUN_ID="proof-$(date +%s)"
# optional: export VERIFY_RPS_PORT=8765
control-rps launch
```

Ready when:

- `http://127.0.0.1:<port>/index.html` returns 200 with title `Rock Paper Scissors AI`
- `rockpaperscissor.js` is reachable

Launch does **not** wait for Teachable Machine / handpose model download or webcam permission — those are webcam-path concerns. Button play is usable as soon as launch succeeds.

Teardown: `control-rps cleanup` (see Cleanup). Never kill by process name; only the PID recorded for this `VERIFY_RPS_RUN_ID`.

Isolation:

- One launch per `VERIFY_RPS_RUN_ID`. A second `launch` for the same id refuses if the recorded PID is still alive.
- Prefer a unique `VERIFY_RPS_RUN_ID` and let `launch` pick a free port when `VERIFY_RPS_PORT` is taken.
- Do not drive a server you did not start with this skill.

## Doctor

Read-only health check. Run first whenever anything looks off:

```bash
control-rps doctor
```

Requires: process alive, HTTP 200 for the recorded URL, page title present, move buttons (`rock` / `paper` / `scissors`) and `rockpaperscissor.js` referenced. Exit code `0` only when `ok: true`.

## Drive

Harness: Chrome (system binary) driven by Puppeteer via `control-rps browser …`. Stable handles are DOM ids and visible button labels from this app:

| Control | Handle |
| --- | --- |
| Rock | `#rock` / name `Rock` |
| Paper | `#paper` / name `Paper` |
| Scissors | `#scissors` / name `Scissors` |
| Reset Score | `#reset-score-btn` / name `Reset Score` |
| Theme toggle | `#checkbox` (use `browser toggle`) |
| Sound select | `#sound-select` values `rps2.mp3` (Classic), `rps.mp3` (Robotic) |
| Start Game (webcam) | `#start-game-btn` |

Observable result fields after a button round (text written by `playGame` in `rockpaperscissor.js`):

- `#player-move` → `You played: <Rock|Paper|Scissors>`
- `#agent-move` → `Agent played: <Rock|Paper|Scissors>` (label becomes **Agent**, not the initial HTML "AI")
- `#results` → `Result: <You Win!|Agent Wins!|It's a Tie!>`
- `#win-rate` → `Agent Win Rate (vs. you, excluding ties): <pct>% (<wins>/<decisive>)`

Examples:

```bash
control-rps browser click --id rock
control-rps browser click --name "Reset Score"
control-rps browser toggle --id checkbox
control-rps browser select --id sound-select --value rps.mp3
control-rps browser snapshot --path .cursor/skills/verify-rps/artifacts/button-play/after-rock.snapshot.json
control-rps browser screenshot --path .cursor/skills/verify-rps/artifacts/button-play/after-rock.png
control-rps browser key --key Escape
```

Chrome stays up across `browser` commands (CDP) so in-memory score/round state persists until `cleanup`. Feature recipes live in `features/`. Read `features/README.md` first, then the matching feature file. Prefer the map’s entry points over ad-hoc shortcuts.

## Evidence

Store proof under `.cursor/skills/verify-rps/artifacts/<feature-id>/`. That directory survives `cleanup`.

Proof standards:

- Exercise the real UI path (click `#rock` / `#paper` / `#scissors`), not calling `playGame` from the console.
- Capture **action + resulting state**: a snapshot/screenshot after the click showing `#player-move`, `#agent-move`, `#results`, and `#win-rate`.
- For score reset, show a non-zero win-rate before reset and `0.0% (0/0)` after.
- For theme/sound, show class/value change and a screenshot with the page identity (`Play Rock, Paper, Scissors with AI`) visible.
- Webcam rounds need a real or faked camera feed and the remote models; if Start Game never enables, record the `#status` text and treat the path as blocked (see feature gotchas) — do not fake a win by calling `playGame` from DevTools.

## Cleanup

```bash
control-rps cleanup
```

Kills only the HTTP server PID recorded for `VERIFY_RPS_RUN_ID`, then deletes `/tmp/verify-rps-$VERIFY_RPS_RUN_ID/` (logs, chrome profile, state). Does **not** delete `.cursor/skills/verify-rps/artifacts/`.

## Helpers

| Command | Purpose |
| --- | --- |
| `control-rps launch` | Start isolated static server; print `VERIFY_RPS_RUN_ID`, URL, PID |
| `control-rps doctor` | JSON health report; exit 1 if unhealthy |
| `control-rps browser click --id <id>` | Click a control; print before/after game text |
| `control-rps browser click --name <label>` | Same by visible button text |
| `control-rps browser toggle --id checkbox` | Toggle theme |
| `control-rps browser select --id sound-select --value <file>` | Change countdown sound |
| `control-rps browser key --key Escape` | Send a key (webcam stop) |
| `control-rps browser snapshot --path <file>` | Write JSON DOM snapshot |
| `control-rps browser screenshot --path <file>` | Full-page PNG |
| `control-rps cleanup` | Stop Chrome + HTTP server for this run; keep artifacts |

First use installs `puppeteer-core` into `.cursor/skills/verify-rps/lib/` via `npm install` if `node_modules` is missing. Requires Node, `python3`, `curl`, and Chrome at `VERIFY_RPS_CHROME` (default `/usr/local/bin/google-chrome`).
