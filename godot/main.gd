extends Node2D
## Star Striker — Godot 4 port of the web build (game.js).
## Open this folder in the Godot engine and press Play.

const W := 480
const H := 640
const SPR := "res://assets/sprites/"

var tex := {}
var state := "title"          # title | play | over | clear
var paused := false
var time := 0.0
var shake := 0.0
var score := 0
var hi := 0
var wave := 0
var wave_timer := 1.2
var lives := 3
var bombs := 3
var weapon := 1
var boss_kills := 0
var level := 1
var start_level := 1
var focus_meter := 100.0
var focus_lock := false

var player := {}
var bullets := []
var ebullets := []
var enemies := []
var spawns := []
var powerups := []
var parts := []
var boss = null
var stars := []

var player_sprites := {}
var enemy_sprites := {}
var asteroid_sprites := []
var flame_sprites := []

const TYPES := {
	"drone":   {"hp": 1, "r": 12, "speed": 95.0,  "score": 100, "fire": 1.4},
	"weaver":  {"hp": 2, "r": 12, "speed": 75.0,  "score": 200, "fire": 1.2},
	"tank":    {"hp": 6, "r": 18, "speed": 42.0,  "score": 400, "fire": 0.9},
	"gunner":  {"hp": 3, "r": 14, "speed": 60.0,  "score": 300, "fire": 0.8},
	"scout":   {"hp": 2, "r": 13, "speed": 115.0, "score": 150, "fire": 1.1},
	"raider":  {"hp": 2, "r": 14, "speed": 130.0, "score": 250, "fire": 1.0},
	"stalker": {"hp": 3, "r": 14, "speed": 70.0,  "score": 350, "fire": 0.8},
	"brute":   {"hp": 8, "r": 20, "speed": 35.0,  "score": 600, "fire": 0.7},
	"phantom": {"hp": 2, "r": 12, "speed": 100.0, "score": 300, "fire": 1.3},
	"asteroid":{"hp": 4, "r": 16, "speed": 30.0,  "score": 50,  "fire": 999.0},
}

func _ready() -> void:
	for n in ["player", "player_left", "player_left2", "player_right", "player_right2",
			"bullet", "special", "blast", "ebullet", "scout", "boss",
			"flame0", "flame1", "flame2"]:
		tex[n] = load(SPR + n + ".png")
	for t in TYPES.keys():
		if t != "asteroid" and t != "scout":
			enemy_sprites[t] = load(SPR + "enemy_" + t + ".png")
	for i in 8:
		asteroid_sprites.append(load(SPR + "asteroid%d.png" % i))
	flame_sprites = [tex["flame0"], tex["flame1"], tex["flame2"]]
	player_sprites = {
		-2: tex["player_left2"], -1: tex["player_left"], 0: tex["player"],
		1: tex["player_right"], 2: tex["player_right2"],
	}
	for a in OS.get_cmdline_args():
		if a.begins_with("--level="):
			start_level = clampi(a.split("=")[1].to_int(), 1, 99)
	level = start_level
	# persistent hi-score via a simple user file
	var f := FileAccess.open("user://hiscore.txt", FileAccess.READ)
	if f:
		hi = int(f.get_as_text())
		f.close()
	for i in 60:
		stars.append({"x": randf() * W, "y": randf() * H, "s": randf() * 1.6 + 0.4})
	player = {"x": W / 2.0, "y": H - 80.0, "r": 3.0, "focus": false, "inv": 0.0,
		"fire_cd": 0.0, "alive": true, "bank": 0.0, "node": null, "flame": null}
	_make_player_node()

func _make_player_node() -> void:
	var s := Sprite2D.new()
	s.texture = tex["player"]
	s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	s.scale = Vector2(36.0 / s.texture.get_width(), 36.0 / s.texture.get_width())
	add_child(s)
	player["node"] = s

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var n := OS.get_keycode_string(event.keycode).to_lower()
		if state == "title" and (n == "1" or n == "2"):
			start_level = int(n)
			_start_game()
			get_viewport().set_input_as_handled()
			return
		if state in ["title", "over"] and n == "enter":
			_start_game()
			return
		if state == "clear" and n == "enter":
			level += 1
			state = "play"
			wave_timer = 2.5
			return
		if n in ["p", "escape"] and state == "play":
			paused = not paused
			return
		if n == "x" and state == "play" and not paused and bombs > 0:
			_use_bomb()
			return
	if event is InputEventMouseButton and event.pressed and state == "play":
		var p = event.position
		if p.x >= W - 40 and p.x <= W - 10 and p.y >= 28 and p.y <= 48:
			paused = not paused

func _start_game() -> void:
	state = "play"
	paused = false
	score = 0
	lives = 3
	bombs = 3
	weapon = 1
	boss_kills = 0
	wave = 0
	wave_timer = 1.2
	level = start_level
	focus_meter = 100.0
	focus_lock = false
	bullets.clear(); ebullets.clear(); enemies.clear(); spawns.clear(); powerups.clear(); parts.clear()
	boss = null
	player["x"] = W / 2.0; player["y"] = H - 80.0
	player["inv"] = 2.0; player["fire_cd"] = 0.0; player["alive"] = true; player["bank"] = 0.0

func _use_bomb() -> void:
	bombs -= 1
	shake = 22.0
	parts.append({"x": player["x"], "y": player["y"], "t": 0.6, "max": 0.6, "boss_blast": true})
	for b in ebullets:
		parts.append({"x": b["x"], "y": b["y"], "t": 0.2, "max": 0.2})
	ebullets.clear()
	for e in enemies:
		e["hp"] -= 5
	if boss:
		boss["hp"] -= 40

func _process(delta: float) -> void:
	time += delta
	for s in stars:
		s["y"] += s["s"] * 40.0 * delta
		if s["y"] > H:
			s["y"] = 0; s["x"] = randf() * W
	for p in parts:
		p["t"] -= delta
	parts = parts.filter(func(p): return p["t"] > 0)
	shake = max(0.0, shake - 34.0 * delta)
	if state != "play" or paused:
		queue_redraw()
		return

	# --- player (always full speed) ---
	var p := player
	var dx := (1.0 if Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D) else 0.0) - (1.0 if Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A) else 0.0)
	var dy := (1.0 if Input.is_key_pressed(KEY_DOWN) or Input.is_key_pressed(KEY_S) else 0.0) - (1.0 if Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_W) else 0.0)
	var mag := Vector2(dx, dy).length()
	if mag > 0:
		dx /= mag; dy /= mag
	var spd := 150.0 if p["focus"] else 265.0
	p["x"] = clampf(p["x"] + dx * spd * delta, 12, W - 12)
	p["y"] = clampf(p["y"] + dy * spd * delta, H * 0.35, H - 16)
	p["bank"] += (dx - p["bank"]) * minf(1.0, delta * 7.0)
	# focus meter
	var want_focus := Input.is_key_pressed(KEY_SHIFT)
	p["focus"] = want_focus and focus_meter > 0 and not focus_lock
	if p["focus"]:
		focus_meter = maxf(0.0, focus_meter - 30.0 * delta)
		if focus_meter <= 0: focus_lock = true
	else:
		focus_meter = minf(100.0, focus_meter + 14.0 * delta)
		if focus_lock and focus_meter >= 35.0: focus_lock = false
	p["inv"] = maxf(0.0, p["inv"] - delta)
	p["fire_cd"] -= delta
	if Input.is_key_pressed(KEY_SPACE) and p["fire_cd"] <= 0:
		_fire()
		p["fire_cd"] = 0.13
	# engine trail
	if parts.size() < 400:
		parts.append({"x": p["x"] + randf_range(-2, 2), "y": p["y"] + 12, "vx": randf_range(-8, 8), "vy": randf_range(60, 120), "t": 0.28, "max": 0.28})

	# --- world (slowed by focus) ---
	var wdt: float = delta * (0.45 if p["focus"] else 1.0)
	for s in spawns: s["t"] -= wdt
	var ready := spawns.filter(func(s): return s["t"] <= 0)
	spawns = spawns.filter(func(s): return s["t"] > 0)
	for s in ready: enemies.append(_make_enemy(s))
	for e in enemies:
		e["t"] += wdt
		_move_enemy(e, wdt)
		e["fire_cd"] -= wdt
		if e["fire_cd"] <= 0 and e["y"] > 0 and e["y"] < H * 0.72:
			_aimed_shot(e["x"], e["y"] + e["r"])
			e["fire_cd"] = randf_range(1.3, 2.6) * e["fire_mul"]
		if e["y"] > H + 50: e["dead"] = true
	enemies = enemies.filter(func(e): return not e["dead"])
	if boss:
		_update_boss(wdt)
	for b in bullets:
		b["x"] += b["vx"] * delta; b["y"] += b["vy"] * delta
	for b in ebullets:
		b["x"] += b["vx"] * wdt; b["y"] += b["vy"] * wdt
	bullets = bullets.filter(func(b): return b["y"] > -20 and b["y"] < H + 20 and b["x"] > -20 and b["x"] < W + 20)
	ebullets = ebullets.filter(func(b): return b["y"] > -20 and b["y"] < H + 20 and b["x"] > -20 and b["x"] < W + 20)
	for u in powerups:
		u["t"] += wdt; u["y"] += u["vy"] * wdt
		if Vector2(u["x"], u["y"]).distance_squared_to(Vector2(player["x"], player["y"])) < (9 + player["r"]) ** 2:
			u["got"] = true
			if u["kind"] == "p": weapon = mini(4, weapon + 1)
			else: bombs = mini(5, bombs + 1)
	powerups = powerups.filter(func(u): return u["y"] < H + 30 and not u.get("got"))
	for pt in parts:
		if pt.has("vx"):
			pt["x"] += pt["vx"] * delta; pt["y"] += pt["vy"] * delta

	# collisions: bullets vs enemies/boss
	for b in bullets:
		for e in enemies:
			if not e["dead"] and Vector2(e["x"], e["y"]).distance_squared_to(Vector2(b["x"], b["y"])) < (e["r"] + 4) ** 2:
				e["hp"] -= 1; b["hit"] = true
				break
		if not b.get("hit") and boss and Vector2(boss["x"], boss["y"]).distance_squared_to(Vector2(b["x"], b["y"])) < (boss["r"] + 4) ** 2:
			boss["hp"] -= 1; b["hit"] = true
	bullets = bullets.filter(func(b): return not b.get("hit"))
	for e in enemies:
		if not e["dead"] and e["hp"] <= 0:
			_kill_enemy(e)
	enemies = enemies.filter(func(e): return not e["dead"])
	if boss and boss["hp"] <= 0:
		_kill_boss()
	# player hit
	if p["inv"] <= 0:
		var hit := false
		for e in enemies:
			if not e["dead"] and Vector2(e["x"], e["y"]).distance_squared_to(Vector2(p["x"], p["y"])) < (e["r"] + p["r"]) ** 2:
				if e["type"] != "asteroid": _kill_enemy(e)
				_hit_player()
				hit = true
				break
		if not hit:
			for b in ebullets:
				if Vector2(b["x"], b["y"]).distance_squared_to(Vector2(p["x"], p["y"])) < (b["r"] + p["r"]) ** 2:
					b["hit"] = true
					_hit_player()
					break
		ebullets = ebullets.filter(func(b): return not b.get("hit"))
		if boss and Vector2(boss["x"], boss["y"]).distance_squared_to(Vector2(p["x"], p["y"])) < (boss["r"] + p["r"]) ** 2:
			_hit_player()
	# wave progression
	if not boss and enemies.is_empty() and spawns.is_empty():
		wave_timer -= wdt
		if wave_timer <= 0:
			wave += 1
			_spawn_wave(wave)
	queue_redraw()

func _move_enemy(e: Dictionary, wdt: float) -> void:
	match e["type"]:
		"drone":
			e["y"] += e["speed"] * wdt
			e["x"] = e["base_x"] + sin(e["t"] * 2 + e["phase"]) * 22
		"weaver":
			e["y"] += e["speed"] * 0.7 * wdt
			e["x"] = e["base_x"] + sin(e["t"] * 3 + e["phase"]) * 95
		"tank":
			e["y"] += e["speed"] * wdt
			e["x"] += clampf(player["x"] - e["x"], -40, 40) * wdt
		"gunner":
			if e["y"] < 110: e["y"] += e["speed"] * wdt
			else: e["x"] += sin(e["t"] * 2.2 + e["phase"]) * 90 * wdt
		"scout":
			e["y"] += e["speed"] * wdt
			e["x"] += (sin(e["t"] * 3 + e["phase"]) * 60 + clampf(player["x"] - e["x"], -25, 25)) * wdt
		"raider":
			e["y"] += e["speed"] * wdt
			e["x"] += clampf(player["x"] - e["x"], -60, 60) * wdt
		"stalker":
			if e["y"] < 130: e["y"] += e["speed"] * wdt
			else: e["x"] += sin(e["t"] * 2.5 + e["phase"]) * 110 * wdt
		"brute":
			e["y"] += e["speed"] * wdt
			e["x"] += clampf(player["x"] - e["x"], -25, 25) * wdt
		"phantom":
			e["y"] += e["speed"] * 0.8 * wdt
			e["x"] = e["base_x"] + sin(e["t"] * 4 + e["phase"]) * 110
		"asteroid":
			e["y"] += e["speed"] * wdt
			e["x"] += sin(e["t"] * 0.5 + e["phase"]) * 15 * wdt

func _make_enemy(s: Dictionary) -> Dictionary:
	var base: Dictionary = TYPES[s["type"]]
	var hp: int = base["hp"] + int(wave / 3) + (level - 1)
	return {"type": s["type"], "x": s["x"], "y": s["y"], "base_x": s["x"], "r": base["r"],
		"hp": hp, "max_hp": hp, "speed": base["speed"] * (1 + wave * 0.04) * (1 + (level - 1) * 0.12),
		"score": base["score"], "t": 0.0, "phase": randf() * 6.28, "fire_cd": randf_range(0.6, 2.2),
		"fire_mul": base["fire"], "dead": false, "variant": randi() % 8 if s["type"] == "asteroid" else 0}

func _spawn_wave(n: int) -> void:
	if level >= 2:
		var na := 2 + mini(3, level - 1)
		for i in na:
			spawns.append({"type": "asteroid", "x": randf_range(40, W - 40), "y": -randf_range(60, 300), "t": randf_range(0.2, 2.5)})
	if n % 5 == 0:
		boss = _make_boss(n)
		return
	var pats := [
		func():
			for i in 5:
				spawns.append({"type": "drone", "x": 60 + i * 90.0, "y": -40 - i * 26.0, "t": 0.2 + i * 0.16})
			for i in 2:
				spawns.append({"type": "raider", "x": 90 + i * 300.0, "y": -30 - i * 50.0, "t": 0.4 + i * 0.3}),
		func():
			for i in 7:
				spawns.append({"type": "drone", "x": 40 + i * 66.0, "y": -40.0, "t": i * 0.12})
			for i in 3:
				spawns.append({"type": "scout", "x": 100 + i * 140.0, "y": -30 - i * 40.0, "t": 0.5 + i * 0.3}),
		func():
			for i in 3:
				spawns.append({"type": "tank", "x": 100 + i * 140.0, "y": -70 - i * 50.0, "t": i * 0.5})
			spawns.append({"type": "weaver", "x": W / 2.0, "y": -220.0, "t": 0.3})
			spawns.append({"type": "brute", "x": W / 2.0, "y": -320.0, "t": 0.8})
			spawns.append({"type": "phantom", "x": 120.0, "y": -180.0, "t": 0.5}),
		func():
			for i in 4:
				spawns.append({"type": "gunner", "x": 80 + i * 105.0, "y": -50 - i * 60.0, "t": i * 0.35})
			for i in 2:
				spawns.append({"type": "stalker", "x": 110 + i * 260.0, "y": -40 - i * 60.0, "t": 0.3 + i * 0.35}),
		func():
			for i in 9:
				spawns.append({"type": "drone", "x": 50 + (i % 3) * 190.0, "y": -40 - (i / 3) * 70.0, "t": i * 0.12})
			spawns.append({"type": "tank", "x": W / 2.0, "y": -260.0, "t": 0.6})
			for i in 2:
				spawns.append({"type": "scout", "x": 120 + i * 240.0, "y": -120 - i * 50.0, "t": 0.4 + i * 0.4})
			for i in 2:
				spawns.append({"type": "raider", "x": 150 + i * 180.0, "y": -140 - i * 60.0, "t": 0.5 + i * 0.4})
			spawns.append({"type": "phantom", "x": W - 120.0, "y": -200.0, "t": 0.7}),
	]
	pats[(n - 1) % pats.size()].call()

func _make_boss(w: int) -> Dictionary:
	var hp := 220 + w * 60 + (level - 1) * 120
	return {"x": W / 2.0, "y": -90.0, "target_y": 120.0, "r": 46.0, "hp": hp, "max_hp": hp,
		"t": 0.0, "pattern": -1, "pattern_t": 2.0, "fire_cd": 1.0, "summon_t": 6.0, "dead": false,
		"sprite": level >= 2}

func _update_boss(wdt: float) -> void:
	var b = boss
	b["t"] += wdt
	if b["y"] < b["target_y"]:
		b["y"] += 55.0 * wdt
	else:
		b["x"] = W / 2.0 + sin(b["t"] * 0.8) * (W / 2.0 - 90)
		b["pattern_t"] -= wdt; b["fire_cd"] -= wdt; b["summon_t"] -= wdt
		if b["pattern_t"] <= 0:
			b["pattern"] = (b["pattern"] + 1) % 3
			b["pattern_t"] = 2.2
		if b["fire_cd"] <= 0:
			match b["pattern"]:
				0: _radial(b)
				1: _aimed_spread(b)
				2: _spiral(b)
			b["fire_cd"] = 0.85
		if b["summon_t"] <= 0:
			b["summon_t"] = 8.0
			for i in 2:
				enemies.append(_make_enemy({"type": "drone", "x": b["x"] + randf_range(-40, 40), "y": b["y"] + 30}))

func _radial(b: Dictionary) -> void:
	for i in 18:
		var a = i / 18.0 * TAU + b["t"]
		ebullets.append({"x": b["x"], "y": b["y"], "vx": cos(a) * 150, "vy": sin(a) * 150, "r": 4})

func _aimed_spread(b: Dictionary) -> void:
	var base := atan2(player["y"] - b["y"], player["x"] - b["x"])
	for i in 5:
		var a := base + (i - 2) * 0.16
		ebullets.append({"x": b["x"], "y": b["y"] + b["r"], "vx": cos(a) * 190, "vy": sin(a) * 190, "r": 4})

func _spiral(b: Dictionary) -> void:
	for i in 3:
		var a = b["t"] * 4 + i * TAU / 3
		ebullets.append({"x": b["x"], "y": b["y"], "vx": cos(a) * 130, "vy": sin(a) * 130 + 40, "r": 4})

func _aimed_shot(x: float, y: float) -> void:
	var a := atan2(player["y"] - y, player["x"] - x)
	ebullets.append({"x": x, "y": y, "vx": cos(a) * 165, "vy": sin(a) * 165, "r": 4})

func _fire() -> void:
	var lv := weapon
	if lv == 1:
		bullets.append({"x": player["x"], "y": player["y"] - 16, "vx": 0, "vy": -460, "big": false})
	elif lv == 2:
		bullets.append({"x": player["x"] - 7, "y": player["y"] - 12, "vx": 0, "vy": -460, "big": false})
		bullets.append({"x": player["x"] + 7, "y": player["y"] - 12, "vx": 0, "vy": -460, "big": false})
	elif lv == 3:
		bullets.append({"x": player["x"], "y": player["y"] - 16, "vx": 0, "vy": -500, "big": true})
		bullets.append({"x": player["x"] - 9, "y": player["y"] - 10, "vx": -70, "vy": -440, "big": false})
		bullets.append({"x": player["x"] + 9, "y": player["y"] - 10, "vx": 70, "vy": -440, "big": false})
	else:
		bullets.append({"x": player["x"], "y": player["y"] - 16, "vx": 0, "vy": -520, "big": true})
		bullets.append({"x": player["x"] - 10, "y": player["y"] - 8, "vx": -95, "vy": -440, "big": false})
		bullets.append({"x": player["x"] + 10, "y": player["y"] - 8, "vx": 95, "vy": -440, "big": false})
		bullets.append({"x": player["x"] - 5, "y": player["y"] - 12, "vx": -40, "vy": -470, "big": false})
		bullets.append({"x": player["x"] + 5, "y": player["y"] - 12, "vx": 40, "vy": -470, "big": false})

func _kill_enemy(e: Dictionary) -> void:
	e["dead"] = true
	score += e["score"]
	for i in 10:
		parts.append({"x": e["x"] + randf_range(-8, 8), "y": e["y"] + randf_range(-8, 8),
			"vx": randf_range(-90, 90), "vy": randf_range(-90, 90), "t": randf_range(0.3, 0.6), "max": 0.6})
	if e["type"] in ["weaver", "tank", "gunner"] and randf() < 0.28:
		powerups.append({"x": e["x"], "y": e["y"], "vy": 55, "t": 0, "kind": "b" if e["type"] == "gunner" else "p"})
	elif e["type"] not in ["tank", "gunner"] and randf() < 0.05:
		powerups.append({"x": e["x"], "y": e["y"], "vy": 55, "t": 0, "kind": "p"})

func _kill_boss() -> void:
	var b = boss
	boss = null
	boss_kills += 1
	score += 5000
	shake = 26.0
	for i in 40:
		parts.append({"x": b["x"] + randf_range(-40, 40), "y": b["y"] + randf_range(-40, 40),
			"vx": randf_range(-160, 160), "vy": randf_range(-160, 160), "t": randf_range(0.4, 0.9), "max": 0.9})
	wave_timer = 3.0
	if boss_kills >= level - start_level + 1:
		state = "clear"

func _hit_player() -> void:
	lives -= 1
	player["inv"] = 2.0
	shake = 14.0
	for i in 16:
		parts.append({"x": player["x"], "y": player["y"], "vx": randf_range(-120, 120), "vy": randf_range(-120, 120), "t": 0.5, "max": 0.5})
	if lives <= 0:
		state = "over"
		hi = maxi(hi, score)
		var f := FileAccess.open("user://hiscore.txt", FileAccess.WRITE)
		f.store_string(str(hi))
		f.close()

func _bank_key() -> int:
	var b: float = player["bank"]
	if b <= -0.55: return -2
	if b < -0.2: return -1
	if b >= 0.55: return 2
	if b > 0.2: return 1
	return 0

func _draw() -> void:
	# background
	draw_rect(Rect2(0, 0, W, H), Color(0.027, 0.027, 0.075))
	for s in stars:
		draw_rect(Rect2(s["x"], s["y"], s["s"], s["s"] * 2), Color(1, 1, 1, 0.5))
	var cam := Vector2.ZERO
	if shake > 0:
		cam = Vector2(randf_range(-shake, shake), randf_range(-shake, shake)) * 0.4
	# stars/entities drawn in world space with camera offset
	draw_set_transform(cam)
	for pt in parts:
		var a: float = pt["t"] / pt["max"]
		if pt.get("boss_blast"):
			var sz := 24 + (1 - a) * 72
			draw_texture_rect(tex["blast"], Rect2(pt["x"] - sz / 2, pt["y"] - sz / 2, sz, sz), false, Color(1, 1, 1, a))
		else:
			draw_circle(Vector2(pt["x"], pt["y"]), 2.5 * a + 1, Color(1, 0.75, 0.4, a))
	for u in powerups:
		var col := Color(0.49, 1, 0.42) if u["kind"] == "p" else Color(1, 0.82, 0.24)
		draw_circle(Vector2(u["x"], u["y"] + sin(u["t"] * 5) * 3), 9, col)
		draw_string(ThemeDB.fallback_font, Vector2(u["x"] - 4, u["y"] + sin(u["t"] * 5) * 3 + 4), "P" if u["kind"] == "p" else "B", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.05, 0.05, 0.1))
	for e in enemies:
		var t: Texture2D
		if e["type"] == "asteroid":
			t = asteroid_sprites[e["variant"] % 8]
		elif enemy_sprites.has(e["type"]):
			t = enemy_sprites[e["type"]]
		else:
			t = tex["scout"]
		var sc = (e["r"] * 2.6) / t.get_width()
		var dest := Rect2(e["x"] - t.get_width() * sc / 2, e["y"] - t.get_height() * sc / 2, t.get_width() * sc, t.get_height() * sc)
		draw_set_transform(cam + Vector2(0, 0), e["t"] * (0.4 if e["type"] == "asteroid" else 0.0))
		draw_texture_rect(t, dest, false)
		draw_set_transform(cam)
		if e["max_hp"] > 1:
			draw_arc(Vector2(e["x"], e["y"]), e["r"] + 4, -PI / 2, -PI / 2 + TAU * maxf(0, e["hp"] / float(e["max_hp"])), 12, Color.WHITE, 2)
	if boss:
		var b = boss
		if b["sprite"]:
			var bt: Texture2D = tex["boss"]
			var bs = (b["r"] * 2.0) / bt.get_width()
			draw_texture_rect(bt, Rect2(b["x"] - bt.get_width() * bs / 2, b["y"] - bt.get_height() * bs / 2, bt.get_width() * bs, bt.get_height() * bs), false)
			var fi := int(time * 10) % 3
			var ft: Texture2D = flame_sprites[fi]
			var fs = (b["r"] * 1.6) / ft.get_width()
			var ship_h = bt.get_height() * bs
			draw_texture_rect(ft, Rect2(b["x"] - ft.get_width() * fs / 2, b["y"] + ship_h / 2 - 6, ft.get_width() * fs, ft.get_height() * fs), false)
		else:
			# star boss
			var pts := PackedVector2Array()
			for i in 10:
				var r = b["r"] if i % 2 == 0 else b["r"] * 0.55
				var a = i / 10.0 * TAU - PI / 2 + b["t"] * 0.5
				pts.append(Vector2(b["x"], b["y"]) + Vector2(cos(a), sin(a)) * r)
			draw_colored_polygon(pts, Color(0.88, 0.14, 0.29))
			draw_circle(Vector2(b["x"], b["y"]), b["r"] * 0.28 * (1 + sin(b["t"] * 5) * 0.15), Color(1, 0.82, 0.25))
	for b in ebullets:
		var es = 12.0 / tex["ebullet"].get_width()
		draw_texture_rect(tex["ebullet"], Rect2(b["x"] - 6, b["y"] - 6, 12, 12), false)
	for b in bullets:
		var t: Texture2D = tex["special"] if b.get("big") else tex["bullet"]
		var bw := 10.0 if b.get("big") else 7.0
		var bh := 26.0 if b.get("big") else 20.0
		var ang := atan2(b["vy"], b["vx"]) + PI / 2
		draw_set_transform(cam + Vector2(b["x"], b["y"]), ang)
		draw_texture_rect(t, Rect2(-bw / 2, -bh / 2, bw, bh), false)
		draw_set_transform(cam)
	if state == "play" and player["alive"]:
		if not (player["inv"] > 0 and int(time * 20) % 2 == 0):
			var ps: Sprite2D = player["node"]
			ps.texture = player_sprites[_bank_key()]
			ps.position = Vector2(player["x"], player["y"]) + cam + Vector2(0, 2)
			if player["focus"]:
				draw_circle(Vector2(player["x"], player["y"]) + cam, player["r"], Color(1, 1, 1, 0), false, 1)
			if player["focus"]:
				draw_rect(Rect2(0, 0, W, H), Color(0.31, 0.55, 1, 0.08))
	draw_set_transform(Vector2.ZERO)
	_draw_hud()
	if state == "title": _draw_title()
	elif state == "over": _draw_over()
	elif state == "clear": _draw_clear()
	elif paused: _draw_paused()

func _draw_hud() -> void:
	var f := ThemeDB.fallback_font
	draw_string(f, Vector2(10, 20), "SCORE " + str(score).pad_zeros(8), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0.5, 1, 1))
	draw_string(f, Vector2(10, 38), "HI    " + str(hi).pad_zeros(8), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 0.8, 0.2))
	draw_string(f, Vector2(W - 10, 20), "LV%d WAVE %d" % [level, wave], HORIZONTAL_ALIGNMENT_RIGHT, -1, 13, Color(1, 0.56, 0.69))
	# focus bar
	var fx := W / 2 - 50
	draw_string(f, Vector2(fx, H - 30), "FOCUS", HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(1, 1, 1, 0.55))
	draw_rect(Rect2(fx, H - 19, 100, 6), Color(1, 1, 1, 0.15))
	var fc := Color(1, 0.3, 0.43) if focus_meter < 25 else (Color(0.49, 0.97, 1) if player["focus"] else Color(0.29, 0.56, 0.85))
	draw_rect(Rect2(fx, H - 19, 100 * focus_meter / 100.0, 6), fc)
	draw_rect(Rect2(fx, H - 19, 100, 6), Color(1, 1, 1, 0.5), false, 1)
	# pause button
	draw_rect(Rect2(W - 40, 28, 30, 20), Color(1, 1, 1, 0.18))
	draw_rect(Rect2(W - 40, 28, 30, 20), Color(1, 1, 1, 0.6), false, 1)
	draw_rect(Rect2(W - 33, 33, 5, 10), Color(0.49, 0.97, 1))
	draw_rect(Rect2(W - 24, 33, 5, 10), Color(0.49, 0.97, 1))
	# lives / bombs / weapon
	for i in lives:
		draw_texture_rect(tex["player"], Rect2(10 + i * 16, H - 24, 12, 11), false)
	for i in bombs:
		draw_texture_rect(tex["special"], Rect2(10 + i * 14, H - 44, 10, 14), false)
	for i in weapon:
		draw_rect(Rect2(W - 14 - i * 12, H - 28, 8, 14), Color(1, 0.85, 0.3))
	# boss hp
	if boss:
		draw_rect(Rect2(40, 54, W - 80, 8), Color(1, 1, 1, 0.2))
		draw_rect(Rect2(40, 54, (W - 80) * maxf(0, boss["hp"] / float(boss["max_hp"])), 8), Color(1, 0.3, 0.35))
	draw_string(f, Vector2(W - 10, H - 12), "ARROWS/WASD MOVE · SPACE FIRE · SHIFT FOCUS · X BOMB · P/ESC PAUSE", HORIZONTAL_ALIGNMENT_RIGHT, -1, 11, Color(1, 1, 1, 0.55))

func _draw_title() -> void:
	var f := ThemeDB.fallback_font
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.45))
	draw_string(f, Vector2(W / 2, H / 2 - 70), "STAR STRIKER", HORIZONTAL_ALIGNMENT_CENTER, -1, 34, Color(0.49, 0.97, 1))
	draw_string(f, Vector2(W / 2, H / 2 - 52), "- VERTICAL SHOOT-EM-UP -", HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color(1, 0.82, 0.25))
	if int(time * 2) % 2 == 0:
		draw_string(f, Vector2(W / 2, H / 2 + 10), "ENTER = LV1 · 2 = LV2", HORIZONTAL_ALIGNMENT_CENTER, -1, 18, Color.WHITE)
	var lines := ["ARROWS / WASD — MOVE", "SPACE — FIRE", "SHIFT — FOCUS (SLOW-MO, DRAINS BAR)", "X — BOMB", "P / ESC OR PAUSE BUTTON — PAUSE"]
	for i in lines.size():
		draw_string(f, Vector2(W / 2, H / 2 + 46 + i * 18), lines[i], HORIZONTAL_ALIGNMENT_CENTER, -1, 13, Color(1, 1, 1, 0.75))
	draw_string(f, Vector2(W / 2, H / 2 + 46 + lines.size() * 18 + 8), "HI-SCORE " + str(hi).pad_zeros(8), HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color(1, 0.82, 0.25))

func _draw_over() -> void:
	var f := ThemeDB.fallback_font
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.6))
	draw_string(f, Vector2(W / 2, H / 2 - 20), "GAME OVER", HORIZONTAL_ALIGNMENT_CENTER, -1, 34, Color(1, 0.3, 0.43))
	draw_string(f, Vector2(W / 2, H / 2 + 16), "SCORE " + str(score).pad_zeros(8), HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color(1, 0.82, 0.25))
	draw_string(f, Vector2(W / 2, H / 2 + 40), "HI-SCORE " + str(hi).pad_zeros(8), HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(1, 0.8, 0.2))
	if int(time * 2) % 2 == 0:
		draw_string(f, Vector2(W / 2, H / 2 + 76), "PRESS ENTER TO RETRY", HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color.WHITE)

func _draw_clear() -> void:
	var f := ThemeDB.fallback_font
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.55))
	draw_string(f, Vector2(W / 2, H / 2 - 30), "LEVEL %d CLEAR!" % level, HORIZONTAL_ALIGNMENT_CENTER, -1, 34, Color(0.49, 1, 0.42))
	draw_string(f, Vector2(W / 2, H / 2 + 12), "SCORE " + str(score).pad_zeros(8), HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color(1, 0.82, 0.25))
	if int(time * 2) % 2 == 0:
		draw_string(f, Vector2(W / 2, H / 2 + 52), "PRESS ENTER — LEVEL %d" % (level + 1), HORIZONTAL_ALIGNMENT_CENTER, -1, 15, Color.WHITE)

func _draw_paused() -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.5))
	draw_string(ThemeDB.fallback_font, Vector2(W / 2, H / 2), "PAUSED", HORIZONTAL_ALIGNMENT_CENTER, -1, 30, Color(0.49, 0.97, 1))
