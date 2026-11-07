# Reset score

Reset Score clears the running Agent win-rate counters so the display returns to a fresh `0.0% (0/0)` without reloading the page.

## Sub-features

- `reset-clear` sets the win-rate line back to `0.0% (0/0)`.
- `reset-preserves-last-round` leaves the last You/Agent/Result text visible after reset (only the rate counters clear).

## How to get to it (user POV)

- Play at least one decisive button round so the win-rate is not `(0/0)`.
- Click `Reset Score` under the win-rate line.

## Driving it with control-rps

Preconditions:

- Instance is healthy (`control-rps doctor`).
- At least one decisive button round has been played so `#win-rate` is not still `(0/0)`.

- **Create a non-zero rate.** Click Rock (or Paper/Scissors) until `#win-rate` shows a decisive count greater than zero. Run `control-rps browser click --id rock` as needed and inspect the click JSON `after.winRate`.
- **Reset.** Click Reset Score. Run `control-rps browser click --id reset-score-btn` (or `--name "Reset Score"`). `#win-rate` becomes `Agent Win Rate (vs. you, excluding ties): 0.0% (0/0)`.
- **Proof.** Snapshot and screenshot under `.cursor/skills/verify-rps/artifacts/reset-score/` showing the cleared win-rate. Keep a before snapshot that showed a non-zero decisive count.

## Gotchas

- Reset does not clear `#player-move` / `#agent-move` / `#results`. Assert the win-rate line, not empty results.
- Reloading the page also zeros scores but is a different path; this feature is the `Reset Score` button only.
- If every round so far tied, win-rate stays `(0/0)` and reset cannot be distinguished from the baseline — keep playing until a decisive round occurs.
