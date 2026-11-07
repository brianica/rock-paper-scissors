# Deploy to https://brianica.github.io/rockpaperscissor/

Drop-in replacement for `rockpaperscissor/` in
[brianica/brianica.github.io](https://github.com/brianica/brianica.github.io).

Merged from the live Pages tree plus:

- Default countdown audio `woman.mp3` (live still pointed at missing `rps2.mp3`)
- `beginListening()` so a failed `play()` still starts the gesture window
- On load, sync `#sound-select` into `#countdown-sound`, and ignore stale
  `localStorage.sound` values that are not in the dropdown (for example `rps2.mp3`)

## Publish

```bash
git clone https://github.com/brianica/brianica.github.io.git
cp -a pages-deploy/rockpaperscissor/. brianica.github.io/rockpaperscissor/
cd brianica.github.io
git add rockpaperscissor
git commit -m "fix(rockpaperscissor): human voice default, listening fallback, sound sync"
git push origin main
```
