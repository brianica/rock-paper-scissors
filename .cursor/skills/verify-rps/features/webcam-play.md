# Webcam play

Webcam play runs an automatic countdown loop: the user clicks Start Game, hears/sees a countdown, shows a hand to the camera, and the app classifies Rock/Paper/Scissors then calls the same round resolver as the buttons.

## Sub-features

- `webcam-ready` enables Start Game after models and camera initialize (`#status` becomes Ready…).
- `webcam-start` begins a round (`#start-game-btn` shows Game in Progress, game column dims).
- `webcam-round` produces a detected move or a void/missed round in `#player-move` / `#results`.
- `webcam-stop` returns to idle via Escape (`#status` Game ended…).

## How to get to it (user POV)

- Allow camera access when the browser prompts.
- Wait until **Start Game** is enabled and status says ready.
- Click **Start Game**, show a hand after the countdown, or press **Esc** to stop.

## Driving it with control-rps

Preconditions:

- Instance is healthy (`control-rps doctor`).
- A camera (real or Chrome fake device) is available to the browser profile.
- Network can load TensorFlow.js, handpose, Teachable Machine, and `https://teachablemachine.withgoogle.com/models/l34xcyd-z/`.
- Countdown audio files referenced by `#sound-select` exist if you assert audible countdown (repo may omit them).

- **Wait for ready.** Poll a snapshot until `startGameDisabled` is `false` and `status` contains `Ready`. If `#status` is `Error: Could not start webcam.` or `visionDisplay` is `none`, stop and report the unmet camera/model precondition — do not continue.
- **Start.** Run `control-rps browser click --id start-game-btn` only when enabled. `#start-game-btn` text includes `Game in Progress`.
- **Observe a round.** After the listening window, snapshot `#player-move`, `#results`, and `#status`. A valid detection shows a move name; a miss shows `You played: (Missed)` and `Result: Round void`.
- **Stop.** Run `control-rps browser key --key Escape`. `#status` returns to a Game ended / Start Game idle message and the game column is no longer dimmed.
- **Proof.** Screenshots/snapshots under `.cursor/skills/verify-rps/artifacts/webcam-play/` must show Start Game state transitions. Button-play artifacts do not count.

## Gotchas

- Headless agents often hang on `Loading Models...` or hide `#vision-column` when `getUserMedia` fails. That is a failed webcam journey, not a reason to call `playGame` from the console.
- Fake media streams do not produce a hand; expect `(Missed)` / void rounds unless a real gesture or injected frame pipeline exists.
- Missing `rps2.mp3` / `rps.mp3` can stall the countdown `onended` handler so listening never starts — note missing assets in the failure reason.
- Never mark this feature verified solely because button play works.
