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
    if (g.state === 'over' && i % 500 === 100) g.press('enter');
  }
} catch (e) { soakErr = e; }
assert(!soakErr, 'soak: 6000 random-input frames without errors' + (soakErr ? ' — ' + soakErr.message : '') + ' (maxEnemies=' + maxEnemies + ', state=' + g.state + ', bossKills=' + g.bossKills + ')');
assert(['title', 'play', 'over'].indexOf(g.state) >= 0, 'soak ends in a valid state');

console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
