# Star Striker — Godot 4 port

Open this folder in the **Godot 4.x editor** (Project Manager → Import/Open → select
`godot/project.godot`) and press **Play** (F5).

- `project.godot` / `main.tscn` — project + main scene
- `main.gd` — the full game (ported from the web `game.js`): banking poses, focus
  slow-mo with meter, bombs, 9 enemy types + asteroids from level 2, sprite boss
  with animated engine flame on level 2+, LEVEL CLEAR flow, pause (P/Esc/button),
  hi-score in `user://hiscore.txt`
- `assets/sprites/` — all sprites from the web build (imported automatically)

Start at level 2: press **2** on the title screen, or run with `--level=2`.

Controls: Arrows/WASD move · Space fire · Shift focus · X bomb · P/Esc pause.

Note: the web build (repo root `index.html`) is unaffected; this folder is standalone.
