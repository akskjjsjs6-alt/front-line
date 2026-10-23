/* Enemy commander. Reads only what its side can see; issues the same orders a player can. */
(function (root) {
  const E = () => root.Engine;
  const INTERVAL = { easy: 4, normal: 2.5, hard: 1.5 };

  function power(u) { const T = E().UNITS[u.type]; return T.atk * E().ECH[u.ech] * u.str / 100; }
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // Points along our side of the front line, bucketed, with a vector pointing at the enemy.
  function frontPoints(st, side) {
    const { GW, GH, CELL } = E(), enemy = E().other(side), B = 70, buckets = new Map();
    for (let gy = 1; gy < GH - 1; gy += 2) for (let gx = 1; gx < GW - 1; gx += 2) {
      const i = gy * GW + gx;
      if (st.owner[i] !== side) continue;
      let ex = 0, ey = 0, n = 0;
      for (let dy = -2; dy <= 2; dy += 2) for (let dx = -2; dx <= 2; dx += 2) {
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if (st.owner[y * GW + x] === enemy) { ex += dx; ey += dy; n++; }
      }
      if (!n) continue;
      const wx = gx * CELL + CELL / 2, wy = gy * CELL + CELL / 2, key = Math.floor(wx / B) + ',' + Math.floor(wy / B);
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { x: 0, y: 0, n: 0, dx: 0, dy: 0 });
      b.x += wx; b.y += wy; b.n++; b.dx += ex; b.dy += ey;
    }
    const pts = [];
    for (const b of buckets.values()) {
      if (b.n < 2) continue;
      const l = Math.hypot(b.dx, b.dy) || 1;
      pts.push({ x: b.x / b.n, y: b.y / b.n, dx: b.dx / l, dy: b.dy / l, threat: 0, claimed: 0 });
    }
    return pts;
  }

  function setGoal(st, u, x, y) {
    if (u.goal && Math.hypot(u.goal.x - x, u.goal.y - y) < 25 && (u.path.length || d(u, u.goal) < 20)) return;
    if (Math.hypot(u.x - x, u.y - y) < 12) { u.goal = { x, y }; return; }
    E().orderMove(st, u, x, y);
  }
  function landNear(st, x, y) {
    for (let r = 0; r < 80; r += 10) for (let a = 0; a < 6.28; a += 0.8) {
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (E().isLand(st, px, py)) return { x: px, y: py };
      if (r === 0) break;
    }
    return { x, y };
  }

  function think(st, side, dtSinceStart) {
    const Eng = E(), U = Eng.UNITS, scen = root.SCENARIOS.find(s => s.id === st.scenId), enemy = Eng.other(side);
    st.aiMem = st.aiMem || {};
    const mem = st.aiMem[side] = st.aiMem[side] || { next: 0 };
    if (st.time < mem.next) return;
    mem.next = st.time + (INTERVAL[st.difficulty] || 2.5);
    const easy = st.difficulty === 'easy';
    const attacker = scen.attacker === side;
    const mine = st.units.filter(u => u.side === side);
    const foes = st.units.filter(u => u.side === enemy && st.vis[side].has(u.id));
    const front = frontPoints(st, side);
    for (const p of front) for (const f of foes) { const dd = d(p, f); if (dd < 160) p.threat += power(f) * (1 - dd / 160); }
    const myCities = st.cities.filter(c => c.owner === side);
    const lost = st.cities.filter(c => c.owner === enemy && c.orig === side);
    const enemyCities = st.cities.filter(c => c.owner === enemy);
    const nearestFront = (p) => { let b = null, bd = Infinity; for (const f of front) { const dd = d(p, f); if (dd < bd) { bd = dd; b = f; } } return b; };
    const behind = (f, k) => landNear(st, f.x - f.dx * k, f.y - f.dy * k);
    const S = st.sides[side];

    // --- purchases ---
    const minCost = Math.min(...scen.buy.map(t => U[t].cost));
    if (S.money >= minCost) {
      if (!mem.want) {
        const enemyAir = st.units.some(u => u.side === enemy && U[u.type].air) || st.sides[enemy].airMax > 2;
        const w = attacker
          ? { armor: 3, mech: 3, inf: 1.5, art: 1.5, recon: 1, heli: 1, uas: 1.2, mlrs: 1, ad: enemyAir ? 0.8 : 0.2 }
          : { inf: 3, mech: 2, armor: 2, art: 2, recon: 0.8, heli: 0.8, uas: 1, mlrs: 1, ad: enemyAir ? 1.2 : 0.2 };
        const opts = scen.buy.filter(t => w[t]);
        let tot = opts.reduce((a, t) => a + w[t], 0), r = Math.random() * tot;
        mem.want = opts.find(t => (r -= w[t]) < 0) || opts[0];
      }
      if (S.money >= U[mem.want].cost) {
        const cand = myCities.filter(c => Eng.canBuyAt(st, side, c));
        if (cand.length) {
          const score = c => { const f = nearestFront(c); const fd = f ? d(c, f) : 500; return Math.abs(fd - 160) - c.vp * 10 - (f ? f.threat * 4 : 0); };
          cand.sort((a, b) => score(a) - score(b));
          if (Eng.buy(st, side, mem.want, cand[0])) mem.want = null;
        }
      }
    }

    // --- air strikes ---
    if (S.air >= 1 && foes.length) {
      let best = null, bv = 0;
      for (const f of foes) {
        let v = 0;
        for (const g of foes) if (d(f, g) < 50) v += power(g);
        if (mine.some(m => d(m, f) < 40)) v *= 1.5;
        const nAD = st.units.filter(a => a.side === enemy && a.type === 'ad' && d(a, f) < U.ad.adRange).length;
        v /= 1 + nAD * 1.5;
        if (v > bv) { bv = v; best = f; }
      }
      if (best && bv > (easy ? 9 : 6)) Eng.airStrike(st, side, best.x, best.y);
    }

    // --- assign units ---
    const line = [], ranged = [], heli = [], support = [];
    for (const u of mine) {
      if (easy && Math.random() < 0.3) continue;
      const T = U[u.type];
      if (u.type === 'hq' || u.type === 'ad') support.push(u);
      else if (u.type === 'heli') heli.push(u);
      else if (T.ranged) ranged.push(u);
      else line.push(u);
    }
    const safeCity = (u) => {
      let b = null, bd = Infinity;
      for (const c of myCities) { if (!c.sup) continue; const threat = foes.some(f => d(f, c) < 80); const dd = d(u, c) + (threat ? 400 : 0); if (dd < bd) { bd = dd; b = c; } }
      return b;
    };

    // garrisons: capitals always, big cities when the enemy is near
    const guards = new Set();
    for (const c of myCities) {
      const near = foes.some(f => !U[f.type].air && d(f, c) < 320);
      if (!(c.cap || (c.vp >= 2 && near))) continue;
      let b = null, bd = Infinity;
      for (const u of line) if (!guards.has(u) && d(u, c) < bd && (u.type === 'inf' || bd > 200)) { bd = d(u, c); b = u; }
      if (b && (bd < 400 || c.cap)) { guards.add(b); if (bd > 15) setGoal(st, b, c.x, c.y); }
    }
    // emergencies: an undefended city with enemies close
    for (const c of myCities) {
      const danger = foes.filter(f => d(f, c) < 170 && !U[f.type].air);
      if (!danger.length || mine.some(m => !U[m.type].air && d(m, c) < 45)) continue;
      let b = null, bd = 260;
      for (const u of line) if (!guards.has(u) && !u.engaged && d(u, c) < bd) { bd = d(u, c); b = u; }
      if (b) { guards.add(b); setGoal(st, b, c.x, c.y); }
    }

    const objectives = attacker ? enemyCities : lost;
    const objCount = new Map();
    // defenders sort by front threat so the hottest sectors fill first
    const frontByThreat = front.slice().sort((a, b) => b.threat - a.threat);
    for (const u of line) {
      if (guards.has(u)) continue;
      // wounded units fall back to heal
      if (u.str < 30 && (u.engaged || u.str < 20)) { const c = safeCity(u); if (c) { setGoal(st, u, c.x, c.y); continue; } }
      if (u.engaged && u.str > 30) continue;
      if (u.retreating && u.str < 75) continue;
      u.retreating = u.str < 30;

      let goToObjective = attacker;
      if (!attacker) {
        // counter-attack when a sector is quiet and we are strong locally
        const f = nearestFront(u);
        const localMine = mine.filter(m => d(m, u) < 150).reduce((a, m) => a + power(m), 0);
        const localFoe = foes.filter(g => d(g, u) < 200).reduce((a, g) => a + power(g), 0);
        goToObjective = objectives.length && (localMine > localFoe * 2.2 + 8) && st.time > 60 && (!f || f.threat < 4);
      }
      if (goToObjective && objectives.length) {
        let best = null, bs = -Infinity;
        for (const c of objectives) {
          const s = (c.vp + 1) * 1000 / (d(u, c) + 250) - (objCount.get(c) || 0) * 1.1 + (c.cap ? 2 : 0);
          if (s > bs) { bs = s; best = c; }
        }
        objCount.set(best, (objCount.get(best) || 0) + 1);
        // attack in step: wait for neighbours if alone and far ahead
        setGoal(st, u, best.x, best.y);
        continue;
      }
      // hold the line
      let bestP = null, bs = -Infinity;
      for (const p of frontByThreat) {
        const s = p.threat * 3 - d(u, p) / 40 - p.claimed * (8 + p.threat);
        if (s > bs) { bs = s; bestP = p; }
      }
      if (bestP) { bestP.claimed++; const t = behind(bestP, 10); setGoal(st, u, t.x + (Math.random() - 0.5) * 6, t.y + (Math.random() - 0.5) * 6); }
      else if (objectives.length) { const c = objectives[0]; setGoal(st, u, c.x, c.y); }
    }

    // artillery & drones: stand off at range
    for (const u of ranged) {
      const R = U[u.type].range;
      let f = null, fd = Infinity;
      for (const g of foes) { const dd = d(u, g); if (dd < fd && !U[g.type].air) { fd = dd; f = g; } }
      if (f && fd < R * 0.95 && fd > 40) { if (u.path.length) { u.path = []; u.goal = null; } continue; }
      if (f && fd < 400) {
        const k = R * 0.75 / fd, t = landNear(st, f.x + (u.x - f.x) * k, f.y + (u.y - f.y) * k);
        setGoal(st, u, t.x, t.y);
      } else {
        const p = nearestFront(u); if (p) { const t = behind(p, U[u.type].air ? 20 : 55); setGoal(st, u, t.x, t.y); }
      }
    }

    // helicopters hunt weakened units away from air defence
    for (const u of heli) {
      if (u.str < 40) { const c = safeCity(u); if (c) setGoal(st, u, c.x, c.y); continue; }
      let best = null, bs = -Infinity;
      for (const f of foes) {
        if (U[f.type].air) continue;
        if (st.units.some(a => a.side === enemy && a.type === 'ad' && d(a, f) < U.ad.adRange)) continue;
        const s = (100 - f.str) - d(u, f) / 8;
        if (s > bs && d(u, f) < 450) { bs = s; best = f; }
      }
      if (best) setGoal(st, u, best.x, best.y);
      else { const p = nearestFront(u); if (p) { const t = behind(p, 60); setGoal(st, u, t.x, t.y); } }
    }

    // HQ and air defence sit behind the main mass
    const ground = line.length ? line : mine;
    const cx = ground.reduce((a, u) => a + u.x, 0) / ground.length, cy = ground.reduce((a, u) => a + u.y, 0) / ground.length;
    for (const u of support) {
      const p = nearestFront({ x: cx, y: cy }) || { x: cx, y: cy, dx: 0, dy: 0 };
      const back = u.type === 'hq' ? 110 : 60;
      const off = support.indexOf(u) * 30;
      const t = landNear(st, p.x - p.dx * back + off * p.dy, p.y - p.dy * back - off * p.dx);
      if (Math.hypot(t.x - cx, t.y - cy) > 400) { setGoal(st, u, cx, cy); continue; }
      setGoal(st, u, t.x, t.y);
    }
  }

  root.AI = { think, frontPoints };
})(typeof window !== 'undefined' ? window : globalThis);
