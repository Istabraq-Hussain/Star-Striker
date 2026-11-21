# Star Striker — Vertical Shoot-'em-Up

An original arcade-style vertical scrolling shooter that runs in any modern browser.
Zero dependencies, zero build step — plain HTML5 Canvas + WebAudio.

## Run it

Open `index.html` directly in a browser (works from `file://`, fully offline), or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Move |
| Space (hold) | Fire |
| Shift (hold) | Focus mode — slow movement, shows your tiny hitbox, slows the whole world to 45%; drains the FOCUS bar (refills when not used, locks at 0 until refilled) |
| X | Bomb (clears enemy bullets, damages everything on screen) |
| P or Esc (or click the ❚❚ button top-right) | Pause / resume |
| M | Toggle sound |
| Enter | Start / retry |

## Features

- Parallax starfield, screen shake, particle explosions
- 9 enemy types in rotating wave formations that scale with wave number: drone, weaver, tank, gunner, scout (organic creature remixed from `scout_top_teal.png`), plus raider/stalker/brute/phantom — kitbashed from Ship2/4/5/6.png (front/mid/rear sections recombined), rotated 90° to face the player, and recolored
- Boss every 5th wave: radial bursts, aimed spreads, spiral patterns, drone summons, HP bar; killing the boss shows a LEVEL CLEAR screen and Enter starts the next (harder) level. Level 1 boss is the star; from level 2 the boss is your sprite ship with an animated engine flame (3 flicker frames)
- Limited focus meter: drains while focusing, regenerates otherwise
- Asteroid obstacles (from `asteroids.png`, 8 variants) drift in from level 2 onward — shoot them or dodge; they don't break on contact
- Weapon power-ups up to a 4-level spread, bombs, rare 1UP drops
- Tiny 3px hitbox (focus mode reveals it) — classic bullet-hell feel
- Pixel-art sprite player ship (purple & yellow, Moroccan-style wings) with left/right banking poses while moving, sprite enemies in 4 distinct colors, and sprite bullets (bolt / missile / enemy orb), with vector fallback if images aren't loaded
- Synthesized sound effects and a chiptune bass loop via WebAudio (no audio files)
- Persistent hi-score via `localStorage`
- Title / pause / game-over screens, arcade cabinet styling with CRT scanlines

## Files

- `index.html` — page shell with the canvas
- `style.css` — arcade cabinet + scanline styling
- `game.js` — the entire game (also loadable in Node for testing: `require('./game.js')`)
- `test/smoke.js` — headless smoke test that stubs the browser APIs and plays the game programmatically
- `assets/sprites/` — pixel-art sprites remixed from source sheets, loaded at runtime with the built-in vector drawing as fallback: player ship (center pose with Moroccan-style purple/yellow wings, plus left/right banking poses used while moving), 4 enemy ships in distinct colors, scout enemy, bolt/missile/blast weapons, pink enemy orb
- `README.md` — this file

## Tests

```sh
node test/smoke.js
```

Covers: title → play transition, movement, firing, wave progression, enemy bullets,
bomb, pause/resume, boss spawn on wave 5 with bullet patterns, boss kill, game over,
hi-score persistence across sessions, restart, plus a 6000-frame random-input soak run.
