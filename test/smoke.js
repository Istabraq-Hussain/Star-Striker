'use strict';
/* Headless smoke test: stubs browser APIs and plays the game programmatically. */
const path = require('path');
const { createGame, W, H } = require(path.join(__dirname, '..', 'game.js'));

const storageData = {};
const storage = {
  getItem: k => (k in storageData ? storageData[k] : null),
  setItem: (k, v) => { storageData[k] = String(v); },
};
function anyStub() {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => 0; return proxy; },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
const ctxStub = anyStub();

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('ok   -', msg);
  else { failures++; console.error('FAIL -', msg); }
}
function step(g, n, dt) {
  dt = dt || 1 / 60;
  for (let i = 0; i < n; i++) g.update(dt);
}

const g = createGame({ storage });

// start-level override (?level=2 / key 2)
const gStart = createGame({ storage, startLevel: 2 });
gStart.press('enter');
assert(gStart.level === 2, 'startLevel option starts at level 2');

// 1. title -> play
assert(g.state === 'title', 'starts on title screen');
g.render(ctxStub);
g.press('enter');
assert(g.state === 'play', 'Enter starts the game');
assert(g.lives === 3 && g.bombs === 3 && g.weapon === 1, 'start state: 3 lives, 3 bombs, weapon 1');

// 2. movement + firing
const x0 = g.player.x;
g.setKey('right', true); step(g, 30); g.setKey('right', false);
assert(g.player.x > x0, 'player moves right');
let maxBullets = 0;
g.setKey(' ', true);
for (let i = 0; i < 60; i++) { g.update(1 / 60); maxBullets = Math.max(maxBullets, g.bullets.length); }
assert(maxBullets > 0, 'holding Space fires bullets');

// focus mode (Shift) slows the whole world, not just the player
g.enemies.push({ type: 'drone', x: 100, y: 50, baseX: 100, r: 12, hp: 1, maxHp: 1, speed: 95, score: 100, color: '#ff5fd0', t: 0, phase: 0, fireCd: 999, fireMul: 1, dead: false });
const fy0 = g.enemies[0].y; step(g, 60); const dyNormal = g.enemies[0].y - fy0;
g.setKey('shift', true); const fy1 = g.enemies[0].y; step(g, 60); const dyFocus = g.enemies[0].y - fy1; g.setKey('shift', false);
assert(dyFocus < dyNormal * 0.6, 'focus mode slows enemies too (dy ' + dyNormal.toFixed(1) + ' -> ' + dyFocus.toFixed(1) + ')');

// 3. waves advance + enemy bullets appear (invincible so the run is deterministic)
let maxEB = 0, sawScore = 0;
g.player.inv = 9999;
g.weapon = 4;
let frames = 0;
while (g.wave < 2 && frames < 60 * 45) {
  if (g.enemies.length) g.player.x = g.enemies[0].x;
  g.update(1 / 60); frames++;
  maxEB = Math.max(maxEB, g.ebullets.length);
  sawScore = Math.max(sawScore, g.score);
}
g.setKey(' ', false);
g.weapon = 1;
assert(g.wave >= 2, 'waves advance (reached wave ' + g.wave + ' in ' + frames + ' frames)');
assert(maxEB > 0, 'enemies fire bullets (max ' + maxEB + ' on screen)');
assert(sawScore > 0, 'kills score points (score ' + sawScore + ')');

// scout enemy spawns and renders
g.player.inv = 9999;
g.spawns.push({ type: 'scout', x: 100, y: -20, t: 0.01 });
g.spawns.push({ type: 'raider', x: 300, y: -20, t: 0.01 });
step(g, 5);
assert(g.enemies.some(e => e.type === 'scout'), 'scout enemy spawns');
assert(g.enemies.some(e => e.type === 'raider'), 'raider (kitbash) enemy spawns');
g.render(ctxStub);

// focus meter: drains while focusing, refills when not, locks at 0 until refilled
g.player.inv = 9999;
g.setKey('shift', true); step(g, 60);
assert(g.player.focus === true && g.focusMeter < 100, 'focus drains the meter (' + g.focusMeter.toFixed(0) + ')');
g.setKey('shift', false); const m0 = g.focusMeter; step(g, 120);
assert(g.focusMeter > m0, 'focus meter refills when not focusing (' + m0.toFixed(0) + ' -> ' + g.focusMeter.toFixed(0) + ')');
g.setKey('shift', true);
let locked = false;
for (let i = 0; i < 40 && !locked; i++) { step(g, 10); if (g.focusLock) locked = true; }
step(g, 5);
assert(locked && g.player.focus === false, 'focus locks out when the meter is empty');
g.setKey('shift', false); step(g, 400);
assert(g.focusLock === false && g.focusMeter >= 35, 'focus unlocks after refilling');
g.setKey('shift', true); step(g, 30);
assert(g.player.focus === true, 'focus usable again after refill');
g.setKey('shift', false);

// asteroids only spawn from level 2 on
g.level = 2; g.enemies.length = 0; g.spawns.length = 0; g.waveTimer = 0.01;
step(g, 3);
assert(g.spawns.some(s => s.type === 'asteroid') || g.enemies.some(e => e.type === 'asteroid'), 'asteroids spawn on level 2+');
g.level = 1; g.enemies.length = 0; g.spawns.length = 0; g.waveTimer = 0.01;
step(g, 3);
assert(!g.spawns.some(s => s.type === 'asteroid') && !g.enemies.some(e => e.type === 'asteroid'), 'no asteroids on level 1');
g.level = 1;

// 4. bomb clears enemy bullets
g.ebullets.push({ x: 100, y: 100, vx: 0, vy: 100, r: 4 });
const bombsBefore = g.bombs;
g.press('x');
assert(g.bombs === bombsBefore - 1 && g.ebullets.length === 0, 'bomb consumes a charge and clears enemy bullets');

// 5. pause / resume (P must work while paused)
g.press('p');
assert(g.paused === true, 'P pauses');
step(g, 5);
g.press('p');
assert(g.paused === false, 'P resumes while paused');
g.press('escape');
assert(g.paused === true, 'Esc pauses too');
g.press('escape');
assert(g.paused === false, 'Esc resumes');

// 6. boss on wave 5 with bullet patterns
g.enemies.length = 0; g.spawns.length = 0; g.boss = null;
g.wave = 4; g.waveTimer = 0.01;
step(g, 5);
assert(g.wave === 5 && g.boss, 'wave 5 spawns a boss');
let bossEB = 0;
g.setKey(' ', true);
for (let i = 0; i < 60 * 10; i++) {
  g.update(1 / 60);
  bossEB = Math.max(bossEB, g.ebullets.length);
  if (!g.boss) break;
}
assert(bossEB > 0, 'boss emits bullet patterns (max ' + bossEB + ' bullets)');
g.render(ctxStub);

// 7. kill the boss
g.player.inv = 9999; g.weapon = 4;
if (g.boss) g.boss.hp = 20;
for (let i = 0; i < 60 * 20 && g.boss; i++) {
  g.player.x = g.boss.x; g.player.y = H - 60;
  g.update(1 / 60);
}
assert(!g.boss && g.bossKills === 1, 'boss can be killed (bossKills=' + g.bossKills + ')');
g.setKey(' ', false);
assert(g.state === 'clear', 'killing the first boss finishes level 1 (LEVEL CLEAR screen)');
g.render(ctxStub);
g.press('enter');
assert(g.state === 'play' && g.level === 2, 'Enter continues to level 2 after the clear screen');

// level 2 boss is the sprite ship with animated flame
g.wave = 9; g.waveTimer = 0.01; g.enemies.length = 0; g.spawns.length = 0; g.ebullets.length = 0;
step(g, 5);
assert(g.boss && g.boss.sprite === true, 'level 2 boss uses the sprite ship');
g.render(ctxStub);

// 8. game over + hi-score persisted
g.lives = 1; g.player.inv = 0;
g.ebullets.push({ x: g.player.x, y: g.player.y, vx: 0, vy: 0, r: 4 });
step(g, 3);
assert(g.state === 'over', 'losing the last life ends the game');
assert(g.hi === g.score && g.hi > 0, 'hi-score updated to final score (' + g.hi + ')');
assert(storageData['starstriker_hi'] === String(g.hi), 'hi-score persisted to storage');
g.render(ctxStub);
const g2 = createGame({ storage });
assert(g2.hi === g.hi, 'new session loads persisted hi-score');

// 9. restart
g.press('enter');
assert(g.state === 'play' && g.score === 0 && g.lives === 3 && g.wave === 0, 'Enter restarts after game over');

// 10. soak: 6000 frames of random input, must not crash
let maxEnemies = 0, soakErr = null;
try {
  const dirs = ['up', 'down', 'left', 'right'];
  for (let i = 0; i < 6000; i++) {
    for (const d of dirs) g.setKey(d, Math.random() < 0.25);
    g.setKey(' ', Math.random() < 0.8);
    g.setKey('shift', Math.random() < 0.2);
    if (i % 300 === 0) g.press('x');
    if (i % 700 === 350) g.press('p');
    g.update(1 / 60);
    maxEnemies = Math.max(maxEnemies, g.enemies.length);
    if ((g.state === 'over' || g.state === 'clear') && i % 500 === 100) g.press('enter');
  }
} catch (e) { soakErr = e; }
assert(!soakErr, 'soak: 6000 random-input frames without errors' + (soakErr ? ' — ' + soakErr.message : '') + ' (maxEnemies=' + maxEnemies + ', state=' + g.state + ', bossKills=' + g.bossKills + ')');
assert(['title', 'play', 'over', 'clear'].indexOf(g.state) >= 0, 'soak ends in a valid state');

console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
