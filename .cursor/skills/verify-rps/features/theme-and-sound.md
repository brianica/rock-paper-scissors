# Theme and sound

Theme and sound let a user switch between dark and light chrome and pick which countdown audio file the webcam path will play.

## Sub-features

- `theme-light` adds `light-theme` on `body` when the switch is checked.
- `theme-dark` removes `light-theme` when the switch is unchecked.
- `sound-classic` selects `rps2.mp3` (label Classic).
- `sound-robotic` selects `rps.mp3` (label Robotic).

## How to get to it (user POV)

- Use the **Switch Theme** control in the top theme bar.
- Use the **Sound** dropdown (`Classic` / `Robotic`) next to it.

## Driving it with control-rps

Preconditions:

- Instance is healthy (`control-rps doctor`).

- **Toggle theme.** Run `control-rps browser toggle --id checkbox`. Response `themeLight` flips relative to the previous state; `document.body` gains or loses class `light-theme`.
- **Select robotic sound.** Run `control-rps browser select --id sound-select --value rps.mp3`. Response `sound` is `rps.mp3` and `#countdown-sound` `src` is `rps.mp3`.
- **Select classic sound.** Run `control-rps browser select --id sound-select --value rps2.mp3`. Response `sound` is `rps2.mp3`.
- **Proof.** `control-rps browser snapshot --path .cursor/skills/verify-rps/artifacts/theme-and-sound/state.snapshot.json` and a screenshot under the same folder showing the heading and theme controls.

## Gotchas

- Theme and sound preferences persist in `localStorage` (`theme`, `sound`) inside the Chrome profile for this `VERIFY_RPS_RUN_ID`. A new run id starts clean; reusing a profile directory can restore prior choices.
- Selecting a sound only changes the `<audio>` element source. The repo may not ship `rps.mp3` / `rps2.mp3`; missing files do not block this preference UI, but webcam countdown playback will fail until the assets exist.
- Do not treat a successful select as proof that audio downloads or plays.
