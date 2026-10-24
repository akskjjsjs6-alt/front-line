/* Tactical battles: when the player chooses to command a battle, the two armies are turned into
   NATO-symbol units on a generated battlefield and fought in real time with the battle engine. */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.UNITS, NS = root.NatoSymbols;
  const $ = id => document.getElementById(id);
  const TCOL = [[24, 46, 64], [98, 111, 72], [52, 78, 47], [122, 110, 76], [138, 128, 114], [66, 92, 82], [178, 156, 108], [96, 96, 100]];
  const COL = { me: [76, 157, 255], foe: [255, 90, 82] };
  const HELP_KEY = 'frontline-battle-help-v1';
  const DURATION = 300;

  let st = null, scen = null, speed = 0, lastSpeed = 1, done = null, battleInfo = null;
  let cam = { x: 0, y: 0, z: 1 }, sel = new Set(), inspect = null, mode = null, boxMode = false;
  let terrainCv = null, terrCv = null, terrVer = -1, fogCv = null, fogT = 0, frontPath = null;
  let effects = [], canvas, ctx, dpr = 1, sw = 0, sh = 0;
  let drag = null, hover = null, pointers = new Map(), keys = new Set();
  let last = 0, acc = 0, hudT = 0, panelT = 0, running = false, ended = false, start0 = null;
  const typeName = t => (scen && scen.names && scen.names[t]) || U[t].name;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const sideCol = s => (s === st.player ? COL.me : COL.foe);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ================================================================ battlefield generation
  function biomeAt(data, p) {
    const pr = data.provinces[p], lat = pr.y, lon = pr.x;
    if ((lat > 12 && lat < 35 && lon > -18 && lon < 62) || (lat > 15 && lat < 33 && lon > -117 && lon < -100) || (lat > -32 && lat < -18 && lon > 115 && lon < 145) || (lat > 36 && lat < 48 && lon > 52 && lon < 105)) return 'desert';
    if (Math.abs(lat) < 12 && ((lon > -82 && lon < -35) || (lon > 8 && lon < 32) || (lon > 95 && lon < 155))) return 'jungle';
    if (lat > 56) return 'taiga';
    if ((lat > 27 && lat < 40 && lon > 68 && lon < 100) || (lat > 43 && lat < 48 && lon > 5 && lon < 16)) return 'mountain';
    return 'temperate';
  }
  function makeScenario(data, g, b, playerNation) {
    const W = root.World, pr = data.provinces[b.p], biome = biomeAt(data, b.p);
    const seed = (b.p * 131 + g.turn * 7) % 997;
    const sideOf = list => [...new Set(list.map(a => a.n))];
    const attN = sideOf(b.attackers), defN = sideOf(b.defenders);
    const qualOf = list => { const d = list.reduce((s, a) => s + a.div, 0) || 1; return list.reduce((s, a) => { const n = g.nations[a.n]; return s + a.div * n.tech * (0.45 + a.org / 180) * (0.85 + n.mil / 330); }, 0) / d; };
    const air = list => {
      const n = g.nations[list[0].n];
      if (g.period === '1900') return [0, 0];
      if (g.period === '1939') return n.great ? [1 / 45, 2] : [0, 0];
      return n.tech >= 1.3 ? [1 / 18, 4] : n.tech >= 1 ? [1 / 40, 2] : [0, 0];
    };
    const [ar1, am1] = air(b.attackers), [ar2, am2] = air(b.defenders);
    const names = g.period === '1900' ? { recon: 'Cavalry', art: 'Field Artillery' } : g.period === '1939' ? { recon: 'Reconnaissance', ad: 'Anti-Aircraft' } : {};
    const T = { WATER: 0, CLEAR: 1, FOREST: 2, HILLS: 3, MOUNTAIN: 4, MARSH: 5, DESERT: 6 };
    const hasRiver = (seed % 3) !== 0;
    const scenario = {
      id: 'battle', year: g.year, title: `Battle of ${pr.n}`, startDate: `${g.year}-${String(g.month).padStart(2, '0')}-12T06:00`,
      hoursPerSec: 0.2, duration: DURATION, seed, attacker: 1, target: 1, names, buy: [],
      blurb: '', reinf: [],
      sides: {
        1: { name: attN.map(i => g.nations[i].name).join(' & '), long: '', qual: qualOf(b.attackers), airRate: ar1, airMax: am1, home: 'W' },
        2: { name: defN.map(i => g.nations[i].name).join(' & '), long: '', qual: qualOf(b.defenders), airRate: ar2, airMax: am2, home: 'E' }
      },
      owner: (u) => (u < 0.5 ? 1 : 2),
      terrain(u, v, N) {
        const n = N(u, v, 0.08, 1), m = N(u, v, 0.14, 2);
        if (biome === 'desert') return m > 0.78 ? T.HILLS : n > 0.8 ? T.CLEAR : T.DESERT;
        if (biome === 'jungle') return m > 0.72 ? T.MARSH : n > 0.38 ? T.FOREST : T.CLEAR;
        if (biome === 'taiga') return m > 0.7 ? T.MARSH : n > 0.45 ? T.FOREST : T.CLEAR;
        if (biome === 'mountain') return m > 0.72 ? T.MOUNTAIN : m > 0.5 ? T.HILLS : n > 0.6 ? T.FOREST : T.CLEAR;
        return m > 0.75 ? T.HILLS : n > 0.6 ? T.FOREST : T.CLEAR;
      },
      rivers: hasRiver ? [[[0.53, 0], [0.5, 0.3], [0.55, 0.6], [0.52, 1]]] : [],
      cities: [
        [pr.n, 0.68, 0.5, 1, 'cap'],
        ['Field HQ', 0.2, 0.5, 1, 'cap'],
        ['Village', 0.6, 0.22, 0], ['Village', 0.62, 0.8, 0], ['Farm', 0.38, 0.28, 0]
      ],
      units: []
    };
    const P = W.PERIODS[g.period].units;
    const build = (list, side) => {
      const D = list.reduce((s, a) => s + a.div, 0);
      const maxD = Math.max(b.attackers.reduce((s, a) => s + a.div, 0), b.defenders.reduce((s, a) => s + a.div, 0));
      const n = Math.max(2, Math.min(16, Math.round(D * 16 / maxD)));
      const per = D / n, ech = per >= 1.2 ? 'XX' : per >= 0.5 ? 'X' : per >= 0.2 ? 'III' : 'II';
      const tech = list.reduce((s, a) => s + a.div * g.nations[a.n].tech, 0) / (D || 1);
      // composition: better-equipped armies field more armour and support
      const w = Object.assign({}, P);
      if (w.armor) w.armor *= tech >= 1.2 ? 1.6 : tech < 0.8 ? 0.3 : 1;
      if (w.mech) w.mech *= tech >= 1.1 ? 1.4 : tech < 0.8 ? 0.4 : 1;
      if (w.uas) w.uas *= tech >= 1.2 ? 2 : 0;
      if (w.heli) w.heli *= tech >= 1.2 ? 1.5 : 0.3;
      const types = [];
      const tot = Object.values(w).reduce((a, b) => a + b, 0);
      const counts = Object.entries(w).map(([t, x]) => [t, x / tot * n]);
      for (const [t, x] of counts) for (let k = 0; k < Math.floor(x); k++) types.push(t);
      counts.sort((a, b) => (b[1] % 1) - (a[1] % 1));
      for (let k = 0; types.length < n; k++) types.push(counts[k % counts.length][0]);
      if (!types.some(t => t === 'inf' || t === 'mech' || t === 'armor')) types[0] = 'inf';
      if (n >= 6 && g.period !== '1900') types[types.length - 1] = 'hq';
      const front = types.filter(t => ['inf', 'mech', 'armor', 'recon'].includes(t)), back = types.filter(t => !['inf', 'mech', 'armor', 'recon'].includes(t));
      const nat = g.nations[list[0].n].name, short = nat.length > 12 ? nat.split(' ')[0] : nat;
      const uFront = side === 1 ? 0.36 : 0.6, uBack = side === 1 ? 0.25 : 0.73;
      const entrench = side === 2 && list.every(a => !a.moved);
      const cnt = {};
      front.forEach((t, k) => { cnt[t] = (cnt[t] || 0) + 1; scenario.units.push([side, t, ech, `${short} ${ordinal(cnt[t])} ${typeName2(t, names)}`, uFront + ((k % 2) ? 0.04 : 0) * (side === 1 ? -1 : 1), 0.16 + 0.68 * (front.length === 1 ? 0.5 : k / (front.length - 1)), entrench ? 1 : 0]); });
      back.forEach((t, k) => { cnt[t] = (cnt[t] || 0) + 1; scenario.units.push([side, t, t === 'hq' ? 'XX' : ech, `${short} ${t === 'hq' ? 'HQ' : ordinal(cnt[t]) + ' ' + typeName2(t, names)}`, uBack, 0.25 + 0.5 * (back.length === 1 ? 0.5 : k / (back.length - 1)), 0]); });
    };
    build(b.attackers, 1); build(b.defenders, 2);
    const playerSide = attN.some(n => n === playerNation || (W.allied(g, n, playerNation) && !W.atWar(g, n, playerNation))) ? 1 : 2;
    return { scenario, playerSide, biome, attN, defN };
  }
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function typeName2(t, names) { return { inf: 'Inf', mech: 'Mech', armor: 'Armd', recon: names.recon === 'Cavalry' ? 'Cav' : 'Recon', art: 'Arty', mlrs: 'Rocket', ad: 'AA', heli: 'Avn', uas: 'UAS', hq: 'HQ' }[t]; }

  // ================================================================ entry point
  function fight({ data, g, battle, playerNation }) {
    return new Promise(resolve => {
      const made = makeScenario(data, g, battle, playerNation);
      scen = made.scenario;
      root.SCENARIOS = [scen];
      st = E.createGame(scen, made.playerSide, 'normal');
      st.log = []; st.fx = [];
      battleInfo = { data, g, battle, made };
      start0 = { 1: power(1), 2: power(2) };
      done = resolve; ended = false;
      enter();
      const verb = made.playerSide === 1 ? 'Attack' : 'Defend';
      toast(`${verb}! Paused: look at the field, give orders, then press ▶.`, 'info', 6000);
      if (!localStorage.getItem(HELP_KEY)) { try { localStorage.setItem(HELP_KEY, '1'); } catch (e) { /* storage unavailable */ } showControls(); }
    });
  }
  function power(side) { return st.units.reduce((s, u) => s + (u.side === side ? Math.max(0, u.str) * E.ECH[u.ech] : 0), 0); }

  function enter() {
    for (const s of ['start', 'pick', 'game']) $(s).hidden = true;
    $('battle').hidden = false; $('overlay').hidden = true;
    canvas = $('b-map'); ctx = canvas.getContext('2d');
    if (!canvas.bound) bindInput();
    sel.clear(); inspect = null; setMode(null); effects = []; terrVer = -1; acc = 0; fogCv = null; terrCv = null;
    setSpeed(0);
    buildTerrain(); resize(); fitCamera();
    const { made } = battleInfo;
    $('b-title').textContent = scen.title;
    $('b-sub').textContent = `${st.sides[1].name} attacks ${st.sides[2].name} · ${made.biome} terrain · you ${made.playerSide === 1 ? 'attack' : 'defend'}`;
    $('b-air').hidden = st.sides[st.player].airMax <= 0;
    updateHud(); updatePanel();
    if (!running) { running = true; requestAnimationFrame(frame); }
  }

  function finish(winner, reason) {
    if (ended) return; ended = true; setSpeed(0);
    const { g, battle } = battleInfo;
    const lossFrac = s => Math.max(0.02, Math.min(0.95, (start0[s] - power(s)) / start0[s] * 0.85));
    const attackerWins = winner === 1;
    const lossA = lossFrac(1), lossD = lossFrac(2);
    const res = root.World.finishBattle(g, battle, attackerWins, lossA, lossD, 'fought');
    const win = winner === st.player;
    sheet(`<div class="kicker">${esc(scen.title)}</div><h2 style="font-size:46px;color:${win ? 'var(--blue)' : 'var(--red)'}">${win ? 'Victory' : 'Defeat'}</h2>
      <p>${esc(reason)}</p>
      <p>Losses: ${esc(st.sides[1].name)} ${res.lostA} divisions · ${esc(st.sides[2].name)} ${res.lostD} divisions.</p>
      <div class="acts"><button class="btn primary" id="bt-back">Return to the world map</button></div>`);
    $('bt-back').onclick = () => { $('overlay').hidden = true; $('battle').hidden = true; running = false; const r = done; done = null; st = null; r(res); };
  }

  // ================================================================ terrain art
  function h2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function buildTerrain() {
    const TS = (innerWidth > 1100 || devicePixelRatio > 1.5) ? 2 : 1.4;
    const w = Math.round(E.W * TS), h = Math.round(E.H * TS);
    terrainCv = document.createElement('canvas'); terrainCv.width = w; terrainCv.height = h;
    const c = terrainCv.getContext('2d'), img = c.createImageData(w, h), d = img.data, G = E.GW;
    const NJ = 64, jx = new Float32Array(NJ * NJ), jy = new Float32Array(NJ * NJ);
    for (let i = 0; i < NJ * NJ; i++) { jx[i] = h2(i, 7) - 0.5; jy[i] = h2(i, 13) - 0.5; }
    const wob = (f, x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, a = ((y0 & 63) * NJ), b = (((y0 + 1) & 63) * NJ);
      return (f[a + (x0 & 63)] * (1 - fx) + f[a + ((x0 + 1) & 63)] * fx) * (1 - fy) + (f[b + (x0 & 63)] * (1 - fx) + f[b + ((x0 + 1) & 63)] * fx) * fy;
    };
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const ox = px / TS, oy = py / TS, q = 1 / 7;
      const wx = Math.max(0, Math.min(E.W - 1, ox + wob(jx, ox * q, oy * q) * 9 + wob(jx, ox * q * 3.1, oy * q * 3.1) * 3));
      const wy = Math.max(0, Math.min(E.H - 1, oy + wob(jy, ox * q, oy * q) * 9 + wob(jy, ox * q * 3.1, oy * q * 3.1) * 3));
      const gx = Math.min(G - 1, (wx / E.CELL) | 0), gy = Math.min(E.GH - 1, (wy / E.CELL) | 0), ci = gy * G + gx;
      const t = st.terrain[ci], col = TCOL[t];
      const k = 1 + (h2(px >> 1, py >> 1) - 0.5) * 0.08 + (h2(gx >> 3, gy >> 3) - 0.5) * 0.08;
      const o = (py * w + px) * 4;
      d[o] = col[0] * k; d[o + 1] = col[1] * k; d[o + 2] = col[2] * k; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.setTransform(TS, 0, 0, TS, 0, 0);
    for (let gy = 0; gy < E.GH; gy += 2) for (let gx = 0; gx < E.GW; gx += 2) {
      const t = st.terrain[gy * G + gx], r = h2(gx, gy), x = gx * E.CELL + r * 6, y = gy * E.CELL + h2(gy, gx) * 6;
      if (t === 2 && r < 0.75) { c.fillStyle = r < 0.35 ? '#24391f' : '#2c4527'; c.beginPath(); c.arc(x, y, 2.2 + r * 1.4, 0, 7); c.fill(); }
      else if (t === 3 && r < 0.35) { c.strokeStyle = 'rgba(60,48,26,.55)'; c.lineWidth = 1.1; c.beginPath(); c.arc(x, y + 3, 4, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
      else if (t === 4 && r < 0.4) {
        c.fillStyle = 'rgba(70,62,54,.8)'; c.beginPath(); c.moveTo(x - 5, y + 4); c.lineTo(x, y - 5); c.lineTo(x + 5, y + 4); c.fill();
        c.fillStyle = 'rgba(220,215,205,.55)'; c.beginPath(); c.moveTo(x - 1.6, y - 2); c.lineTo(x, y - 5); c.lineTo(x + 1.6, y - 2); c.fill();
      } else if (t === 5 && r < 0.45) { c.strokeStyle = 'rgba(120,170,170,.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.moveTo(x - 1.5, y + 2.5); c.lineTo(x + 1.5, y + 2.5); c.stroke(); }
      else if (t === 6 && r < 0.12) { c.fillStyle = 'rgba(140,115,70,.5)'; c.fillRect(x, y, 1.4, 1.4); }
    }
    for (const ci of st.cities) {
      for (let k = 0; k < 7 + ci.vp * 6; k++) {
        const a = h2(k, ci.x | 0) * 6.28, rr = h2(ci.y | 0, k) * 12;
        c.fillStyle = k % 3 ? 'rgba(170,170,175,.55)' : 'rgba(60,60,64,.7)';
        c.fillRect(ci.x + Math.cos(a) * rr - 1.5, ci.y + Math.sin(a) * rr - 1.5, 3, 3);
      }
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of st.rivers) {
      c.strokeStyle = '#2f6286'; c.lineWidth = 3.4; c.beginPath(); r.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      c.strokeStyle = '#4e93bf'; c.lineWidth = 1.6; c.stroke();
    }
  }
  function buildTerritory() {
    if (!terrCv) { terrCv = document.createElement('canvas'); terrCv.width = E.GW; terrCv.height = E.GH; }
    const c = terrCv.getContext('2d'), img = c.createImageData(E.GW, E.GH), d = img.data, G = E.GW, o = st.owner;
    for (let i = 0; i < G * E.GH; i++) {
      const s = o[i]; if (!s) continue;
      const col = s === st.player ? COL.me : COL.foe, k = i * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 44;
    }
    c.putImageData(img, 0, 0);
    frontPath = buildFrontPath();
    terrVer = st.territoryVersion;
  }
  function buildFrontPath() {
    const path = new Path2D(), G = E.GW, o = st.owner, C = E.CELL, me = st.player;
    for (let y = 0; y < E.GH - 1; y++) for (let x = 0; x < G - 1; x++) {
      const i = y * G + x, A = o[i], B = o[i + 1], Cc = o[i + G + 1], D = o[i + G];
      if (!A || !B || !Cc || !D) continue;
      const k = (A === me ? 8 : 0) | (B === me ? 4 : 0) | (Cc === me ? 2 : 0) | (D === me ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const x0 = x * C + C / 2, y0 = y * C + C / 2, h = C / 2;
      const T = [x0 + h, y0], R = [x0 + C, y0 + h], Bm = [x0 + h, y0 + C], L = [x0, y0 + h];
      const seg = (p, q) => { path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]); };
      switch (k) {
        case 1: case 14: seg(L, Bm); break; case 2: case 13: seg(Bm, R); break; case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(T, R); break; case 6: case 9: seg(T, Bm); break; case 7: case 8: seg(L, T); break;
        case 5: seg(L, T); seg(Bm, R); break; case 10: seg(T, R); seg(L, Bm); break;
      }
    }
    return path;
  }
  function buildFog() {
    const sc = 0.25;
    if (!fogCv) { fogCv = document.createElement('canvas'); fogCv.width = E.W * sc; fogCv.height = E.H * sc; }
    const c = fogCv.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, fogCv.width, fogCv.height);
    c.fillStyle = 'rgba(4,7,10,0.42)'; c.fillRect(0, 0, fogCv.width, fogCv.height);
    c.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => {
      const gr = c.createRadialGradient(x * sc, y * sc, r * sc * 0.6, x * sc, y * sc, r * sc);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x * sc, y * sc, r * sc, 0, 7); c.fill();
    };
    for (const u of st.units) if (u.side === st.player) hole(u.x, u.y, U[u.type].sight);
    for (const ci of st.cities) if (ci.owner === st.player) hole(ci.x, ci.y, 70);
    c.globalCompositeOperation = 'source-over';
  }

  // ================================================================ camera
  function resize() {
    const r = $('b-stage').getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1); sw = r.width; sh = r.height;
    canvas.width = Math.round(sw * dpr); canvas.height = Math.round(sh * dpr);
  }
  function fitZ() { return Math.min(sw / E.W, (sh - 60) / E.H); }
  function fitCamera() {
    let z = fitZ(), cx = E.W / 2, cy = E.H / 2;
    if (sw < sh) {
      const mine = st.units.filter(u => u.side === st.player);
      z = Math.max(z, (sh - 40) / E.H);
      cx = mine.reduce((a, u) => a + u.x, 0) / mine.length; cy = mine.reduce((a, u) => a + u.y, 0) / mine.length;
    }
    cam.z = z; cam.x = cx - sw / z / 2; cam.y = cy - (sh - 50) / z / 2;
    clampCam();
  }
  function clampCam() {
    const zmin = fitZ() * 0.85; cam.z = Math.max(zmin, Math.min(8, cam.z));
    const vw = sw / cam.z, vh = sh / cam.z, m = 120;
    cam.x = vw > E.W + m * 2 ? (E.W - vw) / 2 : Math.max(-m, Math.min(E.W + m - vw, cam.x));
    cam.y = vh > E.H + m * 2 ? (E.H - vh) / 2 : Math.max(-m, Math.min(E.H + m - vh, cam.y));
  }
  const toS = (x, y) => [(x - cam.x) * cam.z, (y - cam.y) * cam.z];
  const toW = (x, y) => ({ x: x / cam.z + cam.x, y: y / cam.z + cam.y });
  function zoomAt(sx, sy, f) { const w = toW(sx, sy); cam.z *= f; clampCam(); cam.x = w.x - sx / cam.z; cam.y = w.y - sy / cam.z; clampCam(); }
  const symSize = () => Math.max(11, Math.min(24, 8.5 * cam.z));

  // ================================================================ draw
  function seenByMe(u) { return u.side === st.player || st.vis[st.player].has(u.id); }
  function pointSeen(x, y) { for (const u of st.units) if (u.side === st.player && (u.x - x) ** 2 + (u.y - y) ** 2 < U[u.type].sight ** 2) return true; return false; }
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, sw, sh);
    if (!st) return;
    if (terrVer !== st.territoryVersion) buildTerritory();
    ctx.save();
    ctx.translate(-cam.x * cam.z, -cam.y * cam.z); ctx.scale(cam.z, cam.z);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(terrainCv, 0, 0, E.W, E.H);
    ctx.drawImage(terrCv, 0, 0, E.W, E.H);
    if (fogCv) ctx.drawImage(fogCv, 0, 0, E.W, E.H);
    if (frontPath) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4.5 / cam.z; ctx.stroke(frontPath);
      ctx.strokeStyle = '#ff6b5f'; ctx.lineWidth = 2.6 / cam.z; ctx.stroke(frontPath);
      ctx.strokeStyle = '#ffe9c2'; ctx.lineWidth = 1 / cam.z; ctx.stroke(frontPath);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1 / cam.z; ctx.strokeRect(0, 0, E.W, E.H);
    ctx.restore();
    const s = symSize(), t = now / 1000;
    if (mode && mode.air && hover) {
      ctx.strokeStyle = 'rgba(242,201,76,.9)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hover.x, hover.y, 55 * cam.z, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const ci of st.cities) {
      const [x, y] = toS(ci.x, ci.y), col = sideCol(ci.owner), r = ci.cap ? 7 : 4;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(col, 1);
      if (ci.cap) star(ctx, x, y, r + 1.5, r * 0.45); else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      if (ci.cap || cam.z > fitZ() * 1.4) {
        ctx.font = `600 ${ci.cap ? 13 : 11}px "Barlow Condensed", sans-serif`;
        const label = ci.name.toUpperCase() + (ci.cap ? (ci.orig === st.player ? ' (hold it)' : ' (objective)') : '');
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(label, x, y + r + 4);
        ctx.fillStyle = ci.owner === st.player ? '#dcebff' : '#ffd9d6'; ctx.fillText(label, x, y + r + 4);
      }
    }
    ctx.lineWidth = 1.6;
    for (const u of st.units) {
      if (!sel.has(u.id) || !u.path.length) continue;
      ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(...toS(u.x, u.y)); for (const p of u.path) ctx.lineTo(...toS(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    drawEffects(now, false);
    const vis = st.units.filter(seenByMe).sort((a, b) => (U[a.type].air ? 1 : 0) - (U[b.type].air ? 1 : 0) || a.y - b.y);
    for (const u of vis) {
      const [x, y] = toS(u.x, u.y);
      if (x < -40 || y < -40 || x > sw + 40 || y > sh + 40) continue;
      const friendly = u.side === st.player, air = U[u.type].air;
      if (air) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 4, y + s * 0.9, s * 0.7, s * 0.22, 0, 0, 7); ctx.fill(); }
      if (u.engaged) { ctx.strokeStyle = `rgba(255,120,60,${0.35 + 0.35 * Math.sin(t * 8 + u.id)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, s * 1.15, 0, 7); ctx.stroke(); }
      const yy = air ? y - s * 0.35 : y;
      NS.drawUnit(ctx, x, yy, s, u.type, { friendly, ech: u.ech, str: u.str, selected: sel.has(u.id) || (inspect && inspect.unit === u) });
      if (cam.z > 2.6) {
        ctx.font = '500 11px "Barlow Condensed", sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(u.name, x, yy + s * 0.85 + 6);
        ctx.fillStyle = '#e8eef3'; ctx.fillText(u.name, x, yy + s * 0.85 + 6);
      }
    }
    drawEffects(now, true);
    if (drag && drag.kind === 'line' && drag.pts.length > 1) {
      ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); drag.pts.forEach((p, i) => { const [x, y] = toS(p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      const n = selectedUnits().length;
      if (n > 1) for (const p of resampleLine(drag.pts, n)) { const [x, y] = toS(p.x, p.y); ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    }
    if (drag && drag.kind === 'box') {
      const x = Math.min(drag.start.x, drag.cur.x), y = Math.min(drag.start.y, drag.cur.y), w = Math.abs(drag.cur.x - drag.start.x), h = Math.abs(drag.cur.y - drag.start.y);
      ctx.fillStyle = 'rgba(76,157,255,.12)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#4c9dff'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    }
  }
  function star(c, x, y, R, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }
  function resampleLine(line, n) {
    const segs = []; let total = 0;
    for (let i = 1; i < line.length; i++) { const d = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y); segs.push(d); total += d; }
    const out = [];
    for (let k = 0; k < n; k++) {
      let target = total * (n === 1 ? 0.5 : (k + 0.5) / n), i = 0;
      while (i < segs.length - 1 && target > segs[i]) { target -= segs[i]; i++; }
      const f = segs[i] ? target / segs[i] : 0, a = line[i], b = line[i + 1] || a;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
    return out;
  }

  // ================================================================ effects
  function pullFx(now) {
    for (const f of st.fx) {
      if (f.kind === 'msg') { if (/destroyed|captured|shot down/.test(f.text)) toast(f.text, (/destroyed|shot down/.test(f.text) ? f.side !== st.player : f.side === st.player) ? 'good' : 'bad'); continue; }
      if (f.kind === 'note') { toast(f.text, 'info'); continue; }
      if (f.kind === 'shot' && !(f.side === st.player || pointSeen(f.x0, f.y0) || pointSeen(f.x1, f.y1))) continue;
      if (f.kind === 'boom' && !f.big && !pointSeen(f.x, f.y)) continue;
      f.t0 = now; effects.push(f);
    }
    st.fx.length = 0;
    if (effects.length > 400) effects.splice(0, effects.length - 400);
  }
  function drawEffects(now, top) {
    effects = effects.filter(f => now - f.t0 < (f.kind === 'jet' ? 1600 : f.kind === 'capture' ? 1400 : f.kind === 'boom' ? (f.big ? 1100 : 700) : f.kind === 'ping' ? 600 : f.ranged ? 900 : 200));
    for (const f of effects) {
      const age = (now - f.t0) / 1000;
      if (!top && f.kind === 'shot' && !f.ranged) {
        const [x0, y0] = toS(f.x0, f.y0), [x1, y1] = toS(f.x1, f.y1);
        ctx.strokeStyle = f.ad ? 'rgba(160,230,255,.9)' : `rgba(255,220,120,${1 - age * 5})`; ctx.lineWidth = 1.4;
        const k = 0.3 + Math.random() * 0.6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); ctx.stroke();
        ctx.fillStyle = 'rgba(255,200,90,.8)'; ctx.beginPath(); ctx.arc(x1 + (Math.random() - .5) * 8, y1 + (Math.random() - .5) * 8, 1.8, 0, 7); ctx.fill();
      } else if (top && f.kind === 'shot' && f.ranged) {
        const k = Math.min(1, age / 0.6), [x0, y0] = toS(f.x0, f.y0), [x1, y1] = toS(f.x1, f.y1), lift = Math.hypot(x1 - x0, y1 - y0) * 0.35;
        if (k < 1) { const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * lift; ctx.fillStyle = '#ffe6a0'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }
        else { const a = (age - 0.6) / 0.3; ctx.fillStyle = `rgba(255,150,60,${0.8 * (1 - a)})`; ctx.beginPath(); ctx.arc(x1, y1, 4 + a * 8, 0, 7); ctx.fill(); }
      } else if (top && f.kind === 'boom') {
        const dur = f.big ? 1.1 : 0.7, a = age / dur, [x, y] = toS(f.x, f.y), R = (f.big ? 55 : 14) * cam.z;
        ctx.fillStyle = `rgba(255,${140 + 80 * (1 - a)},60,${0.55 * (1 - a)})`; ctx.beginPath(); ctx.arc(x, y, R * (0.4 + a * 0.8), 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,230,180,${1 - a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R * (0.3 + a), 0, 7); ctx.stroke();
      } else if (top && f.kind === 'jet') {
        const k = Math.min(1, age / 1.5), home = st.sides[f.side].home;
        const sx = home === 'W' ? -50 : E.W + 50, sy = f.y;
        const wx = sx + (f.x - sx) * k, wy = sy + (f.y - sy) * k, [x, y] = toS(wx, wy), ang = Math.atan2(f.y - sy, f.x - sx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = f.side === st.player ? '#cfe4ff' : '#ffd0cc';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-40, 0); ctx.stroke();
        ctx.restore();
      } else if (top && f.kind === 'capture') {
        const a = age / 1.4, [x, y] = toS(f.x, f.y);
        ctx.strokeStyle = rgba(sideCol(f.side), 1 - a); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8 + a * 40, 0, 7); ctx.stroke();
      } else if (top && f.kind === 'ping') {
        const a = age / 0.6, [x, y] = toS(f.x, f.y);
        ctx.strokeStyle = `rgba(255,255,255,${1 - a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4 + a * 14, 0, 7); ctx.stroke();
      }
    }
  }
  function toast(text, kind, ms) {
    const box = $('b-toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = text; box.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 500); }, ms || 3500);
  }

  // ================================================================ hud + panel
  function updateHud() {
    const me = st.player, foe = 3 - me;
    const pm = Math.round(power(me) / start0[me] * 100), pf = Math.round(power(foe) / start0[foe] * 100);
    $('b-str').innerHTML = `<span style="color:#8cc4ff">${pm}%</span> vs <span style="color:#ff9a94">${pf}%</span>`;
    const left = Math.max(0, st.duration - st.time);
    $('b-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    $('b-air').disabled = st.sides[me].air < 1;
    $('b-air').querySelector('span:last-child').textContent = `Air strike (${Math.floor(st.sides[me].air)})`;
  }
  function selectedUnits() { return st.units.filter(u => sel.has(u.id)); }
  function symbolCanvas(type, friendly, ech, size) {
    const cv = document.createElement('canvas'), s = size || 20, w = Math.ceil(s * 2.1), h = Math.ceil(s * 1.9);
    cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const c = cv.getContext('2d'); c.scale(2, 2); NS.drawUnit(c, w / 2, h / 2 + s * 0.18, s, type, { friendly, ech });
    return cv;
  }
  function strBar(v) { const c = v > 60 ? 'var(--green)' : v > 30 ? 'var(--gold)' : 'var(--red)'; return `<div class="strbar"><i style="width:${Math.max(0, v)}%;background:${c}"></i></div>`; }
  function updatePanel() {
    const p = $('b-panel');
    for (const id of [...sel]) if (!st.units.some(u => u.id === id)) sel.delete(id);
    if (inspect && inspect.unit && (!st.units.includes(inspect.unit) || !seenByMe(inspect.unit))) inspect = null;
    const units = selectedUnits();
    if (!units.length && !inspect) { p.hidden = true; return; }
    p.hidden = false;
    if (units.length === 1 || (inspect && inspect.unit)) {
      const u = units[0] || inspect.unit, T = U[u.type], mine = u.side === st.player;
      const tags = [];
      if (u.engaged) tags.push('<span class="tag war">in combat</span>');
      if (u.ent > 0.5) tags.push('<span class="tag ally">dug in</span>');
      if (u.hq) tags.push('<span class="tag ally">HQ bonus</span>');
      p.innerHTML = `<button class="x" aria-label="Close">×</button><div style="display:flex;gap:10px;align-items:center"><div id="bp-sym"></div><div><h3 style="font-size:19px">${esc(u.name)}</h3><div class="meta" style="margin:0">${mine ? '' : esc(st.sides[u.side].name) + ' · '}${esc(typeName(u.type))}</div></div></div>
        ${strBar(u.str)}<div style="display:flex;gap:4px;flex-wrap:wrap">${tags.join('')}</div>
        <p class="meta">${esc(T.about)}</p>
        ${mine ? '<div class="acts"><button class="btn small" data-act="stop">Stop</button><button class="btn small" data-act="clear">Deselect</button></div>' : ''}`;
      $('bp-sym').appendChild(symbolCanvas(u.type, mine, u.ech, 22));
    } else {
      const avg = units.reduce((a, u) => a + u.str, 0) / units.length;
      p.innerHTML = `<button class="x" aria-label="Close">×</button><h3 style="font-size:19px">${units.length} units selected</h3>${strBar(avg)}
        <p class="meta">Tap the map to move them together. Drag a line from one of them to spread them along a front.</p>
        <div class="acts"><button class="btn small" data-act="stop">Stop</button><button class="btn small" data-act="clear">Deselect</button></div>`;
    }
    p.querySelector('.x').onclick = () => { sel.clear(); inspect = null; updatePanel(); };
    p.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { if (b.dataset.act === 'stop') for (const u of selectedUnits()) { u.path = []; u.goal = null; } else { sel.clear(); inspect = null; } updatePanel(); });
  }
  function setMode(m) {
    mode = m;
    $('b-air').classList.toggle('on', !!(m && m.air));
    const hint = $('b-hint');
    if (!m) { hint.hidden = true; return; }
    hint.hidden = false;
    hint.innerHTML = 'Tap the map to bomb that spot. Enemy air defense nearby weakens the strike. <button>Cancel</button>';
    hint.querySelector('button').onclick = () => setMode(null);
  }
  function setSpeed(s) {
    if (s > 0) lastSpeed = s;
    speed = s;
    document.querySelectorAll('#b-hud .speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  }

  // ================================================================ input
  function unitAt(p, which) {
    const s = symSize(); let best = null, bd = (s * 1.05) ** 2;
    for (const u of st.units) {
      if (!seenByMe(u)) continue;
      if (which === 'own' && u.side !== st.player) continue;
      if (which === 'foe' && u.side === st.player) continue;
      const [x, y] = toS(u.x, u.y), yy = U[u.type].air ? y - s * 0.35 : y, d = (x - p.x) ** 2 + (yy - p.y) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  const evPt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function bindInput() {
    canvas.bound = true;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); drag = null; });
    canvas.addEventListener('pointerleave', () => { $('b-tip').hidden = true; hover = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); const p = evPt(e); zoomAt(p.x, p.y, Math.pow(1.0015, -e.deltaY)); }, { passive: false });
    addEventListener('keydown', onKey); addEventListener('keyup', onKey);
    addEventListener('resize', () => { if (st && !$('battle').hidden) { resize(); clampCam(); } });
    document.querySelectorAll('#b-hud .speed button').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
    $('b-air').onclick = () => setMode(mode && mode.air ? null : { air: true });
    $('b-all').onclick = selectAll;
    $('b-box').onclick = () => { boxMode = !boxMode; $('b-box').classList.toggle('on', boxMode); if (boxMode) toast('Drag on the map to draw a selection box.', 'info', 2500); };
    $('b-help').onclick = showControls;
    $('b-retreat').onclick = confirmRetreat;
  }
  function onDown(e) {
    if (!st || ended) return;
    canvas.setPointerCapture(e.pointerId);
    const p = evPt(e); pointers.set(e.pointerId, p); $('b-tip').hidden = true;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.z, mid: toW((a.x + b.x) / 2, (a.y + b.y) / 2) }; return; }
    if (pointers.size > 2) return;
    const w = toW(p.x, p.y);
    if (e.button === 1 || keys.has(' ')) { drag = { kind: 'pan', start: p, cam0: { ...cam } }; return; }
    if (e.button === 2) { drag = { kind: 'line', start: p, pts: [w], right: true, moved: false }; return; }
    if (mode) { drag = { kind: 'maybe-pan', start: p, cam0: { ...cam }, tapMode: true }; return; }
    const own = unitAt(p, 'own');
    if (own && sel.has(own.id)) { drag = { kind: 'maybe-line', start: p, pts: [{ x: own.x, y: own.y }] }; return; }
    if (!own && (boxMode || e.shiftKey)) { drag = { kind: 'box', start: p, cur: p }; return; }
    drag = { kind: 'maybe-pan', start: p, cam0: { ...cam } };
  }
  function onMove(e) {
    if (!st) return;
    const p = evPt(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    hover = p;
    if (!drag) { if (e.pointerType === 'mouse') showTip(p); return; }
    const moved = drag.start && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 7;
    if (drag.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.z = drag.z0 * d / drag.d0; clampCam(); cam.x = drag.mid.x - (a.x + b.x) / 2 / cam.z; cam.y = drag.mid.y - (a.y + b.y) / 2 / cam.z; clampCam(); return;
    }
    if (drag.kind === 'maybe-line' && moved) drag.kind = 'line';
    if (drag.kind === 'maybe-pan' && moved) drag.kind = 'pan';
    if (drag.kind === 'pan') { cam.x = drag.cam0.x - (p.x - drag.start.x) / cam.z; cam.y = drag.cam0.y - (p.y - drag.start.y) / cam.z; clampCam(); }
    else if (drag.kind === 'line') { if (moved) drag.moved = true; const w = toW(p.x, p.y), l = drag.pts[drag.pts.length - 1]; if (Math.hypot(w.x - l.x, w.y - l.y) > 10 / cam.z) drag.pts.push(w); }
    else if (drag.kind === 'box') drag.cur = p;
  }
  function onUp(e) {
    if (!st) return;
    const p = evPt(e); pointers.delete(e.pointerId);
    if (!drag) return;
    const d = drag;
    if (d.kind === 'pinch') { if (pointers.size === 0) drag = null; return; }
    drag = null;
    if (d.kind === 'maybe-pan' && d.tapMode) return tapMode(p);
    if (d.kind === 'maybe-pan' || d.kind === 'maybe-line') return tap(p, e);
    if (d.kind === 'line') { if (!d.moved && d.right) return moveOrder(toW(p.x, p.y), unitAt(p, 'foe')); return lineOrder(d.pts); }
    if (d.kind === 'box') {
      const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
      if (!e.shiftKey) sel.clear();
      for (const u of st.units) { if (u.side !== st.player) continue; const [x, y] = toS(u.x, u.y); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) sel.add(u.id); }
      inspect = null; if (boxMode) { boxMode = false; $('b-box').classList.remove('on'); }
      updatePanel();
    }
  }
  function tap(p, e) {
    const own = unitAt(p, 'own'), foe = unitAt(p, 'foe');
    if (own) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { sel.has(own.id) ? sel.delete(own.id) : sel.add(own.id); }
      else if (sel.size === 1 && sel.has(own.id)) sel.clear();
      else { sel.clear(); sel.add(own.id); }
      inspect = null; updatePanel(); return;
    }
    if (sel.size) return moveOrder(toW(p.x, p.y), foe);
    inspect = foe ? { unit: foe } : null; updatePanel();
  }
  function tapMode(p) {
    const w = toW(p.x, p.y);
    if (E.airStrike(st, st.player, w.x, w.y)) { toast('Aircraft inbound…', 'info', 2000); setMode(null); }
    else toast('No aircraft ready yet. They recharge over time.', 'bad');
  }
  function moveOrder(w, foe) {
    const units = selectedUnits(); if (!units.length) return;
    E.orderGroup(st, units, foe ? foe.x : w.x, foe ? foe.y : w.y);
    effects.push({ kind: 'ping', x: w.x, y: w.y, t0: performance.now() });
  }
  function lineOrder(pts) {
    const units = selectedUnits(); if (!units.length || pts.length < 2) return;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len < 15) return moveOrder(pts[pts.length - 1]);
    if (units.length === 1) E.orderPath(st, units[0], pts);
    else { E.orderLine(st, units, pts); toast(`Front line drawn: ${units.length} units spreading out along it.`, 'good', 2200); }
  }
  function showTip(p) {
    const tip = $('b-tip'), u = unitAt(p);
    if (!u) { tip.hidden = true; return; }
    tip.innerHTML = `<b>${esc(u.name)}</b><br><span class="dim">${u.side === st.player ? '' : esc(st.sides[u.side].name) + ' · '}${esc(typeName(u.type))}</span><br>Strength ${Math.max(0, Math.round(u.str))}%${u.engaged ? ' · <span style="color:#ff9f6a">fighting</span>' : ''}${u.ent > 0.5 ? ' · dug in' : ''}`;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(sw - r.width - 8, p.x + 14) + 'px'; tip.style.top = Math.min(sh - r.height - 8, p.y + 14) + 'px';
  }
  function selectAll() {
    sel.clear(); inspect = null;
    for (const u of st.units) if (u.side === st.player && u.type !== 'hq' && !U[u.type].ranged && !U[u.type].air) sel.add(u.id);
    updatePanel(); toast(`${sel.size} front-line units selected. Drag a line from one of them to form a front.`, 'info', 3000);
  }
  function onKey(e) {
    if (!st || $('battle').hidden) return;
    const k = e.key.toLowerCase();
    if (e.type === 'keyup') { keys.delete(k); return; }
    if (!$('overlay').hidden) return;
    keys.add(k);
    if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : lastSpeed); }
    else if (k === '1') setSpeed(1); else if (k === '2') setSpeed(2); else if (k === '3') setSpeed(4);
    else if (k === 'a') selectAll();
    else if (k === 'escape') { if (mode) setMode(null); else { sel.clear(); inspect = null; updatePanel(); } }
  }

  // ================================================================ sheets
  function sheet(html) { const s = $('sheet'); s.className = 'sheet'; s.innerHTML = html; $('overlay').hidden = false; }
  function showControls() {
    const was = speed; setSpeed(0);
    sheet(`<h2>Commanding a battle</h2>
      <p>You control every unit yourself. Your units are <b style="color:#80e0ff">blue rectangles</b>, the enemy's are <b style="color:#ff8080">red diamonds</b>.</p>
      <ul>
        <li><b>Tap</b> a unit to select it, then tap the map to send it there.</li>
        <li><b>Select many:</b> Select all (<kbd>A</kbd>), Box select, or hold <kbd>Shift</kbd> and drag.</li>
        <li><b>Draw a front line:</b> with several selected, drag a line starting from one of them. They spread out along it.</li>
        <li>Units fight on contact. Several on one enemy win faster. Units standing still dig in.</li>
        <li><b>Win:</b> take the enemy's star objective, destroy or break their army, or (as defender) hold until time runs out.</li>
        <li>Pause any time with <kbd>Space</kbd>. Speed up with ▶▶.</li>
      </ul>
      <div class="acts"><button class="btn primary" id="bh-ok">Fight</button></div>`);
    $('bh-ok').onclick = () => { $('overlay').hidden = true; if (was) setSpeed(was); };
  }
  function confirmRetreat() {
    if (ended) return;
    const was = speed; setSpeed(0);
    sheet(`<h2>Retreat?</h2><p>Your forces pull back. The battle counts as lost, but you keep the units that are left.</p>
      <div class="acts"><button class="btn danger" id="rt-yes">Retreat</button><button class="btn" id="rt-no">Keep fighting</button></div>`);
    $('rt-no').onclick = () => { $('overlay').hidden = true; if (was) setSpeed(was); };
    $('rt-yes').onclick = () => { $('overlay').hidden = true; finish(3 - st.player, 'You ordered a retreat.'); };
  }

  // ================================================================ loop
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (!st) return;
    if (!ended && $('overlay').hidden) {
      acc += dt * speed;
      let n = 0;
      while (acc >= 0.1 && n < 10) { E.step(st, 0.1); root.AI.think(st, st.ai); acc -= 0.1; n++; }
      if (n === 10) acc = 0;
      // a beaten army breaks and runs
      for (const s of [1, 2]) if (!ended && power(s) < start0[s] * 0.18) finish(3 - s, `${st.sides[s].name}'s army broke and fled the field.`);
      if (!ended && st.over) finish(st.over.winner, st.over.reason);
    }
    pullFx(now);
    fogT -= dt; if (fogT <= 0) { fogT = 0.25; buildFog(); }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; updateHud(); }
    panelT -= dt; if (panelT <= 0) { panelT = 0.5; updatePanel(); }
    draw(now);
  }

  root.Battle = { fight, makeScenario };
})(window);
