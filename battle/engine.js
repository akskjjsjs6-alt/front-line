/* Game simulation: real-time, no DOM. Works in the browser and in node for testing. */
(function (root) {
  const W = 1600, H = 1000, CELL = 5, GW = W / CELL, GH = H / CELL, NAV = 20, NW = W / NAV, NH = H / NAV;
  const URBAN = 7;

  // speed multiplier, defence multiplier
  const TERRAIN = [
    { name: 'Water', speed: 0, def: 1 },
    { name: 'Open ground', speed: 1, def: 1 },
    { name: 'Forest', speed: 0.6, def: 1.4 },
    { name: 'Hills', speed: 0.65, def: 1.35 },
    { name: 'Mountains', speed: 0.35, def: 1.8 },
    { name: 'Marsh', speed: 0.45, def: 1.25 },
    { name: 'Desert', speed: 0.95, def: 0.95 },
    { name: 'Urban', speed: 0.8, def: 1.7 }
  ];

  const UNITS = {
    inf:   { name: 'Infantry', speed: 6, atk: 4, def: 6, range: 26, sight: 90, cost: 30, about: 'Cheap and tough when dug in, especially in forests and cities. Slow.' },
    mech:  { name: 'Mechanized Infantry', speed: 10, atk: 6, def: 6, range: 26, sight: 90, cost: 50, about: 'Infantry in armored vehicles. The all-rounder.' },
    armor: { name: 'Armor', speed: 11, atk: 9, def: 6, range: 26, sight: 90, cost: 70, heavy: true, about: 'Tanks. Hits hardest on open ground, weaker attacking into forests and cities.' },
    recon: { name: 'Reconnaissance', speed: 14, atk: 4, def: 4, range: 26, sight: 170, cost: 35, about: 'Fast and sees far. Use it to spot targets for artillery.' },
    art:   { name: 'Artillery', speed: 7, atk: 6, def: 2, range: 120, sight: 70, cost: 55, ranged: true, about: 'Fires at spotted enemies from far away when standing still. Fragile up close.' },
    mlrs:  { name: 'Rocket Artillery', speed: 7, atk: 8, def: 1.5, range: 165, sight: 70, cost: 80, ranged: true, about: 'Longer range and heavier fire than tube artillery.' },
    ad:    { name: 'Air Defense', speed: 8, atk: 1.5, def: 3, range: 26, sight: 100, cost: 45, adRange: 150, about: 'Shoots down helicopters and drones and weakens enemy air strikes nearby.' },
    heli:  { name: 'Attack Helicopters', speed: 28, atk: 8, def: 3, range: 34, sight: 130, cost: 80, air: true, about: 'Very fast, flies over anything. Cannot take ground. Dies to air defense.' },
    uas:   { name: 'Drone Group (UAS)', speed: 24, atk: 5, def: 1, range: 110, sight: 210, cost: 40, air: true, ranged: true, about: 'Huge vision and long-range strikes. Flies. Fragile.' },
    hq:    { name: 'Headquarters', speed: 9, atk: 1, def: 3, range: 26, sight: 100, cost: 0, hqRange: 160, about: 'Units within its radius fight 15% better. Protect it.' }
  };
  const ECH = { II: 0.55, III: 0.8, X: 1, XX: 1.35, XXX: 1 };
  const K = 1.6, SPEED = 0.5, ZOC = 55;

  // ---------- noise ----------
  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function makeNoise(seed) {
    return (u, v, scale, k) => {
      const x = u * 1.6 / scale, y = v / scale, s = seed * 31 + k;
      return vnoise(x, y, s) * 0.65 + vnoise(x * 2.3, y * 2.3, s + 7) * 0.35;
    };
  }

  // ---------- helpers ----------
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const cellIdx = (x, y) => {
    const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL))), cy = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)));
    return cy * GW + cx;
  };
  const other = s => (s === 1 ? 2 : 1);
  const terrainAt = (st, x, y) => st.terrain[cellIdx(x, y)];
  const isLand = (st, x, y) => x >= 0 && y >= 0 && x < W && y < H && st.terrain[cellIdx(x, y)] !== 0;

  function freeSpot(st, x, y, side, needOwn) {
    for (let r = 0; r < 400; r += 6) {
      const n = r === 0 ? 1 : Math.max(6, Math.round(r / 3));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (px < 8 || py < 8 || px > W - 8 || py > H - 8 || !isLand(st, px, py)) continue;
        if (needOwn && st.owner[cellIdx(px, py)] !== side) continue;
        if (st.units.some(u => (u.x - px) ** 2 + (u.y - py) ** 2 < 18 * 18)) continue;
        return { x: px, y: py };
      }
    }
    return { x, y };
  }

  function addUnit(st, side, type, ech, name, x, y, ent) {
    const p = freeSpot(st, x, y, side, false);
    const u = { id: st.nextId++, side, type, ech, name, x: p.x, y: p.y, str: 100, path: [], ent: ent ? 1 : 0, still: ent ? 30 : 0, engaged: false, sup: true, fireT: Math.random(), kills: 0 };
    st.units.push(u);
    return u;
  }

  // ---------- setup ----------
  function createGame(scen, playerSide, difficulty) {
    const N = makeNoise(scen.seed);
    const st = {
      scenId: scen.id, time: 0, duration: scen.duration, player: playerSide, ai: other(playerSide), difficulty: difficulty || 'normal',
      terrain: new Uint8Array(GW * GH), river: new Uint8Array(GW * GH), owner: new Uint8Array(GW * GH),
      cities: [], units: [], nextId: 1, fx: [], log: [], strikes: [], over: null,
      sides: {}, vis: { 1: new Set(), 2: new Set() }, reinfDone: [], territoryVersion: 0,
      timers: { vis: 0, paint: 0, slow: 0 }, losses: { 1: 0, 2: 0 }, rivers: []
    };
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const u = (gx + 0.5) / GW, v = (gy + 0.5) / GH, i = gy * GW + gx;
      st.terrain[i] = scen.terrain(u, v, N);
      st.owner[i] = st.terrain[i] === 0 ? 0 : scen.owner(u, v);
    }
    // rivers: smoothed polylines, cells under them get the river flag
    for (const r of scen.rivers) {
      const pts = [];
      for (let k = 0; k < r.length - 1; k++) {
        const [u0, v0] = r[k], [u1, v1] = r[k + 1];
        const steps = Math.ceil(Math.hypot((u1 - u0) * W, (v1 - v0) * H) / 4);
        for (let s = 0; s < steps; s++) {
          const t = s / steps, x = (u0 + (u1 - u0) * t) * W, y = (v0 + (v1 - v0) * t) * H;
          const wob = Math.sin((x + y) * 0.035 + k) * 6;
          pts.push([x + wob * 0.7, y + wob * 0.5]);
        }
      }
      st.rivers.push(pts);
      for (const [x, y] of pts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = cellIdx(x + dx * 3, y + dy * 3);
        if (st.terrain[i] !== 0) st.river[i] = 1;
      }
    }
    // cities
    for (const [name, u, v, vp, flag] of scen.cities) {
      const x = u * W, y = v * H, side = scen.owner(u, v);
      st.cities.push({ name, x, y, vp, sup: flag === 'sup' || flag === 'cap', cap: flag === 'cap', owner: side, orig: side });
      for (let dy = -14; dy <= 14; dy += CELL) for (let dx = -14; dx <= 14; dx += CELL) {
        if (dx * dx + dy * dy > 14 * 14) continue;
        const i = cellIdx(x + dx, y + dy);
        st.terrain[i] = URBAN; st.river[i] = 0; st.owner[i] = side;
      }
    }
    for (const s of [1, 2]) {
      const d = scen.sides[s];
      const hard = difficulty === 'hard' && s !== playerSide, easy = difficulty === 'easy' && s !== playerSide;
      st.sides[s] = { name: d.name, long: d.long, qual: d.qual + (hard ? 0.08 : easy ? -0.08 : 0), airRate: d.airRate, airMax: d.airMax,
        air: Math.min(2, d.airMax), money: 60, income: hard ? 1.3 : easy ? 0.8 : 1, home: d.home, built: 0 };
    }
    for (const [side, type, ech, name, u, v, ent] of scen.units) addUnit(st, side, type, ech, name, u * W, v * H, ent);
    buildNav(st);
    computeSupply(st); updateVision(st);
    log(st, 0, `${scen.title}, ${scen.year}. ${st.sides[scen.attacker].name} attacks.`);
    return st;
  }

  function log(st, side, text) { st.log.push({ t: st.time, side, text }); if (st.log.length > 120) st.log.shift(); st.fx.push({ kind: 'msg', side, text }); }

  // ---------- navigation ----------
  function buildNav(st) {
    st.nav = new Float32Array(NW * NH);
    const per = NAV / CELL;
    for (let ny = 0; ny < NH; ny++) for (let nx = 0; nx < NW; nx++) {
      let water = 0, sp = 0, n = 0;
      for (let y = 0; y < per; y++) for (let x = 0; x < per; x++) {
        const i = (ny * per + y) * GW + nx * per + x, t = st.terrain[i];
        n++; if (t === 0) water++; else sp += TERRAIN[t].speed * (st.river[i] ? 0.6 : 1);
      }
      st.nav[ny * NW + nx] = water > n * 0.5 ? 0 : sp / (n - water);
    }
  }
  function nearestNav(st, nx, ny) {
    if (st.nav[ny * NW + nx] > 0) return [nx, ny];
    for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = nx + dx, y = ny + dy;
      if (x >= 0 && y >= 0 && x < NW && y < NH && st.nav[y * NW + x] > 0) return [x, y];
    }
    return [nx, ny];
  }
  function lineClear(st, a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 4);
    for (let i = 1; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
      if (!isLand(st, x, y)) return false;
    }
    return true;
  }
  function findPath(st, u, tx, ty) {
    tx = Math.max(4, Math.min(W - 4, tx)); ty = Math.max(4, Math.min(H - 4, ty));
    if (UNITS[u.type].air) return [{ x: tx, y: ty }];
    const goal = { x: tx, y: ty };
    if (lineClear(st, u, goal) && Math.hypot(tx - u.x, ty - u.y) < 90) return isLand(st, tx, ty) ? [goal] : [];
    const [sx, sy] = nearestNav(st, Math.floor(u.x / NAV), Math.floor(u.y / NAV));
    const [gx, gy] = nearestNav(st, Math.floor(tx / NAV), Math.floor(ty / NAV));
    const start = sy * NW + sx, end = gy * NW + gx;
    const g = new Float32Array(NW * NH).fill(Infinity), came = new Int32Array(NW * NH).fill(-1), closed = new Uint8Array(NW * NH);
    const heap = []; // binary heap of [f, idx]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    g[start] = 0; push(0, start);
    const enemy = other(u.side);
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue; closed[cur] = 1;
      if (cur === end) break;
      const cx = cur % NW, cy = (cur / NW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= NW || y >= NH) continue;
        const ni = y * NW + x, sp = st.nav[ni];
        if (sp <= 0 || closed[ni]) continue;
        if (dx && dy && (st.nav[cy * NW + x] <= 0 || st.nav[y * NW + cx] <= 0)) continue;
        const own = st.owner[cellIdx(x * NAV + NAV / 2, y * NAV + NAV / 2)];
        const step = (dx && dy ? 1.414 : 1) / sp * (own === enemy ? 1.15 : 1);
        const ng = g[cur] + step;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ng + Math.hypot(gx - x, gy - y), ni); }
      }
    }
    if (came[end] === -1 && end !== start) return [];
    const cells = [];
    for (let c = end; c !== -1 && c !== start; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => ({ x: (c % NW) * NAV + NAV / 2, y: ((c / NW) | 0) * NAV + NAV / 2 }));
    if (isLand(st, tx, ty)) pts.push(goal);
    // string pulling
    const out = []; let from = { x: u.x, y: u.y }, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !lineClear(st, from, pts[j])) j--;
      out.push(pts[j]); from = pts[j]; i = j + 1;
    }
    return out;
  }

  // ---------- orders ----------
  function orderMove(st, u, x, y) { u.path = findPath(st, u, x, y); u.goal = { x, y }; }

  function resample(line, n) {
    const segs = []; let total = 0;
    for (let i = 1; i < line.length; i++) { const d = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y); segs.push(d); total += d; }
    const out = [];
    for (let k = 0; k < n; k++) {
      let target = total * (n === 1 ? 0.5 : (k + 0.5) / n), i = 0;
      while (i < segs.length - 1 && target > segs[i]) { target -= segs[i]; i++; }
      const t = segs[i] ? target / segs[i] : 0, a = line[i], b = line[i + 1] || a;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  }
  // Spread the selected units along a drawn line (War of Dots style front line).
  function orderLine(st, units, line) {
    if (!units.length) return;
    const pts = resample(line, units.length);
    const a = line[0], b = line[line.length - 1], dx = b.x - a.x, dy = b.y - a.y;
    const sorted = units.slice().sort((p, q) => (p.x * dx + p.y * dy) - (q.x * dx + q.y * dy));
    sorted.forEach((u, i) => orderMove(st, u, pts[i].x, pts[i].y));
  }
  // Follow a hand-drawn route; water crossings are routed around.
  function orderPath(st, u, line) {
    const pts = [], air = UNITS[u.type].air;
    let last = { x: u.x, y: u.y };
    for (const p of line) {
      if (Math.hypot(p.x - last.x, p.y - last.y) < 22 && p !== line[line.length - 1]) continue;
      if (!air && !isLand(st, p.x, p.y)) continue;
      if (air || lineClear(st, last, p)) pts.push({ x: p.x, y: p.y });
      else pts.push(...findPath(st, { x: last.x, y: last.y, side: u.side, type: u.type }, p.x, p.y));
      last = p;
    }
    u.path = pts; u.goal = pts[pts.length - 1] || null;
  }
  // Move a group to a point, keeping their formation loosely.
  function orderGroup(st, units, x, y) {
    if (!units.length) return;
    if (units.length === 1) return orderMove(st, units[0], x, y);
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length, cy = units.reduce((s, u) => s + u.y, 0) / units.length;
    let spread = Math.sqrt(units.reduce((s, u) => s + (u.x - cx) ** 2 + (u.y - cy) ** 2, 0) / units.length);
    const k = spread > 60 ? 60 / spread : 1;
    for (const u of units) orderMove(st, u, x + (u.x - cx) * k, y + (u.y - cy) * k);
  }

  function canBuyAt(st, side, city) {
    if (city.owner !== side) return false;
    return !st.units.some(u => u.side !== side && !UNITS[u.type].air && dist2(u, city) < 90 * 90);
  }
  function buy(st, side, type, city) {
    const T = UNITS[type], S = st.sides[side];
    if (!T || S.money < T.cost || !canBuyAt(st, side, city)) return null;
    S.money -= T.cost; S.built++;
    const ech = type === 'heli' || type === 'uas' || type === 'ad' ? 'II' : 'X';
    const u = addUnit(st, side, type, ech, `${ordinal(S.built)} ${shortName(type)} (new)`, city.x, city.y);
    u.str = 100;
    log(st, side, `${S.name}: ${u.name} deployed at ${city.name}.`);
    return u;
  }
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function shortName(type) { return { inf: 'Inf Bde', mech: 'Mech Bde', armor: 'Armd Bde', recon: 'Recon Bde', art: 'Arty Bde', mlrs: 'Rocket Bde', ad: 'AD Bn', heli: 'Avn Bn', uas: 'UAS Sqn', hq: 'HQ' }[type]; }

  function airStrike(st, side, x, y) {
    const S = st.sides[side];
    if (S.air < 1) return false;
    S.air -= 1;
    st.strikes.push({ side, x, y, t: st.time + 1.5 });
    st.fx.push({ kind: 'jet', side, x, y });
    return true;
  }

  // ---------- simulation ----------
  function hqNear(st, u) {
    for (const h of st.units) if (h.type === 'hq' && h.side === u.side && h !== u && dist2(h, u) < UNITS.hq.hqRange ** 2) return true;
    return false;
  }
  function defMult(st, t, attackerAir) {
    if (UNITS[t.type].air) return 1;
    const i = cellIdx(t.x, t.y), tt = st.terrain[i];
    let m = TERRAIN[tt].def + (st.river[i] ? 0.2 : 0);
    if (t.type === 'inf' && (tt === 2 || tt === 4 || tt === URBAN)) m *= 1.15;
    if (attackerAir) m = 1 + (m - 1) * 0.5;
    return m;
  }
  function dps(st, u, t) {
    const T = UNITS[u.type], D = UNITS[t.type];
    let a = T.atk * ECH[u.ech] * (0.25 + 0.75 * u.str / 100) * st.sides[u.side].qual * (u.sup ? 1 : 0.65);
    if (u.hq) a *= 1.15;
    if (T.heavy && !D.air) {
      const tt = terrainAt(st, t.x, t.y);
      a *= (tt === 2 || tt === 4 || tt === 5 || tt === URBAN) ? 0.7 : (tt === 1 || tt === 6) ? 1.15 : 1;
    }
    const d = D.def * ECH[t.ech] * defMult(st, t, !!T.air) * (1 + 0.5 * t.ent) * (t.sup ? 1 : 0.7) * (t.hq ? 1.1 : 1);
    let r = K * a / d;
    if (T.ranged) r *= 0.5;
    if (D.air) r *= u.type === 'ad' ? 4 : 0.35;
    return r;
  }
  function pickTarget(st, u) {
    const T = UNITS[u.type];
    if (T.ranged && u.path.length) return null;
    const seen = st.vis[u.side];
    let best = null, bd = Infinity;
    for (const t of st.units) {
      if (t.side === u.side || t.dead) continue;
      const D = UNITS[t.type];
      let range = T.range;
      if (u.type === 'ad' && D.air) range = T.adRange;
      else if (D.air && T.ranged) continue;          // artillery can't hit aircraft
      const d = dist2(u, t);
      if (d > range * range) continue;
      if ((T.ranged || range > 40) && !seen.has(t.id)) continue;
      const score = d * (D.air && u.type === 'ad' ? 0.3 : 1);
      if (score < bd) { bd = score; best = t; }
    }
    return best;
  }

  function step(st, dt) {
    if (st.over) return;
    st.time += dt;
    const units = st.units;
    for (const u of units) u.hq = hqNear(st, u);

    // movement
    for (const u of units) {
      const T = UNITS[u.type];
      if (!u.path.length) {
        if (!T.air) { u.still += dt; if (u.still > 5) u.ent = Math.min(1, u.ent + dt / 25); }
        continue;
      }
      u.still = 0; u.ent = Math.max(0, u.ent - dt * 0.5);
      const tgt = u.path[0], dx = tgt.x - u.x, dy = tgt.y - u.y, d = Math.hypot(dx, dy);
      const ci = cellIdx(u.x, u.y);
      let sp = T.speed * SPEED;
      if (!T.air) {
        if (inZoc(st, u)) sp *= 0.4;
        sp *= TERRAIN[st.terrain[ci]].speed || 0.3;
        if (st.river[ci]) sp *= 0.45;
        if (st.owner[ci] !== u.side) sp *= 0.8;
        if (!u.sup) sp *= 0.7;
      }
      const mv = sp * dt;
      if (d <= mv) { if (canStand(st, u, tgt.x, tgt.y)) { u.x = tgt.x; u.y = tgt.y; } u.path.shift(); continue; }
      let nx = u.x + dx / d * mv, ny = u.y + dy / d * mv;
      if (blocked(st, u, nx, ny)) { u.engaged = true; continue; }
      if (!T.air && !isLand(st, nx, ny)) {
        if (isLand(st, nx, u.y)) ny = u.y; else if (isLand(st, u.x, ny)) nx = u.x; else { u.path = []; continue; }
      }
      u.x = nx; u.y = ny;
    }
    // friendly separation
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      if (a.side !== b.side || !!UNITS[a.type].air !== !!UNITS[b.type].air) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 > 16 * 16 || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (16 - d) * 0.5 * Math.min(1, dt * 6), ux = dx / d, uy = dy / d;
      const am = a.path.length ? 0.3 : 1, bm = b.path.length ? 0.3 : 1;
      if (UNITS[a.type].air || isLand(st, a.x - ux * push, a.y - uy * push)) { a.x -= ux * push * am; a.y -= uy * push * am; }
      if (UNITS[b.type].air || isLand(st, b.x + ux * push, b.y + uy * push)) { b.x += ux * push * bm; b.y += uy * push * bm; }
    }

    // combat
    const dmg = new Map();
    for (const u of units) {
      u.engaged = false;
      const t = pickTarget(st, u);
      if (!t) continue;
      const T = UNITS[u.type];
      if (!T.ranged) u.engaged = true;
      dmg.set(t, (dmg.get(t) || 0) + dps(st, u, t) * dt);
      t.lastHit = st.time;
      u.fireT -= dt;
      if (u.fireT <= 0) { u.fireT = T.ranged ? 1.4 + Math.random() : 0.5 + Math.random() * 0.6; st.fx.push({ kind: 'shot', ranged: !!T.ranged, side: u.side, x0: u.x, y0: u.y, x1: t.x, y1: t.y, ad: u.type === 'ad' }); }
    }
    for (const [t, d] of dmg) { t.str -= d; t.engaged = t.engaged || !UNITS[t.type].ranged; }

    // air strikes
    for (let k = st.strikes.length - 1; k >= 0; k--) {
      const s = st.strikes[k];
      if (st.time < s.t) continue;
      st.strikes.splice(k, 1);
      const R = 55;
      const nAD = units.filter(u => u.side !== s.side && u.type === 'ad' && dist2(u, s) < UNITS.ad.adRange ** 2).length;
      let hits = 0;
      for (const t of units) {
        if (t.side === s.side) continue;
        const d = Math.sqrt(dist2(t, s));
        if (d > R) continue;
        const dd = 32 * (1 - d / (R * 1.3)) / Math.sqrt(defMult(st, t, true)) * Math.pow(0.6, nAD) / ECH[t.ech] ** 0.5;
        t.str -= dd; hits++;
      }
      st.fx.push({ kind: 'boom', x: s.x, y: s.y, big: true });
      if (nAD && Math.random() < 0.15 * nAD) { st.sides[s.side].airMax = Math.max(1, st.sides[s.side].airMax - 1); log(st, s.side, `${st.sides[s.side].name} aircraft shot down by air defense.`); }
      if (s.side === st.player) st.fx.push({ kind: 'note', text: hits ? `Air strike hit ${hits} unit${hits > 1 ? 's' : ''}${nAD ? ' (air defense reduced it)' : ''}` : 'Air strike hit nothing' });
    }

    // health, supply effects
    for (const u of units) {
      const air = UNITS[u.type].air;
      if (!u.sup && !air) u.str -= 0.18 * dt;
      else if (!u.engaged && (!u.lastHit || st.time - u.lastHit > 4)) {
        const nearCity = st.cities.some(c => c.owner === u.side && dist2(c, u) < 45 * 45);
        u.str = Math.min(100, u.str + (nearCity ? 0.55 : 0.25) * dt);
      }
    }
    // deaths
    for (const u of units) if (u.str <= 0) {
      u.dead = true; st.losses[u.side]++;
      st.fx.push({ kind: 'boom', x: u.x, y: u.y });
      log(st, u.side, `${st.sides[u.side].name} ${u.name} destroyed.`);
    }
    if (units.some(u => u.dead)) st.units = units.filter(u => !u.dead);

    // economy
    for (const s of [1, 2]) {
      const S = st.sides[s];
      const vp = st.cities.reduce((a, c) => a + (c.owner === s ? c.vp : 0), 0);
      S.money += (0.5 + 0.13 * vp) * S.income * dt;
      S.air = Math.min(S.airMax, S.air + S.airRate * dt);
    }

    st.timers.vis -= dt; st.timers.paint -= dt; st.timers.slow -= dt;
    if (st.timers.paint <= 0) { st.timers.paint = 0.25; paint(st); }
    if (st.timers.vis <= 0) { st.timers.vis = 0.3; updateVision(st); }
    if (st.timers.slow <= 0) { st.timers.slow = 1; computeSupply(st); updateCities(st); reinforcements(st); checkVictory(st); }
  }

  function inZoc(st, u) {
    for (const t of st.units) if (t.side !== u.side && !UNITS[t.type].air && dist2(t, u) < ZOC * ZOC) return true;
    return false;
  }
  function canStand(st, u, x, y) { return UNITS[u.type].air || isLand(st, x, y); }
  function blocked(st, u, nx, ny) {
    if (UNITS[u.type].air) {
      // aircraft stop when something to shoot is in range
      return st.units.some(t => t.side !== u.side && dist2(t, { x: nx, y: ny }) < (UNITS[u.type].range * 0.9) ** 2 && (UNITS[u.type].ranged ? st.vis[u.side].has(t.id) : true)) && !u.forceMove;
    }
    for (const t of st.units) {
      if (t.side === u.side || UNITS[t.type].air) continue;
      const dn = (t.x - nx) ** 2 + (t.y - ny) ** 2;
      if (dn < 22 * 22 && dn < dist2(t, u)) return true;
    }
    return false;
  }

  function paint(st) {
    const R = 22, R2 = R * R, ground = st.units.filter(u => !UNITS[u.type].air);
    let changed = false;
    for (const u of ground) {
      const enemies = ground.filter(e => e.side !== u.side && dist2(e, u) < 60 * 60);
      const x0 = Math.floor((u.x - R) / CELL), x1 = Math.floor((u.x + R) / CELL), y0 = Math.floor((u.y - R) / CELL), y1 = Math.floor((u.y + R) / CELL);
      for (let gy = Math.max(0, y0); gy <= Math.min(GH - 1, y1); gy++) for (let gx = Math.max(0, x0); gx <= Math.min(GW - 1, x1); gx++) {
        const i = gy * GW + gx;
        if (st.owner[i] === u.side || st.terrain[i] === 0) continue;
        const cx = gx * CELL + CELL / 2, cy = gy * CELL + CELL / 2;
        if ((cx - u.x) ** 2 + (cy - u.y) ** 2 > R2) continue;
        let contested = false;
        for (const e of enemies) if ((e.x - cx) ** 2 + (e.y - cy) ** 2 < 26 * 26) { contested = true; break; }
        if (!contested) { st.owner[i] = u.side; changed = true; }
      }
    }
    if (changed) st.territoryVersion++;
  }

  function computeSupply(st) {
    st.supplied = { 1: new Uint8Array(GW * GH), 2: new Uint8Array(GW * GH) };
    for (const s of [1, 2]) {
      const sup = st.supplied[s], q = [];
      const seed = i => { if (st.owner[i] === s && !sup[i]) { sup[i] = 1; q.push(i); } };
      const home = st.sides[s].home;
      for (let k = 0; k < (home === 'W' || home === 'E' ? GH : GW); k++) {
        if (home === 'W') seed(k * GW); else if (home === 'E') seed(k * GW + GW - 1);
        else if (home === 'N') seed(k); else seed((GH - 1) * GW + k);
      }
      for (const c of st.cities) if (c.sup && c.owner === s) seed(cellIdx(c.x, c.y));
      while (q.length) {
        const i = q.pop(), x = i % GW, y = (i / GW) | 0;
        if (x > 0) seed(i - 1); if (x < GW - 1) seed(i + 1); if (y > 0) seed(i - GW); if (y < GH - 1) seed(i + GW);
      }
    }
    // Pockets with no supply and no troops of their owner fall to the encircling side.
    const seen = new Uint8Array(GW * GH), unitCells = { 1: new Set(), 2: new Set() };
    for (const u of st.units) if (!UNITS[u.type].air) unitCells[u.side].add(cellIdx(u.x, u.y));
    let flipped = 0;
    for (let i = 0; i < GW * GH; i++) {
      const s = st.owner[i];
      if (!s || seen[i] || st.supplied[s][i]) continue;
      const comp = [i], q = [i]; seen[i] = 1; let troops = false;
      while (q.length) {
        const j = q.pop(), x = j % GW, y = (j / GW) | 0;
        if (unitCells[s].has(j)) troops = true;
        for (const n of [x > 0 ? j - 1 : -1, x < GW - 1 ? j + 1 : -1, y > 0 ? j - GW : -1, y < GH - 1 ? j + GW : -1]) {
          if (n < 0 || seen[n] || st.owner[n] !== s) continue;
          seen[n] = 1; comp.push(n); q.push(n);
        }
      }
      if (!troops && comp.length < 4000) { for (const j of comp) { st.owner[j] = other(s); st.supplied[other(s)][j] = 1; } flipped += comp.length; }
    }
    if (flipped) st.territoryVersion++;
    for (const u of st.units) {
      if (UNITS[u.type].air) { u.sup = true; continue; }
      const sup = st.supplied[u.side], gx = Math.floor(u.x / CELL), gy = Math.floor(u.y / CELL);
      let ok = false;
      for (let dy = -3; dy <= 3 && !ok; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x >= 0 && y >= 0 && x < GW && y < GH && sup[y * GW + x]) { ok = true; break; }
      }
      if (u.sup && !ok && u.side === st.player) st.fx.push({ kind: 'note', text: `${u.name} is cut off from supply!` });
      u.sup = ok;
    }
  }

  function updateCities(st) {
    for (const c of st.cities) {
      const o = st.owner[cellIdx(c.x, c.y)];
      if (o && o !== c.owner && st.units.some(u => u.side === c.owner && !UNITS[u.type].air && dist2(u, c) < 40 * 40)) {
        // a garrison holds the city: the streets stay ours
        for (let dy = -14; dy <= 14; dy += CELL) for (let dx = -14; dx <= 14; dx += CELL) st.owner[cellIdx(c.x + dx, c.y + dy)] = c.owner;
        st.territoryVersion++;
        continue;
      }
      if (o && o !== c.owner) {
        c.owner = o;
        log(st, o, `${c.name} captured by ${st.sides[o].name}.`);
        st.fx.push({ kind: 'capture', x: c.x, y: c.y, side: o });
      }
    }
  }

  function reinforcements(st) {
    const scen = root.SCENARIOS.find(s => s.id === st.scenId);
    scen.reinf.forEach((r, i) => {
      if (st.reinfDone.includes(i) || st.time < r[0]) return;
      st.reinfDone.push(i);
      const [, side, type, ech, name, u, v] = r;
      const p = freeSpot(st, u * W, v * H, side, true);
      addUnit(st, side, type, ech, name, p.x, p.y);
      log(st, side, `Reinforcements: ${name} arrives for ${st.sides[side].name}.`);
    });
  }

  function updateVision(st) {
    for (const s of [1, 2]) {
      const vis = new Set(), own = st.units.filter(u => u.side === s), cities = st.cities.filter(c => c.owner === s);
      for (const t of st.units) {
        if (t.side === s) continue;
        let v = cities.some(c => dist2(c, t) < 70 * 70);
        if (!v) for (const u of own) { const r = UNITS[u.type].sight; if (dist2(u, t) < r * r) { v = true; break; } }
        if (v) vis.add(t.id);
      }
      st.vis[s] = vis;
    }
  }

  function heldVP(st, side) {
    return st.cities.reduce((a, c) => a + (c.orig !== side && c.owner === side ? c.vp : 0), 0);
  }
  function checkVictory(st) {
    const scen = root.SCENARIOS.find(s => s.id === st.scenId), A = scen.attacker, D = other(A);
    const end = (winner, reason) => { st.over = { winner, reason }; log(st, winner, reason); };
    const capA = st.cities.find(c => c.cap && c.orig === D && c.owner === A);
    if (capA) return end(A, `${st.sides[A].name} captured ${capA.name}.`);
    const capD = st.cities.find(c => c.cap && c.orig === A && c.owner === D);
    if (capD) return end(D, `${st.sides[D].name} captured ${capD.name}.`);
    for (const s of [1, 2]) if (!st.units.some(u => u.side === s && !UNITS[u.type].air && u.type !== 'hq')) return end(other(s), `${st.sides[s].name} has no ground forces left.`);
    if (st.time >= st.duration) {
      const vp = heldVP(st, A);
      if (vp >= scen.target) end(A, `${st.sides[A].name} holds ${vp} of the ${scen.target} victory points it needed.`);
      else end(D, `${st.sides[D].name} held out. The attacker took only ${vp} of ${scen.target} victory points.`);
    }
  }

  // ---------- save / load ----------
  function serialize(st) {
    const o = Object.assign({}, st);
    o.terrain = Array.from(st.terrain); o.river = Array.from(st.river); o.owner = Array.from(st.owner);
    o.vis = { 1: [...st.vis[1]], 2: [...st.vis[2]] };
    delete o.nav; delete o.supplied; o.fx = [];
    return JSON.stringify(o);
  }
  function deserialize(json) {
    const st = JSON.parse(json);
    st.terrain = Uint8Array.from(st.terrain); st.river = Uint8Array.from(st.river); st.owner = Uint8Array.from(st.owner);
    st.vis = { 1: new Set(st.vis[1]), 2: new Set(st.vis[2]) };
    buildNav(st); computeSupply(st);
    return st;
  }

  root.Engine = {
    W, H, CELL, GW, GH, TERRAIN, UNITS, ECH, URBAN,
    createGame, step, orderMove, orderLine, orderGroup, orderPath, findPath, buy, canBuyAt, airStrike, heldVP,
    cellIdx, isLand, dist2, other, dps, defMult, serialize, deserialize, log
  };
})(typeof window !== 'undefined' ? window : globalThis);
