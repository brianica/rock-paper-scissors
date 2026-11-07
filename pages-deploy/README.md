# Deploy to https://brianica.github.io/rockpaperscissor/

This folder is a drop-in replacement for the `rockpaperscissor/` directory in
[brianica/brianica.github.io](https://github.com/brianica/brianica.github.io).

## Why this is separate

GitHub Pages for that URL is served from the user site repo `brianica.github.io`,
not from `rock-paper-scissors`. Cloud agents in this repo cannot push to
`brianica.github.io` (no write permission).

## Publish

From a machine that can push to `brianica/brianica.github.io`:

```bash
git clone https://github.com/brianica/brianica.github.io.git
cp -a pages-deploy/rockpaperscissor/. brianica.github.io/rockpaperscissor/
cd brianica.github.io
git add rockpaperscissor
git commit -m "fix(rockpaperscissor): unblock webcam listening when audio fails"
git push origin main
```

Pages usually updates within a minute at https://brianica.github.io/rockpaperscissor/
