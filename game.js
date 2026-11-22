'use strict';
(function (root) {
  const W = 480, H = 640;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  const TYPES = {
    drone:   { hp: 1, r: 12, speed: 95,  score: 100, color: '#ff5fd0', fire: 1.4 },
    weaver:  { hp: 2, r: 12, speed: 75,  score: 200, color: '#ffd23f', fire: 1.2 },
    tank:    { hp: 6, r: 18, speed: 42,  score: 400, color: '#ff7a3d', fire: 0.9 },
    gunner:  { hp: 3, r: 14, speed: 60,  score: 300, color: '#8d6bff', fire: 0.8 },
    scout:   { hp: 2, r: 13, speed: 115, score: 150, color: '#a855f7', fire: 1.1 },
    raider:  { hp: 2, r: 14, speed: 130, score: 250, color: '#2dd4bf', fire: 1.0 },
    stalker: { hp: 3, r: 14, speed: 70,  score: 350, color: '#4ade80', fire: 0.8 },
    brute:   { hp: 8, r: 20, speed: 35,  score: 600, color: '#60a5fa', fire: 0.7 },
    phantom: { hp: 2, r: 12, speed: 100, score: 300, color: '#e879f9', fire: 1.3 },
    asteroid: { hp: 4, r: 16, speed: 30, score: 50, color: '#9a8c7a', fire: 999 },
  };

  function createGame(opts) {
    opts = opts || {};
    const storage = opts.storage || (typeof root.localStorage !== 'undefined' ? root.localStorage : null);
    const qs = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : null;
    const startLevel = Math.min(99, Math.max(1, parseInt((opts && opts.startLevel) || (qs && qs.get('level')), 10) || 1));
    const game = {
      W, H, state: 'title', paused: false, sound: true, touch: false,
      time: 0, shake: 0, score: 0, hi: 0, wave: 0, waveTimer: 0,
      lives: 3, bombs: 3, weapon: 1, bossKills: 0, dropToggle: 0, musicT: 0,
      level: startLevel, startLevel, focusMeter: 100, focusLock: false,
      player: null, keys: {},
      bullets: [], ebullets: [], enemies: [], parts: [], powerups: [], spawns: [],
      boss: null, stars: [], sprites: {}, blasts: [],
    };
    if (typeof Image !== 'undefined') {
      for (const name of ['player', 'player_left', 'player_left2', 'player_right', 'player_right2', 'bullet', 'special', 'blast', 'scout', 'ebullet', 'enemy_drone', 'enemy_weaver', 'enemy_tank', 'enemy_gunner', 'enemy_raider', 'enemy_stalker', 'enemy_brute', 'enemy_phantom', 'asteroid0', 'asteroid1', 'asteroid2', 'asteroid3', 'asteroid4', 'asteroid5', 'asteroid6', 'asteroid7', 'boss', 'flame0', 'flame1', 'flame2']) {
        const img = new Image();
        img.src = 'assets/sprites/' + name + '.png';
        game.sprites[name] = img;
      }
    }
    const spriteReady = name => {
      const i = game.sprites[name];
      return !!(i && i.complete && i.naturalWidth > 0);
    };
    for (let i = 0; i < 90; i++) game.stars.push({ x: rand(0, W), y: rand(0, H), z: [0.3, 0.6, 1][i % 3] });
    try { game.hi = parseInt((storage && storage.getItem('starstriker_hi')) || '0', 10) || 0; } catch (e) { game.hi = 0; }
    game.player = { x: W / 2, y: H - 80, r: 3, focus: false, inv: 0, fireCd: 0, alive: true, bank: 0 };

    let actx = null;
    function audio() {
      if (!game.sound) return null;
      if (!actx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try { actx = new AC(); } catch (e) { return null; }
      }
      if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
      return actx;
    }
    function beep(freq, dur, type, vol, slide) {
      const a = audio(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), a.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.05, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    const sfx = {
      shoot: () => beep(880, 0.07, 'square', 0.03, 220),
      boom: () => beep(120, 0.35, 'sawtooth', 0.09, 40),
      hit: () => beep(200, 0.5, 'sawtooth', 0.12, 30),
      power: () => { beep(660, 0.08, 'square', 0.05); setTimeout(() => beep(990, 0.1, 'square', 0.05), 70); },
      bomb: () => beep(90, 0.8, 'sawtooth', 0.14, 25),
      boss: () => beep(55, 1.2, 'sawtooth', 0.12, 110),
    };
    const BASS = [0, 0, 7, 0, 10, 0, 7, 3, 0, 0, 7, 0, 12, 10, 7, 5];
    function music(dt) {
      if (!game.sound || game.state !== 'play') return;
      game.musicT -= dt;
      if (game.musicT <= 0) {
        game.musicT = 0.19;
        const st = BASS[Math.floor(game.time / 0.19) % BASS.length];
        beep(110 * Math.pow(2, st / 12), 0.16, 'triangle', 0.045);
      }
    }

    function saveHi() {
      try { if (storage) storage.setItem('starstriker_hi', String(game.hi)); } catch (e) {}
    }

    function startGame() {
      game.state = 'play'; game.paused = false;
      game.score = 0; game.lives = 3; game.bombs = 3; game.weapon = 1;
      game.wave = 0; game.waveTimer = 1.2; game.bossKills = 0; game.shake = 0;
      game.level = game.startLevel; game.focusMeter = 100; game.focusLock = false;
      game.bullets.length = 0; game.ebullets.length = 0; game.enemies.length = 0;
      game.parts.length = 0; game.powerups.length = 0; game.spawns.length = 0; game.boss = null; game.blasts.length = 0;
      game.player.x = W / 2; game.player.y = H - 80; game.player.inv = 2; game.player.fireCd = 0; game.player.alive = true; game.player.bank = 0;
    }

    function nextLevel() {
      game.level++;
      game.state = 'play';
      game.paused = false;
      game.waveTimer = 2.5;
    }

    function gameOver() {
      game.state = 'over';
      game.player.alive = false;
      if (game.score > game.hi) { game.hi = game.score; saveHi(); }
      sfx.hit();
    }

    function fire() {
      const p = game.player, lv = game.weapon;
      const mk = (dx, ang) => {
        const a = -Math.PI / 2 + ang;
        game.bullets.push({ x: p.x + dx, y: p.y - 14, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540, r: 4, dmg: 1 });
      };
      if (lv === 1) { mk(0, 0); }
      else if (lv === 2) { mk(-6, 0); mk(6, 0); }
      else if (lv === 3) { mk(0, 0); mk(-9, -0.13); mk(9, 0.13); }
      else { mk(-6, 0); mk(6, 0); mk(-11, -0.17); mk(11, 0.17); }
      sfx.shoot();
    }

    function useBomb() {
      if (game.bombs <= 0) return;
      game.bombs--; game.shake = 22;
      game.blasts.push({ x: game.player.x, y: game.player.y, t: 0.6, max: 0.6 });
      for (const b of game.ebullets) burst(b.x, b.y, '#9df', 2);
      game.ebullets.length = 0;
      for (const e of game.enemies) { e.hp -= 5; if (e.hp <= 0) killEnemy(e); }
      if (game.boss) { game.boss.hp -= 30; if (game.boss.hp <= 0) killBoss(); }
      sfx.bomb();
    }

    function burst(x, y, color, n) {
      n = n || 14;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), s = rand(40, 220);
        game.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rand(0.3, 0.8), max: 0.8, color, r: rand(1.5, 3.5) });
      }
    }

    function drop(x, y, kind) { game.powerups.push({ x, y, vy: 70, r: 9, kind, t: 0 }); }

    function killEnemy(e) {
      if (e.dead) return;
      e.dead = true;
      game.score += e.score;
      burst(e.x, e.y, e.color, 16);
      sfx.boom();
      const roll = Math.random();
      if (e.type === 'tank') drop(e.x, e.y, (game.dropToggle++ % 2) ? 'p' : 'b');
      else if (e.type === 'gunner' && roll < 0.3) drop(e.x, e.y, 'b');
      else if (roll < 0.05) drop(e.x, e.y, 'p');
      if (roll < 0.012) drop(e.x, e.y, 'life');
    }

    function makeBoss(wave) {
      const hp = 220 + wave * 60 + (game.level - 1) * 120;
      return { x: W / 2, y: -90, targetY: 120, r: 46, hp, maxHp: hp, t: 0, pattern: -1, patternT: 2, fireCd: 1, summonT: 6, dead: false, sprite: game.level >= 2 };
    }

    function radial(b) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + b.t;
        game.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 4 });
      }
    }
    function aimedSpread(b) {
      const base = Math.atan2(game.player.y - b.y, game.player.x - b.x);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.16;
        game.ebullets.push({ x: b.x, y: b.y + 30, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, r: 4 });
      }
    }
    function spiral(b) {
      const a = b.t * 6;
      game.ebullets.push({ x: b.x, y: b.y + 20, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 4 });
      game.ebullets.push({ x: b.x, y: b.y + 20, vx: Math.cos(a + Math.PI) * 170, vy: Math.sin(a + Math.PI) * 170, r: 4 });
    }

    function killBoss() {
      const b = game.boss; if (!b || b.dead) return;
      b.dead = true; game.boss = null; game.bossKills++;
      game.score += 5000;
      burst(b.x, b.y, '#ff3d5e', 60); burst(b.x, b.y, '#ffd23f', 40);
      game.shake = 26; sfx.bomb();
      game.waveTimer = 3;
      if (game.bossKills >= game.level - game.startLevel + 1) game.state = 'clear';
    }

    function spawnWave(n) {
      const s = game.spawns;
      if (game.level >= 2) {
        const na = 2 + Math.min(3, game.level - 1);
        for (let i = 0; i < na; i++) s.push({ type: 'asteroid', x: rand(40, W - 40), y: -rand(60, 300), t: rand(0.2, 2.5) });
      }
      if (n % 5 === 0) { game.boss = makeBoss(n); sfx.boss(); return; }
      const pats = [
        () => { for (let i = 0; i < 5; i++) s.push({ type: 'drone', x: 60 + i * 90, y: -40 - i * 26, t: 0.2 + i * 0.16 }); for (let i = 0; i < 2; i++) s.push({ type: 'raider', x: 90 + i * 300, y: -30 - i * 50, t: 0.4 + i * 0.3 }); },
        () => { for (let i = 0; i < 7; i++) s.push({ type: 'drone', x: 40 + i * 66, y: -40, t: i * 0.12 }); for (let i = 0; i < 3; i++) s.push({ type: 'scout', x: 100 + i * 140, y: -30 - i * 40, t: 0.5 + i * 0.3 }); },
        () => { for (let i = 0; i < 3; i++) s.push({ type: 'tank', x: 100 + i * 140, y: -70 - i * 50, t: i * 0.5 }); s.push({ type: 'weaver', x: W / 2, y: -220, t: 0.3 }); s.push({ type: 'brute', x: W / 2, y: -320, t: 0.8 }); s.push({ type: 'phantom', x: 120, y: -180, t: 0.5 }); },
        () => { for (let i = 0; i < 4; i++) s.push({ type: 'gunner', x: 80 + i * 105, y: -50 - i * 60, t: i * 0.35 }); for (let i = 0; i < 2; i++) s.push({ type: 'stalker', x: 110 + i * 260, y: -40 - i * 60, t: 0.3 + i * 0.35 }); },
        () => { for (let i = 0; i < 9; i++) s.push({ type: 'drone', x: 50 + (i % 3) * 190, y: -40 - Math.floor(i / 3) * 70, t: i * 0.12 }); s.push({ type: 'tank', x: W / 2, y: -260, t: 0.6 }); for (let i = 0; i < 2; i++) s.push({ type: 'scout', x: 120 + i * 240, y: -120 - i * 50, t: 0.4 + i * 0.4 }); for (let i = 0; i < 2; i++) s.push({ type: 'raider', x: 150 + i * 180, y: -140 - i * 60, t: 0.5 + i * 0.4 }); s.push({ type: 'phantom', x: W - 120, y: -200, t: 0.7 }); },
      ];
      pats[(n - 1) % pats.length]();
    }

    function makeEnemy(sp) {
      const base = TYPES[sp.type];
      const hp = base.hp + Math.floor(game.wave / 3) + (game.level - 1);
      return {
        type: sp.type, x: sp.x, y: sp.y, baseX: sp.x, r: base.r, hp, maxHp: hp,
        speed: base.speed * (1 + game.wave * 0.04) * (1 + (game.level - 1) * 0.12), score: base.score, color: base.color,
        t: 0, phase: rand(0, 6.28), fireCd: rand(0.6, 2.2), fireMul: base.fire || 1, dead: false,
        variant: sp.type === 'asteroid' ? Math.floor(rand(0, 8)) : 0,
      };
    }

    function aimedShot(x, y) {
      const a = Math.atan2(game.player.y - y, game.player.x - x);
      const sp = 175 + game.wave * 4;
      game.ebullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 4 });
    }

    function hitPlayer() {
      const p = game.player;
      game.lives--;
      game.weapon = Math.max(1, game.weapon - 1);
      p.inv = 2;
      game.shake = 16;
      burst(p.x, p.y, '#59f7ff', 30);
      sfx.hit();
      if (game.lives <= 0) gameOver();
    }

    function update(dt) {
      const scroll = (game.state === 'play' && !game.paused) ? 1.8 : 1;
      for (const s of game.stars) {
        s.y += s.z * 55 * scroll * dt;
        if (s.y > H) { s.y = -2; s.x = rand(0, W); }
      }
      for (const pt of game.parts) {
        pt.t -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.98; pt.vy *= 0.98;
      }
      game.parts = game.parts.filter(p => p.t > 0);
      for (const bl of game.blasts) bl.t -= dt;
      game.blasts = game.blasts.filter(bl => bl.t > 0);
      game.shake = Math.max(0, game.shake - 34 * dt);

      if (game.state !== 'play') return;
      if (game.paused) return;
      game.time += dt;
      music(dt);

      const p = game.player, k = game.keys;
      let dx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      if (k.shift && game.focusMeter > 0 && !game.focusLock) p.focus = true; else p.focus = false;
      if (p.focus) {
        game.focusMeter = Math.max(0, game.focusMeter - 30 * dt);
        if (game.focusMeter <= 0) game.focusLock = true;
      } else {
        game.focusMeter = Math.min(100, game.focusMeter + 14 * dt);
        if (game.focusLock && game.focusMeter >= 35) game.focusLock = false;
      }
      p.bank += (dx - p.bank) * Math.min(1, dt * 7);
      const sp = p.focus ? 120 : 265;
      p.x = clamp(p.x + dx * sp * dt, 14, W - 14);
      p.y = clamp(p.y + dy * sp * dt, H * 0.35, H - 22);
      p.inv = Math.max(0, p.inv - dt);
      p.fireCd -= dt;
      if (k[' '] && p.fireCd <= 0) { fire(); p.fireCd = 0.13; }
      if (game.parts.length < 400) {
        game.parts.push({ x: p.x + rand(-2, 2), y: p.y + 12, vx: rand(-8, 8), vy: rand(60, 120), t: 0.28, max: 0.28, color: p.focus ? '#ffffff' : '#59f7ff', r: rand(1, 2) });
      }
      const wdt = p.focus ? dt * 0.45 : dt;

      for (const s of game.spawns) s.t -= wdt;
      const ready = game.spawns.filter(s => s.t <= 0);
      game.spawns = game.spawns.filter(s => s.t > 0);
      for (const s of ready) game.enemies.push(makeEnemy(s));

      for (const e of game.enemies) {
        e.t += wdt;
        if (e.type === 'drone') { e.y += e.speed * wdt; e.x = e.baseX + Math.sin(e.t * 2 + e.phase) * 22; }
        else if (e.type === 'weaver') { e.y += e.speed * 0.7 * wdt; e.x = e.baseX + Math.sin(e.t * 3 + e.phase) * 95; }
        else if (e.type === 'tank') { e.y += e.speed * wdt; e.x += clamp(game.player.x - e.x, -40, 40) * wdt; }
        else if (e.type === 'gunner') { if (e.y < 110) e.y += e.speed * wdt; else e.x += Math.sin(e.t * 2.2 + e.phase) * 90 * wdt; }
        else if (e.type === 'scout') { e.y += e.speed * wdt; e.x += (Math.sin(e.t * 3 + e.phase) * 60 + clamp(game.player.x - e.x, -25, 25)) * wdt; }
        else if (e.type === 'raider') { e.y += e.speed * wdt; e.x += clamp(game.player.x - e.x, -60, 60) * wdt; }
        else if (e.type === 'stalker') { if (e.y < 130) e.y += e.speed * wdt; else e.x += Math.sin(e.t * 2.5 + e.phase) * 110 * wdt; }
        else if (e.type === 'brute') { e.y += e.speed * wdt; e.x += clamp(game.player.x - e.x, -25, 25) * wdt; }
        else if (e.type === 'phantom') { e.y += e.speed * 0.8 * wdt; e.x = e.baseX + Math.sin(e.t * 4 + e.phase) * 110; }
        else if (e.type === 'asteroid') { e.y += e.speed * wdt; e.x += Math.sin(e.t * 0.5 + e.phase) * 15 * wdt; }
        e.fireCd -= wdt;
        if (e.fireCd <= 0 && e.y > 0 && e.y < H * 0.72) { aimedShot(e.x, e.y + e.r); e.fireCd = rand(1.3, 2.6) * e.fireMul; }
        if (e.y > H + 50) e.dead = true;
      }

      const b = game.boss;
      if (b) {
        b.t += wdt;
        if (b.y < b.targetY) { b.y += 55 * wdt; }
        else {
          b.x = W / 2 + Math.sin(b.t * 0.8) * (W / 2 - 90);
          b.patternT -= wdt; b.fireCd -= wdt; b.summonT -= wdt;
          if (b.patternT <= 0) { b.pattern = (b.pattern + 1) % 3; b.patternT = 3.2; if (b.pattern === 0) radial(b); }
          if (b.pattern === 1 && b.fireCd <= 0) { aimedSpread(b); b.fireCd = 0.45; }
          if (b.pattern === 2 && b.fireCd <= 0) { spiral(b); b.fireCd = 0.11; }
          if (b.summonT <= 0) {
            b.summonT = 8;
            for (let i = 0; i < 3; i++) {
              const ex = b.x + (i - 1) * 40;
              game.enemies.push({ type: 'drone', x: ex, y: b.y + 40, baseX: ex, r: 12, hp: 1, maxHp: 1, speed: 130, score: 100, color: '#ff5fd0', t: 0, phase: rand(0, 6), fireCd: 1.5, dead: false });
            }
          }
        }
      }

      for (const bl of game.bullets) { bl.x += bl.vx * dt; bl.y += bl.vy * dt; }
      game.bullets = game.bullets.filter(bl => bl.y > -20 && bl.y < H + 20 && bl.x > -20 && bl.x < W + 20);

      for (const eb of game.ebullets) { eb.x += eb.vx * wdt; eb.y += eb.vy * wdt; }
      game.ebullets = game.ebullets.filter(eb => eb.y > -20 && eb.y < H + 20 && eb.x > -20 && eb.x < W + 20);

      for (const u of game.powerups) { u.t += wdt; u.y += u.vy * wdt; }
      game.powerups = game.powerups.filter(u => u.y < H + 30);

      for (const bl of game.bullets) {
        if (bl.dead) continue;
        for (const e of game.enemies) {
          if (e.dead) continue;
          if (d2(bl.x, bl.y, e.x, e.y) < (bl.r + e.r) * (bl.r + e.r)) { bl.dead = true; e.hp -= bl.dmg; if (e.hp <= 0) killEnemy(e); break; }
        }
        if (!bl.dead && game.boss) {
          const bb = game.boss;
          if (d2(bl.x, bl.y, bb.x, bb.y) < (bl.r + bb.r) * (bl.r + bb.r)) { bl.dead = true; bb.hp -= bl.dmg; if (bb.hp <= 0) killBoss(); }
        }
      }
      game.bullets = game.bullets.filter(bl => !bl.dead);

      if (p.inv <= 0 && p.alive) {
        for (const eb of game.ebullets) {
          if (d2(eb.x, eb.y, p.x, p.y) < (eb.r + p.r) * (eb.r + p.r)) { eb.dead = true; hitPlayer(); break; }
        }
        game.ebullets = game.ebullets.filter(eb => !eb.dead);
        if (game.state === 'play' && p.inv <= 0) {
          for (const e of game.enemies) {
            if (!e.dead && d2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) { if (e.type !== 'asteroid') killEnemy(e); hitPlayer(); break; }
          }
          const bb = game.boss;
          if (game.state === 'play' && p.inv <= 0 && bb && d2(bb.x, bb.y, p.x, p.y) < (bb.r + p.r) * (bb.r + p.r)) hitPlayer();
        }
      }

      for (const u of game.powerups) {
        if (u.taken) continue;
        if (d2(u.x, u.y, p.x, p.y) < (u.r + 14) * (u.r + 14)) {
          u.taken = true;
          if (u.kind === 'p') game.weapon = Math.min(4, game.weapon + 1);
          else if (u.kind === 'b') game.bombs = Math.min(6, game.bombs + 1);
          else if (u.kind === 'life') game.lives = Math.min(6, game.lives + 1);
          sfx.power();
        }
      }
      game.powerups = game.powerups.filter(u => !u.taken);

      game.enemies = game.enemies.filter(e => !e.dead);

      if (!game.boss && game.enemies.length === 0 && game.spawns.length === 0) {
        game.waveTimer -= wdt;
        if (game.waveTimer <= 0) { game.wave++; game.waveTimer = 2.2; spawnWave(game.wave); }
      }
    }

    const KEYMAP = {
      arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
      ' ': ' ', shift: 'shift',
    };

    function handleKey(n, down) {
      const k = KEYMAP[n] || n;
      if (down) {
        game.keys[k] = true;
        if (game.state === 'title' && (n === '1' || n === '2')) { game.startLevel = +n; game.level = game.startLevel; startGame(); return; }
        if (game.state === 'title' || game.state === 'over') { if (n === 'enter') startGame(); return; }
        if (game.state === 'clear') { if (n === 'enter') nextLevel(); return; }
        if (game.state !== 'play') return;
        if (n === 'p' || n === 'escape') { game.paused = !game.paused; return; }
        if (n === 'm') { game.sound = !game.sound; return; }
        if (game.paused) return;
        if (n === 'x') useBomb();
      } else if (k in game.keys) {
        game.keys[k] = false;
      }
    }

    function drawPlayer(ctx, p) {
      ctx.save(); ctx.translate(p.x, p.y);
      const fl = 10 + Math.sin(game.time * 30) * 4;
      let g = ctx.createLinearGradient(0, 10, 0, 10 + fl + 8);
      g.addColorStop(0, '#fff7ae'); g.addColorStop(0.4, '#ffb347'); g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-4, 10); ctx.lineTo(0, 10 + fl + 8); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1b9ec4';
      ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-15, 13); ctx.lineTo(-9, 13); ctx.lineTo(-5, 8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(15, 13); ctx.lineTo(9, 13); ctx.lineTo(5, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7df9ff';
      ctx.fillRect(-15, 12, 3, 2); ctx.fillRect(12, 12, 3, 2);
      g = ctx.createLinearGradient(0, -18, 0, 12);
      g.addColorStop(0, '#bffbff'); g.addColorStop(0.45, '#59f7ff'); g.addColorStop(1, '#0e7d9c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(6, -2); ctx.lineTo(9, 10); ctx.lineTo(4, 12); ctx.lineTo(-4, 12); ctx.lineTo(-9, 10); ctx.lineTo(-6, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#0b2b4a';
      ctx.beginPath(); ctx.ellipse(0, -6, 2.6, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(-0.8, -8, 0.9, 1.8, -0.4, 0, Math.PI * 2); ctx.fill();
      if (p.focus) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    function drawEnemy(ctx, e) {
      ctx.save(); ctx.translate(e.x, e.y);
      const simgName = e.type === 'asteroid' ? 'asteroid' + (e.variant || 0) : 'enemy_' + e.type;
      if (e.type !== 'scout' && spriteReady(simgName)) {
        const img = game.sprites[simgName];
        const s = (e.r * 2.6) / img.naturalWidth;
        ctx.save();
        ctx.rotate(e.type === 'weaver' ? Math.sin(e.t * 6) * 0.35 : e.type === 'drone' ? e.t * 2 : e.type === 'asteroid' ? e.t * 0.4 : 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
        ctx.restore();
      } else if (e.type === 'scout') {
        if (spriteReady('scout')) {
          const img = game.sprites.scout;
          const s = 30 / img.naturalWidth;
          ctx.save(); ctx.rotate(Math.sin(e.t * 3 + e.phase) * 0.2);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
          ctx.restore();
        } else {
          ctx.fillStyle = '#a855f7';
          ctx.beginPath(); ctx.ellipse(0, 0, e.r + 5, e.r, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#3b0764'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#fde047';
          ctx.beginPath(); ctx.arc(0, -3, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3b0764';
          ctx.beginPath(); ctx.arc(0, -3, 2, 0, Math.PI * 2); ctx.fill();
        }
      } else if (e.type === 'drone') {
        ctx.rotate(e.t * 2);
        ctx.fillStyle = 'rgba(255,95,208,0.25)';
        ctx.beginPath(); ctx.arc(0, 0, e.r + 5, 0, Math.PI * 2); ctx.fill();
        const gr = ctx.createLinearGradient(0, -e.r, 0, e.r);
        gr.addColorStop(0, '#ff9be2'); gr.addColorStop(1, '#d1219b');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd7f2'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#5c0f3f';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff5fd0';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.2, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'weaver') {
        ctx.rotate(Math.sin(e.t * 6) * 0.35);
        const gr = ctx.createLinearGradient(0, -e.r, 0, e.r);
        gr.addColorStop(0, '#fff3b0'); gr.addColorStop(1, '#e0a400');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(0, e.r + 2);
        ctx.lineTo(e.r * 1.1, -e.r * 0.6);
        ctx.lineTo(e.r * 0.4, -e.r * 0.2);
        ctx.lineTo(0, -e.r);
        ctx.lineTo(-e.r * 0.4, -e.r * 0.2);
        ctx.lineTo(-e.r * 1.1, -e.r * 0.6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff8dc'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#7a5200';
        ctx.beginPath(); ctx.arc(0, -e.r * 0.3, e.r * 0.28, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'tank') {
        const gr = ctx.createRadialGradient(-e.r * 0.3, -e.r * 0.3, 2, 0, 0, e.r * 1.3);
        gr.addColorStop(0, '#ffc08a'); gr.addColorStop(1, '#b34700');
        ctx.fillStyle = gr;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 + e.t * 0.5;
          const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd9b0'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-e.r * 0.55, -e.r * 0.55, e.r * 1.1, e.r * 0.35);
        ctx.fillRect(-e.r * 0.55, e.r * 0.2, e.r * 1.1, e.r * 0.35);
        ctx.fillStyle = '#7a2e00';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.42, 0, Math.PI * 2); ctx.fill();
        const ta = Math.atan2(game.player.y - e.y, game.player.x - e.x);
        ctx.strokeStyle = '#ffd9b0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ta) * e.r * 0.9, Math.sin(ta) * e.r * 0.9); ctx.stroke();
        if (e.maxHp > 1) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, e.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, e.hp / e.maxHp)); ctx.stroke();
        }
      } else {
        ctx.rotate(Math.sin(e.t * 4) * 0.3);
        const gr = ctx.createLinearGradient(-e.r, -e.r, e.r, e.r);
        gr.addColorStop(0, '#c9b8ff'); gr.addColorStop(1, '#5b3fd4');
        ctx.fillStyle = gr;
        ctx.fillRect(-e.r * 0.85, -e.r * 0.85, e.r * 1.7, e.r * 1.7);
        ctx.strokeStyle = '#e6dcff'; ctx.lineWidth = 1;
        ctx.strokeRect(-e.r * 0.85, -e.r * 0.85, e.r * 1.7, e.r * 1.7);
        ctx.fillStyle = '#8d6bff';
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath(); ctx.arc(sx * e.r * 0.85, sy * e.r * 0.85, e.r * 0.25, 0, Math.PI * 2); ctx.fill();
        }
        ctx.rotate(e.t * 3);
        ctx.fillStyle = '#2c1a6e';
        ctx.beginPath(); ctx.moveTo(0, -e.r * 0.5); ctx.lineTo(e.r * 0.5, 0); ctx.lineTo(0, e.r * 0.5); ctx.lineTo(-e.r * 0.5, 0); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    function drawBoss(ctx, b) {
      ctx.save(); ctx.translate(b.x, b.y);
      if (b.sprite && spriteReady('boss')) {
        const img = game.sprites.boss;
        const s = (b.r * 2) / img.naturalWidth;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
        const shipH = img.naturalHeight * s;
        const fi = Math.floor(game.time * 10) % 3;
        if (spriteReady('flame' + fi)) {
          const f = game.sprites['flame' + fi];
          const fs = (b.r * 1.6) / f.naturalWidth;
          ctx.save(); ctx.translate(0, shipH / 2 - 6);
          ctx.drawImage(f, -f.naturalWidth * fs / 2, 0, f.naturalWidth * fs, f.naturalHeight * fs);
          ctx.restore();
        }
        ctx.restore();
        return;
      }
      const aura = ctx.createRadialGradient(0, 0, b.r * 0.4, 0, 0, b.r * 1.6);
      aura.addColorStop(0, 'rgba(255,60,90,0.35)'); aura.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(0, 0, b.r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(b.t * 0.5);
      const gr = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.3, 4, 0, 0, b.r);
      gr.addColorStop(0, '#ff8aa0'); gr.addColorStop(0.6, '#e0244a'); gr.addColorStop(1, '#8f0f2c');
      ctx.fillStyle = gr;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? b.r * 0.55 : b.r;
        const a = i / 10 * Math.PI * 2 - Math.PI / 2;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffb3c0'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.rotate(-b.t * 1.2);
      ctx.strokeStyle = 'rgba(255,210,63,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, b.r * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(b.t * 1.2);
      const pulse = 1 + Math.sin(b.t * 5) * 0.15;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, b.r * 0.28 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5c0f1e';
      ctx.beginPath(); ctx.arc(0, 0, b.r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawPowerup(ctx, u) {
      ctx.save(); ctx.translate(u.x, u.y + Math.sin(u.t * 5) * 3);
      const col = u.kind === 'p' ? '#7dff6a' : u.kind === 'b' ? '#ffd23f' : '#ff6a9d';
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(0, 0, u.r + 4, 0, Math.PI * 2); ctx.fill();
      const gr = ctx.createLinearGradient(0, -u.r, 0, u.r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, col); gr.addColorStop(1, col);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, u.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#0b0b1a';
      ctx.font = u.kind === 'life' ? 'bold 7px monospace' : 'bold 11px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(u.kind === 'p' ? 'P' : u.kind === 'b' ? 'B' : '1UP', 0, 1);
      ctx.restore();
    }

    function drawHUD(ctx) {
      ctx.save();
      ctx.font = 'bold 16px monospace'; ctx.textBaseline = 'top';
      ctx.textAlign = 'left'; ctx.fillStyle = '#7df9ff';
      ctx.fillText('SCORE ' + String(game.score).padStart(8, '0'), 10, 8);
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f';
      ctx.fillText('HI ' + String(game.hi).padStart(8, '0'), W / 2, 8);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ff8fb0';
      ctx.fillText('LV' + game.level + ' WAVE ' + game.wave, W - 10, 8);
      const fx = W / 2 - 50, fw = 100;
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '9px monospace';
      ctx.fillText('FOCUS', fx, H - 30);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(fx, H - 19, fw, 6);
      ctx.fillStyle = game.focusMeter < 25 ? '#ff4d6d' : (game.player.focus ? '#7df9ff' : '#4a90d9');
      ctx.fillRect(fx, H - 19, fw * (game.focusMeter / 100), 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(fx, H - 19, fw, 6);
      ctx.textAlign = 'left';
      for (let i = 0; i < game.lives; i++) {
        ctx.fillStyle = '#59f7ff';
        const x = 16 + i * 18, y = H - 22;
        ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < game.bombs; i++) {
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(16 + i * 16, H - 42, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#7dff6a';
      for (let i = 0; i < game.weapon; i++) ctx.fillRect(W - 14 - i * 12, H - 28, 8, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(W - 40, 28, 30, 20);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(W - 40, 28, 30, 20);
      ctx.fillStyle = '#7df9ff';
      ctx.fillRect(W - 33, 33, 5, 10); ctx.fillRect(W - 24, 33, 5, 10);
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px monospace';
      ctx.fillText(game.touch ? 'DRAG TO MOVE · FIRE/FOCUS/BOMB BUTTONS · ❚❚ PAUSE' : 'ARROWS/WASD MOVE · SPACE FIRE · SHIFT FOCUS · X BOMB · P/ESC PAUSE · M SOUND', W - 10, H - 12);
      ctx.restore();
      if (game.boss) {
        const b = game.boss;
        ctx.save();
        ctx.fillStyle = 'rgba(255,60,90,0.25)'; ctx.fillRect(40, 32, W - 80, 8);
        ctx.fillStyle = '#ff3c5a'; ctx.fillRect(40, 32, (W - 80) * Math.max(0, b.hp / b.maxHp), 8);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(40, 32, W - 80, 8);
        ctx.restore();
      }
    }

    function drawTitle(ctx) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#7df9ff'; ctx.font = 'bold 44px monospace';
      ctx.fillText('STAR STRIKER', W / 2, H / 2 - 90);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 16px monospace';
      ctx.fillText('- VERTICAL SHOOT-EM-UP -', W / 2, H / 2 - 52);
      if (Math.floor(game.time * 2) % 2 === 0) {
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px monospace';
        ctx.fillText(game.touch ? 'TAP SCREEN = LV1 · LV 2 BUTTON = LV2' : 'ENTER = LV1 · 2 = LV2', W / 2, H / 2 + 10);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '13px monospace';
      const lines = game.touch
        ? ['DRAG ANYWHERE — MOVE', 'FIRE (HOLD) — SHOOT', 'FOCUS (HOLD) — SLOW-MO, DRAINS BAR', 'BOMB — BOMB · ❚❚ — PAUSE']
        : ['ARROWS / WASD — MOVE', 'SPACE — FIRE', 'SHIFT — FOCUS (SLOW-MO, DRAINS BAR)', 'X — BOMB', 'P / ESC OR ❚❚ BUTTON — PAUSE · M — SOUND'];
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 50 + i * 20));
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 14px monospace';
      ctx.fillText('HI-SCORE ' + String(game.hi).padStart(8, '0'), W / 2, H / 2 + 50 + lines.length * 20 + 10);
      ctx.restore();
    }

    function drawOver(ctx) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#ff4d6d'; ctx.font = 'bold 40px monospace';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 50);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#7df9ff'; ctx.font = 'bold 18px monospace';
      ctx.fillText('SCORE ' + String(game.score).padStart(8, '0'), W / 2, H / 2 + 6);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('HI-SCORE ' + String(game.hi).padStart(8, '0'), W / 2, H / 2 + 34);
      if (Math.floor(game.time * 2) % 2 === 0) {
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px monospace';
        ctx.fillText('PRESS ENTER TO RETRY', W / 2, H / 2 + 76);
      }
      ctx.restore();
    }

    function drawClear(ctx) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.shadowColor = '#7dff6a'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#7dff6a'; ctx.font = 'bold 34px monospace';
      ctx.fillText('LEVEL ' + game.level + ' CLEAR!', W / 2, H / 2 - 30);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 16px monospace';
      ctx.fillText('SCORE ' + String(game.score).padStart(8, '0'), W / 2, H / 2 + 12);
      if (Math.floor(game.time * 2) % 2 === 0) {
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px monospace';
        ctx.fillText('PRESS ENTER — LEVEL ' + (game.level + 1), W / 2, H / 2 + 52);
      }
      ctx.restore();
    }

    function drawPaused(ctx) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#7df9ff'; ctx.font = 'bold 32px monospace';
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '14px monospace';
      ctx.fillText('PRESS P TO RESUME', W / 2, H / 2 + 36);
      ctx.restore();
    }

    function render(ctx) {
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#050514'); g.addColorStop(1, '#0b0b2a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (game.shake > 0) ctx.translate(rand(-game.shake, game.shake) * 0.5, rand(-game.shake, game.shake) * 0.5);
      for (const s of game.stars) {
        ctx.fillStyle = s.z === 1 ? '#ffffff' : s.z === 0.6 ? '#9db4ff' : '#4a5a8a';
        ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2);
      }
      for (const u of game.powerups) drawPowerup(ctx, u);
      for (const e of game.enemies) drawEnemy(ctx, e);
      if (game.boss) drawBoss(ctx, game.boss);
      for (const eb of game.ebullets) {
        if (spriteReady('ebullet')) {
          ctx.save(); ctx.translate(eb.x, eb.y);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(game.sprites.ebullet, -6, -6, 12, 12);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,77,109,0.3)'; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r + 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd0da'; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const bl of game.bullets) {
        const heavy = game.weapon >= 3 && spriteReady('special');
        const img = heavy ? game.sprites.special : game.sprites.bullet;
        if (spriteReady(heavy ? 'special' : 'bullet')) {
          const ang = Math.atan2(bl.vy, bl.vx) + Math.PI / 2;
          const bw = heavy ? 10 : 7, bh = heavy ? 26 : 20;
          ctx.save(); ctx.translate(bl.x, bl.y); ctx.rotate(ang);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
          ctx.restore();
        } else if (heavy) {
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(bl.x - 3, bl.y - 9, 6, 18);
        } else {
          ctx.fillStyle = 'rgba(125,249,255,0.35)'; ctx.fillRect(bl.x - 3, bl.y - 10, 6, 18);
          ctx.fillStyle = '#7df9ff'; ctx.fillRect(bl.x - 2, bl.y - 8, 4, 14);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(bl.x - 1, bl.y - 6, 2, 10);
        }
      }
      if (game.state === 'play' && game.player.alive) {
        if (!(game.player.inv > 0 && Math.floor(game.time * 20) % 2 === 0)) {
          const b = game.player.bank;
          const pname = b <= -0.55 ? 'player_left2' : b < -0.2 ? 'player_left' : b >= 0.55 ? 'player_right2' : b > 0.2 ? 'player_right' : 'player';
          const useName = spriteReady(pname) ? pname : (spriteReady('player') ? 'player' : null);
          if (useName) {
            const img = game.sprites[useName];
            const s = 36 / img.naturalWidth;
            ctx.save(); ctx.translate(game.player.x, game.player.y);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2 + 2, img.naturalWidth * s, img.naturalHeight * s);
            if (game.player.focus) {
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.arc(0, 0, game.player.r, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore();
          } else {
            drawPlayer(ctx, game.player);
          }
        }
      }
      if (spriteReady('blast')) {
        const img = game.sprites.blast;
        for (const bl of game.blasts) {
          const k = 1 - bl.t / bl.max;
          const size = 24 + k * 72;
          ctx.globalAlpha = bl.t / bl.max;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, bl.x - size / 2, bl.y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
      }
      for (const pt of game.parts) {
        ctx.globalAlpha = Math.max(0, pt.t / pt.max);
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (game.state === 'play' && game.player.focus && !game.paused) {
        ctx.fillStyle = 'rgba(80,140,255,0.08)';
        ctx.fillRect(0, 0, W, H);
      }
      drawHUD(ctx);
      if (game.state === 'title') drawTitle(ctx);
      else if (game.state === 'over') drawOver(ctx);
      else if (game.state === 'clear') drawClear(ctx);
      else if (game.paused) drawPaused(ctx);
    }

    game.press = n => { handleKey(n, true); handleKey(n, false); };
    game.setKey = (n, down) => handleKey(n, down);
    game.handleKey = handleKey;
    game.update = update;
    game.render = render;
    game.startGame = startGame;
    return game;
  }

  function boot() {
    const canvas = document.getElementById('game');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const game = createGame({});
    window.__starStrikerGame = game; // debug/test handle
    // touch device (phone/tablet) => show on-screen controls; desktop => keyboard only
    const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
    const isTouch = coarse || ('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0);
    game.touch = isTouch;
    if (isTouch) document.body.classList.add('touch');
    window.addEventListener('keydown', e => {
      const n = e.key.toLowerCase();
      if (n === ' ' || n.indexOf('arrow') === 0) e.preventDefault();
      game.handleKey(n, true);
    });
    window.addEventListener('keyup', e => { game.handleKey(e.key.toLowerCase(), false); });
    canvas.addEventListener('mousedown', e => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) * (W / r.width);
      const y = (e.clientY - r.top) * (H / r.height);
      if (game.state === 'play' && x >= W - 40 && x <= W - 10 && y >= 28 && y <= 48) game.handleKey('p', true);
    });

    // ---------- touch controls ----------
    const $ = id => document.getElementById(id);
    const stickEl = $('stick'), knobEl = $('stick-knob');
    const btnFire = $('btn-fire'), btnFocus = $('btn-focus'), btnBomb = $('btn-bomb');
    const btnPause = $('btn-pause'), btnStart = $('btn-start'), btnLv2 = $('btn-lv2');
    if (isTouch && stickEl) {
      let stickId = null, ox = 0, oy = 0;
      const toGame = t => {
        const r = canvas.getBoundingClientRect();
        return {
          x: (t.clientX - r.left) * (W / r.width),
          y: (t.clientY - r.top) * (H / r.height),
          px: (t.clientX - r.left) / r.width * 100,
          py: (t.clientY - r.top) / r.height * 100,
        };
      };
      const setDir = (dx, dy) => {
        game.setKey('left', dx < -9); game.setKey('right', dx > 9);
        game.setKey('up', dy < -9); game.setKey('down', dy > 9);
      };
      canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const p = toGame(t);
          if (game.state !== 'play') { game.press('enter'); continue; } // tap to start / retry / next level
          if (p.x >= W - 40 && p.x <= W - 10 && p.y >= 28 && p.y <= 48) { game.handleKey('p', true); continue; }
          if (stickId === null) {
            stickId = t.identifier; ox = p.x; oy = p.y;
            stickEl.style.display = 'block';
            stickEl.style.left = p.px + '%'; stickEl.style.top = p.py + '%';
            knobEl.style.left = '50%'; knobEl.style.top = '50%';
          }
        }
      }, { passive: false });
      canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier !== stickId) continue;
          const p = toGame(t);
          let dx = p.x - ox, dy = p.y - oy;
          const m = Math.hypot(dx, dy), max = 46;
          if (m > max) { dx *= max / m; dy *= max / m; }
          knobEl.style.left = (50 + dx * 0.55) + '%';
          knobEl.style.top = (50 + dy * 0.55) + '%';
          setDir(p.x - ox, p.y - oy);
        }
      }, { passive: false });
      const endStick = e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === stickId) { stickId = null; stickEl.style.display = 'none'; setDir(0, 0); }
        }
      };
      canvas.addEventListener('touchend', endStick, { passive: false });
      canvas.addEventListener('touchcancel', endStick, { passive: false });
      canvas.addEventListener('contextmenu', e => e.preventDefault());

      const bindHold = (el, key) => { // press-and-hold buttons: FIRE, FOCUS
        if (!el) return;
        const on = e => { e.preventDefault(); el.classList.add('on'); game.handleKey(key, true); };
        const off = e => { e.preventDefault(); el.classList.remove('on'); game.handleKey(key, false); };
        el.addEventListener('touchstart', on, { passive: false });
        el.addEventListener('touchend', off, { passive: false });
        el.addEventListener('touchcancel', off, { passive: false });
        el.addEventListener('mousedown', on);
        el.addEventListener('mouseup', off);
        el.addEventListener('mouseleave', () => { el.classList.remove('on'); game.handleKey(key, false); });
        el.addEventListener('contextmenu', e => e.preventDefault());
      };
      const bindTap = (el, key) => { // single-press buttons: BOMB, PAUSE, START, LV2
        if (!el) return;
        const tap = e => { e.preventDefault(); game.press(key); };
        el.addEventListener('touchstart', tap, { passive: false });
        el.addEventListener('mousedown', tap);
        el.addEventListener('contextmenu', e => e.preventDefault());
      };
      bindHold(btnFire, ' ');
      bindHold(btnFocus, 'shift');
      bindTap(btnBomb, 'x');
      bindTap(btnPause, 'p');
      bindTap(btnStart, 'enter');
      bindTap(btnLv2, '2');
    }
    window.addEventListener('gesturestart', e => e.preventDefault()); // old iOS pinch-zoom

    let last = performance.now();
    function frame(now) {
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      game.update(dt);
      game.render(ctx);
      if (btnStart) {
        const showStart = game.state === 'title' || game.state === 'over' || game.state === 'clear';
        btnStart.style.visibility = showStart ? 'visible' : 'hidden';
        btnStart.textContent = game.state === 'clear' ? 'NEXT LEVEL' : (game.state === 'over' ? 'RETRY' : 'START');
        if (btnLv2) btnLv2.style.visibility = game.state === 'title' ? 'visible' : 'hidden';
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const api = { createGame, W, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StarStriker = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
