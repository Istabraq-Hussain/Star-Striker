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
| Shift (hold) | Focus mode — slow movement, shows your tiny hitbox |
| X | Bomb (clears enemy bullets, damages everything on screen) |
| P | Pause / resume |
| M | Toggle sound |
| Enter | Start / retry |

## Features

- Parallax starfield, screen shake, particle explosions
- 5 enemy types (drone, weaver, tank, gunner, scout) in rotating wave formations that scale with wave number; the scout is a purple/yellow organic creature sprite remixed from `scout_top_teal.png` (ray-like body, no tentacles)
- Boss every 5th wave: radial bursts, aimed spreads, spiral patterns, drone summons, HP bar
- Weapon power-ups up to a 4-level spread, bombs, rare 1UP drops
- Tiny 3px hitbox (focus mode reveals it) — classic bullet-hell feel
- Pixel-art sprite player ship and weapons (purple & yellow), with vector fallback if images aren't loaded
- Synthesized sound effects and a chiptune bass loop via WebAudio (no audio files)
- Persistent hi-score via `localStorage`
- Title / pause / game-over screens, arcade cabinet styling with CRT scanlines

## Files

- `index.html` — page shell with the canvas
- `style.css` — arcade cabinet + scanline styling
- `game.js` — the entire game (also loadable in Node for testing: `require('./game.js')`)
- `test/smoke.js` — headless smoke test that stubs the browser APIs and plays the game programmatically
- `assets/sprites/` — pixel-art sprites (player ship with Moroccan-style purple/yellow wings, scout enemy, bolt, missile, bomb blast) remixed from source sheets; loaded at runtime with the built-in vector drawing as fallback
- `README.md` — this file

## Tests

```sh
node test/smoke.js
```

Covers: title → play transition, movement, firing, wave progression, enemy bullets,
bomb, pause/resume, boss spawn on wave 5 with bullet patterns, boss kill, game over,
hi-score persistence across sessions, restart, plus a 6000-frame random-input soak run.
