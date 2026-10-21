# Subcurrent app prototype

Live after deploy: https://subcurrent-app-prototype.vercel.app (Vercel) and https://thedude0007.github.io/subcurrent-app-prototype/ (GitHub Pages mirror)

A clickable prototype of a Subcurrent fan app and owner portal. It opens on the first show: **Re:Turnal Nights**, Downright & Subcurrent, October 23–24, 2026, Denver, sound by VOID. It is one static page in `docs/` with no build step.

## The 3D layer

- 3D waveform hero: the Subcurrent logo rebuilt as a field of spikes over a scrolling grid floor. It sways, pulses to the beat when a SoundCloud track plays, and turns when you drag it.
- 3D flow field behind the whole app: particles streaming out of a tunnel, faster while music plays.
- Coverflow rail for the nights, with the real Re:Turnal flyer.
- 3D tab bar: the active icon flips and lifts over a sliding glow puck. Screens swing in like a cube when you change tabs.
- Every card tilts in 3D with the pointer or the phone's motion, in the fan app and the owner portal.
- Spinning 3D mark, extruded condensed type in the flyer's style, ember orange on black throughout.

## What is real and what is demo

- Real: the Subcurrent logo, the Re:Turnal Nights flyer and lineup (Bluetech, Flintwick, Ovoid, Rhizomorphic, YOKO, Brickwife, Goosebumpz, Somatoast, Vinja, secret guests), the dates, VOID as the sound partner, and the SoundCloud pages for Bluetech, Flintwick, Ovoid, Rhizomorphic, Goosebumpz, Somatoast and Vinja.
- Demo: set times, doors, prices, past nights, Hallow Current and Undertow Afters, fans, sales and every money figure.
- Generic: Phase 1 checkout points at a "ticket partner" because Subcurrent's ticketing platform isn't confirmed. Swap in the real one (and its event links) once known.
- Simulated: payments, texts, AI flyer reading and the ticket sync.

## Go live (GitHub + Vercel) in one command

You need git and the [GitHub CLI](https://cli.github.com), logged in with `gh auth login`, plus Node 18+ for the Vercel CLI (the script logs you in to Vercel on first run).

```bash
./ship.sh
```

## Update the site

Replace `docs/index.html` and push to `main`. GitHub Pages republishes in about a minute.

## Credits

The Archivo typeface by Omnibus-Type is embedded under the SIL Open Font License 1.1; see `LICENSE-ARCHIVO-OFL.txt`.
