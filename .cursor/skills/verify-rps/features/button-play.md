# Button play

Button play lets a user fight one round against the AI by choosing Rock, Paper, or Scissors with on-screen buttons, then see both moves, a win/lose/tie result, and an updated Agent win rate.

## Sub-features

- `button-rock` plays Rock and shows the player move as Rock.
- `button-paper` plays Paper and shows the player move as Paper.
- `button-scissors` plays Scissors and shows the player move as Scissors.
- `button-result` shows an Agent reply and a Result of You Win!, Agent Wins!, or It's a Tie!.
- `button-win-rate` updates Agent Win Rate after a decisive (non-tie) round.

## How to get to it (user POV)

- Open the app and use the **Play with Buttons** column.
- Click `Rock`, `Paper`, or `Scissors`.
- Read `You played`, `Agent played`, `Result`, and `Agent Win Rate` under the move icons.

## Driving it with control-rps

Preconditions:

- `control-rps doctor` reports `"ok": true`.
- Page heading is `Play Rock, Paper, Scissors with AI`.
- Buttons `#rock`, `#paper`, and `#scissors` are present.

- **Play Rock.** Click Rock. Run `control-rps browser click --id rock`. `#player-move` becomes `You played: Rock`. `#agent-move` matches `Agent played: (Rock|Paper|Scissors)`. `#results` matches `Result: (You Win!|Agent Wins!|It's a Tie!)`.
- **Play Paper.** Click Paper. Run `control-rps browser click --id paper`. `#player-move` becomes `You played: Paper` with a fresh Agent move and Result.
- **Play Scissors.** Click Scissors. Run `control-rps browser click --id scissors`. `#player-move` becomes `You played: Scissors`.
- **Confirm win-rate text.** After at least one non-tie round, `#win-rate` matches `Agent Win Rate (vs. you, excluding ties):` with a `(wins/decisive)` pair where decisive ≥ 1.
- **Proof.** Run `control-rps browser snapshot --path .cursor/skills/verify-rps/artifacts/button-play/after-moves.snapshot.json` and `control-rps browser screenshot --path .cursor/skills/verify-rps/artifacts/button-play/after-moves.png`. Artifacts show the heading and a concrete You played / Agent played / Result line.

## Gotchas

- After the first round, labels say **Agent played** and **Agent Win Rate**, even though the initial HTML markup says "AI". Assert the post-round strings.
- Ties do not increment the decisive denominator. A single tie alone leaves `(0/0)`.
- While a webcam round is in progress the game column is dimmed (`dimmed-column`); finish or ESC that path before treating button clicks as the primary proof.
- Do not call `playGame(...)` from the console — that is not the user path.
