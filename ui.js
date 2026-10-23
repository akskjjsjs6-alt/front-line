/* Front Line: rendering, input, menus. */
(function () {
  const E = Engine, U = E.UNITS, NS = NatoSymbols;
  const $ = id => document.getElementById(id);
  const SAVE_KEY = 'frontline-save-v1', HELP_KEY = 'frontline-help-seen';
  const TCOL = [[24, 46, 64], [98, 111, 72], [52, 78, 47], [122, 110, 76], [138, 128, 114], [66, 92, 82], [178, 156, 108], [96, 96, 100]];
  const COL = { me: [76, 157, 255], foe: [255, 90, 82] };

  let st = null, scen = null, speed = 0, lastSpeed = 1;
  let cam = { x: 0, y: 0, z: 1 }, sel = new Set(), inspect = null, mode = null, boxMode = false;
  let terrainCv = null, terrCv = null, terrVer = -1, fogCv = null, fogT = 0;
  let effects = [], canvas, ctx, dpr = 1, sw = 0, sh = 0;
  let drag = null, hover = null, pointers = new Map(), keys = new Set();
  let last = 0, acc = 0, hudT = 0, saveT = 0, panelT = 0, endShown = false;
  const menuSel = { scen: null, side: null, diff: 'normal' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };
  const typeName = t => (scen && scen.names && scen.names[t]) || U[t].name;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const sideCol = s => (s === st.player ? COL.me : COL.foe);

  // ======================================================= MENU
  function buildMenu() {
    const list = $('scen-list');
    list.innerHTML = '';
    SCENARIOS.forEach(sc => {
      const b = document.createElement('button');
      b.className = 'scen'; b.dataset.id = sc.id;
      b.innerHTML = `<canvas width="520" height="240"></canvas><div class="body"><div class="yr">${sc.year}</div><div class="nm">${sc.title}</div><div class="tg">${sc.tag}</div><p>${sc.blurb}</p></div>`;
      b.onclick = () => pickScen(sc.id);
      list.appendChild(b);
    });
    document.querySelectorAll('#diff-list .choice').forEach(b => b.onclick = () => {
      menuSel.diff = b.dataset.diff;
      document.querySelectorAll('#diff-list .choice').forEach(x => x.classList.toggle('sel', x === b));
    });
    $('btn-start').onclick = () => startGame(SCENARIOS.find(s => s.id === menuSel.scen), menuSel.side, menuSel.diff);
    $('btn-manual').onclick = showManual;
    $('btn-continue').onclick = continueGame;
    pickScen(SCENARIOS[0].id);
    // draw map previews after first paint
    setTimeout(() => SCENARIOS.forEach((sc, i) => setTimeout(() => drawPreview(sc), i * 30)), 30);
    drawMenuBg();
  }
  function pickScen(id) {
    menuSel.scen = id;
    const sc = SCENARIOS.find(s => s.id === id);
    document.querySelectorAll('.scen').forEach(b => b.classList.toggle('sel', b.dataset.id === id));
    const row = $('side-list'); row.innerHTML = '';
    if (!menuSel.side || menuSel.lastScen !== id) menuSel.side = sc.attacker;
    menuSel.lastScen = id;
    [1, 2].forEach(s => {
      const d = sc.sides[s], att = sc.attacker === s;
      const b = document.createElement('button');
      b.className = 'choice' + (menuSel.side === s ? ' sel' : '');
      b.innerHTML = `<span class="role">${att ? 'Attacker' : 'Defender'}</span><b>${d.name}</b><small>${d.long}</small><small>${att ? `Goal: take ${sc.target} victory points of enemy cities, or their capital.` : `Goal: hold out until time runs out, or take their capital.`}</small>`;
      b.onclick = () => { menuSel.side = s; pickScen(id); };
      row.appendChild(b);
    });
  }
  function drawPreview(sc) {
    const cv = document.querySelector(`.scen[data-id="${sc.id}"] canvas`);
    if (!cv) return;
    const g = E.createGame(sc, 1, 'normal'), c = cv.getContext('2d');
    const img = c.createImageData(E.GW, E.GH);
    for (let i = 0; i < E.GW * E.GH; i++) {
      const t = TCOL[g.terrain[i]], o = g.owner[i], k = o === 1 ? COL.me : o === 2 ? COL.foe : null, a = 0.28;
      img.data[i * 4] = k ? t[0] * (1 - a) + k[0] * a : t[0];
      img.data[i * 4 + 1] = k ? t[1] * (1 - a) + k[1] * a : t[1];
      img.data[i * 4 + 2] = k ? t[2] * (1 - a) + k[2] * a : t[2];
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = E.GW; tmp.height = E.GH; tmp.getContext('2d').putImageData(img, 0, 0);
    const sc2 = Math.max(cv.width / E.W, cv.height / E.H), w = E.W * sc2, h = E.H * sc2;
    c.imageSmoothingEnabled = true;
    c.drawImage(tmp, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    for (const ci of g.cities) {
      c.fillStyle = ci.cap ? '#fff' : 'rgba(255,255,255,.7)';
      c.beginPath(); c.arc((cv.width - w) / 2 + ci.x * sc2, (cv.height - h) / 2 + ci.y * sc2, ci.cap ? 4 : 2.5, 0, 7); c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, cv.width, cv.height);
  }
  function drawMenuBg() {
    const cv = $('menu-bg'), c = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const g = c.createRadialGradient(cv.width / 2, 0, 50, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height));
    g.addColorStop(0, '#17222e'); g.addColorStop(1, '#07090c');
    c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(120,150,180,.06)'; c.lineWidth = 1;
    for (let x = 0; x < cv.width; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, cv.height); c.stroke(); }
    for (let y = 0; y < cv.height; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(cv.width, y); c.stroke(); }
  }

  // ======================================================= GAME SETUP
  function startGame(sc, side, diff) {
    scen = sc;
    st = E.createGame(sc, side, diff);
    enterGame();
    toast(`You command ${st.sides[st.player].name}. The game is paused: look around, give orders, then press ▶.`, 'info', 7000);
    if (!store.get(HELP_KEY)) { store.set(HELP_KEY, '1'); showHelp(); }
  }
  function continueGame() {
    const raw = store.get(SAVE_KEY);
    if (!raw) return;
    try { st = E.deserialize(raw); } catch (e) { store.del(SAVE_KEY); return; }
    scen = SCENARIOS.find(s => s.id === st.scenId);
    enterGame();
    toast('Battle restored. Paused.', 'info');
  }
  function enterGame() {
    $('menu').hidden = true; $('game').hidden = false; $('overlay').hidden = true;
    sel.clear(); inspect = null; setMode(null); effects = []; endShown = false; terrVer = -1; acc = 0;
    setSpeed(0);
    buildTerrain(); buildToolbar(); resize(); fitCamera();
    $('hud-scen').textContent = `${scen.title} · ${scen.year}`;
    const noAir = st.sides[st.player].airMax <= 0;
    $('stat-air').hidden = noAir; $('btn-air').hidden = noAir;
    updateHud(); updatePanel();
  }
  function quitToMenu() {
    if (st && !st.over) store.set(SAVE_KEY, E.serialize(st));
    st = null;
    $('game').hidden = true; $('overlay').hidden = true; $('menu').hidden = false;
    $('continue-wrap').hidden = !store.get(SAVE_KEY);
  }

  // ======================================================= TERRAIN ART
  function h2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function buildTerrain() {
    const TS = (innerWidth > 1100 || devicePixelRatio > 1.5) ? 2 : 1.4;
    const w = Math.round(E.W * TS), h = Math.round(E.H * TS);
    terrainCv = document.createElement('canvas'); terrainCv.width = w; terrainCv.height = h; terrainCv.ts = TS;
    const c = terrainCv.getContext('2d'), img = c.createImageData(w, h), d = img.data, G = E.GW;
    const shore = new Uint8Array(E.GW * E.GH);
    for (let i = 0; i < shore.length; i++) {
      if (st.terrain[i]) continue;
      const x = i % G, y = (i / G) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < G && yy < E.GH && st.terrain[yy * G + xx]) shore[i] = 1;
      }
    }
    // a smooth wobble field so terrain edges look natural instead of blocky
    const NJ = 64, jx = new Float32Array(NJ * NJ), jy = new Float32Array(NJ * NJ);
    for (let i = 0; i < NJ * NJ; i++) { jx[i] = h2(i, 7) - 0.5; jy[i] = h2(i, 13) - 0.5; }
    const wob = (f, x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, a = ((y0 & 63) * NJ), b = (((y0 + 1) & 63) * NJ);
      const i00 = a + (x0 & 63), i10 = a + ((x0 + 1) & 63), i01 = b + (x0 & 63), i11 = b + ((x0 + 1) & 63);
      return (f[i00] * (1 - fx) + f[i10] * fx) * (1 - fy) + (f[i01] * (1 - fx) + f[i11] * fx) * fy;
    };
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const ox = px / TS, oy = py / TS, q = 1 / 7;
      const wx = Math.max(0, Math.min(E.W - 1, ox + wob(jx, ox * q, oy * q) * 9 + wob(jx, ox * q * 3.1, oy * q * 3.1) * 3));
      const wy = Math.max(0, Math.min(E.H - 1, oy + wob(jy, ox * q, oy * q) * 9 + wob(jy, ox * q * 3.1, oy * q * 3.1) * 3));
      const gx = Math.min(G - 1, (wx / E.CELL) | 0), gy = Math.min(E.GH - 1, (wy / E.CELL) | 0), ci = gy * G + gx;
      const t = st.terrain[ci], col = TCOL[t];
      let k = 1 + (h2(px >> 1, py >> 1) - 0.5) * 0.08 + (h2(gx >> 3, gy >> 3) - 0.5) * 0.08;
      if (t === 0) k = 1 + (h2(px >> 2, py >> 2) - 0.5) * 0.04 + (shore[ci] ? 0.25 : 0);
      const o = (py * w + px) * 4;
      d[o] = col[0] * k; d[o + 1] = col[1] * k; d[o + 2] = col[2] * k; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.setTransform(TS, 0, 0, TS, 0, 0);
    // glyphs
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
      for (let k = 0; k < 7 + ci.vp * 4; k++) {
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
      const x = i % G, y = (i / G) | 0, col = s === st.player ? COL.me : COL.foe;
      let border = false;
      if (x > 0 && o[i - 1] && o[i - 1] !== s) border = true; else if (x < G - 1 && o[i + 1] && o[i + 1] !== s) border = true;
      else if (y > 0 && o[i - G] && o[i - G] !== s) border = true; else if (y < E.GH - 1 && o[i + G] && o[i + G] !== s) border = true;
      const k = i * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = border ? 90 : 46;
    }
    c.putImageData(img, 0, 0);
    frontPath = buildFrontPath();
    terrVer = st.territoryVersion;
  }
  // The front line as a smooth vector contour (marching squares over cell centres).
  let frontPath = null;
  function buildFrontPath() {
    const path = new Path2D(), G = E.GW, o = st.owner, C = E.CELL, me = st.player;
    // corners: a=top-left, b=top-right, c=bottom-right, d=bottom-left (cell centres)
    for (let y = 0; y < E.GH - 1; y++) for (let x = 0; x < G - 1; x++) {
      const i = y * G + x, A = o[i], B = o[i + 1], Cc = o[i + G + 1], D = o[i + G];
      if (!A || !B || !Cc || !D) continue;
      const k = (A === me ? 8 : 0) | (B === me ? 4 : 0) | (Cc === me ? 2 : 0) | (D === me ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const x0 = x * C + C / 2, y0 = y * C + C / 2, h = C / 2;
      const T = [x0 + h, y0], R = [x0 + C, y0 + h], Bm = [x0 + h, y0 + C], L = [x0, y0 + h];
      const seg = (p, q) => { path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]); };
      switch (k) {
        case 1: case 14: seg(L, Bm); break;
        case 2: case 13: seg(Bm, R); break;
        case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(T, R); break;
        case 6: case 9: seg(T, Bm); break;
        case 7: case 8: seg(L, T); break;
        case 5: seg(L, T); seg(Bm, R); break;
        case 10: seg(T, R); seg(L, Bm); break;
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
      const g = c.createRadialGradient(x * sc, y * sc, r * sc * 0.6, x * sc, y * sc, r * sc);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x * sc, y * sc, r * sc, 0, 7); c.fill();
    };
    for (const u of st.units) if (u.side === st.player) hole(u.x, u.y, U[u.type].sight);
    for (const ci of st.cities) if (ci.owner === st.player) hole(ci.x, ci.y, 70);
    c.globalCompositeOperation = 'source-over';
  }

  // ======================================================= CAMERA
  function resize() {
    const r = $('stage').getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1); sw = r.width; sh = r.height;
    canvas.width = Math.round(sw * dpr); canvas.height = Math.round(sh * dpr);
  }
  function fitZ() { return Math.min(sw / E.W, (sh - 60) / E.H); }
  function fitCamera() {
    let z = fitZ();
    const mine = st.units.filter(u => u.side === st.player);
    let cx = E.W / 2, cy = E.H / 2;
    if (sw < sh) { // portrait phone: zoom in on our own army
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
  function zoomAt(sx, sy, f) {
    const w = toW(sx, sy); cam.z *= f; clampCam();
    cam.x = w.x - sx / cam.z; cam.y = w.y - sy / cam.z; clampCam();
  }
  const symSize = () => Math.max(11, Math.min(24, 8.5 * cam.z));

  // ======================================================= DRAW
  function seenByMe(u) { return u.side === st.player || st.vis[st.player].has(u.id); }
  function pointSeen(x, y) {
    for (const u of st.units) if (u.side === st.player && (u.x - x) ** 2 + (u.y - y) ** 2 < U[u.type].sight ** 2) return true;
    return false;
  }
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, sw, sh);
    if (!st) return;
    if (terrVer !== st.territoryVersion) buildTerritory();
    // world layers
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
    // air-strike radius and deploy targets
    if (mode && mode.air && hover) {
      ctx.strokeStyle = 'rgba(242,201,76,.9)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hover.x, hover.y, 55 * cam.z, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    // cities
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const ci of st.cities) {
      const [x, y] = toS(ci.x, ci.y), col = sideCol(ci.owner), r = ci.cap ? 7 : 4.5 + ci.vp;
      if (mode && mode.deploy && ci.owner === st.player) {
        const ok = E.canBuyAt(st, st.player, ci);
        ctx.strokeStyle = ok ? 'rgba(242,201,76,' + (0.6 + 0.4 * Math.sin(t * 6)) + ')' : 'rgba(255,90,82,.6)';
        ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 9, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(col, 1);
      if (ci.cap) star(ctx, x, y, r + 1.5, r * 0.45); else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      if (ci.sup && !ci.cap) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
      if (cam.z > fitZ() * 1.05 || ci.vp >= 2) {
        const fs = ci.vp >= 3 ? 13 : ci.vp >= 2 ? 12 : 11;
        ctx.font = `600 ${fs}px "Barlow Condensed", sans-serif`;
        const label = ci.name.toUpperCase() + (ci.vp > 1 ? ` ${'•'.repeat(ci.vp)}` : '');
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(label, x, y + r + 4);
        ctx.fillStyle = ci.owner === st.player ? '#dcebff' : '#ffd9d6'; ctx.fillText(label, x, y + r + 4);
      }
    }
    // selected unit routes
    ctx.lineWidth = 1.6;
    for (const u of st.units) {
      if (!sel.has(u.id) || !u.path.length) continue;
      ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(...toS(u.x, u.y)); for (const p of u.path) ctx.lineTo(...toS(p.x, p.y)); ctx.stroke();
      ctx.setLineDash([]);
      const e = u.path[u.path.length - 1], [ex, ey] = toS(e.x, e.y);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 7); ctx.fill();
    }
    // effects under units
    drawEffects(now, false);
    // units
    const vis = st.units.filter(seenByMe).sort((a, b) => (U[a.type].air ? 1 : 0) - (U[b.type].air ? 1 : 0) || a.y - b.y);
    for (const u of vis) {
      const [x, y] = toS(u.x, u.y);
      if (x < -40 || y < -40 || x > sw + 40 || y > sh + 40) continue;
      const friendly = u.side === st.player, air = U[u.type].air;
      if (air) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 4, y + s * 0.9, s * 0.7, s * 0.22, 0, 0, 7); ctx.fill(); }
      if (u.engaged) {
        ctx.strokeStyle = `rgba(255,120,60,${0.35 + 0.35 * Math.sin(t * 8 + u.id)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s * 1.15, 0, 7); ctx.stroke();
      }
      const yy = air ? y - s * 0.35 : y;
      NS.drawUnit(ctx, x, yy, s, u.type, { friendly, ech: u.ech, str: u.str, selected: sel.has(u.id) || (inspect && inspect.unit === u) });
      if (!u.sup) { ctx.fillStyle = '#ff9f1a'; ctx.font = `800 ${Math.round(s * 0.8)}px "Barlow Condensed"`; ctx.textBaseline = 'middle'; ctx.fillText('!', x + s * 0.95, yy - s * 0.45); ctx.textBaseline = 'top'; }
      if (cam.z > 2.6) {
        ctx.font = `500 11px "Barlow Condensed", sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(u.name, x, yy + s * 0.85 + 6);
        ctx.fillStyle = '#e8eef3'; ctx.fillText(u.name, x, yy + s * 0.85 + 6);
      }
    }
    drawEffects(now, true);
    // drag previews
    if (drag && drag.kind === 'line' && drag.pts.length > 1) {
      ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); drag.pts.forEach((p, i) => { const [x, y] = toS(p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      const n = selectedUnits().length;
      if (n > 1) {
        const pts = resampleLine(drag.pts, n);
        for (const p of pts) { const [x, y] = toS(p.x, p.y); ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
      }
    }
    if (drag && drag.kind === 'box') {
      const x = Math.min(drag.start.x, drag.cur.x), y = Math.min(drag.start.y, drag.cur.y), w = Math.abs(drag.cur.x - drag.start.x), h = Math.abs(drag.cur.y - drag.start.y);
      ctx.fillStyle = 'rgba(76,157,255,.12)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#4c9dff'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    }
  }
  function star(c, x, y, R, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill();
  }
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

  // ======================================================= EFFECTS
  function pullFx(now) {
    for (const f of st.fx) {
      if (f.kind === 'msg') { msgToast(f); continue; }
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
        const k = Math.min(1, age / 0.6), [x0, y0] = toS(f.x0, f.y0), [x1, y1] = toS(f.x1, f.y1);
        const lift = Math.hypot(x1 - x0, y1 - y0) * 0.35;
        if (k < 1) {
          const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * lift;
          ctx.fillStyle = '#ffe6a0'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
        } else {
          const a = (age - 0.6) / 0.3;
          ctx.fillStyle = `rgba(255,150,60,${0.8 * (1 - a)})`; ctx.beginPath(); ctx.arc(x1, y1, 4 + a * 8, 0, 7); ctx.fill();
        }
      } else if (top && f.kind === 'boom') {
        const dur = f.big ? 1.1 : 0.7, a = age / dur, [x, y] = toS(f.x, f.y), R = (f.big ? 55 : 14) * cam.z;
        ctx.fillStyle = `rgba(255,${140 + 80 * (1 - a)},60,${0.55 * (1 - a)})`; ctx.beginPath(); ctx.arc(x, y, R * (0.4 + a * 0.8), 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,230,180,${1 - a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R * (0.3 + a), 0, 7); ctx.stroke();
      } else if (top && f.kind === 'jet') {
        const k = Math.min(1, age / 1.5), home = st.sides[f.side].home;
        const sx = home === 'W' ? -50 : home === 'E' ? E.W + 50 : f.x, sy = home === 'N' ? -50 : home === 'S' ? E.H + 50 : f.y;
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
    const box = $('toasts');
    while (box.children.length >= 4) box.firstChild.remove();
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = text;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 500); }, ms || 3800);
  }
  function msgToast(f) {
    const me = st.player, t = f.text;
    if (/deployed at/.test(t) && f.side !== me) return;
    if (/deployed at/.test(t)) return toast(t, 'good', 2500);
    if (/destroyed/.test(t)) return toast(t, f.side === me ? 'bad' : 'good');
    if (/captured/.test(t)) return toast(t, f.side === me ? 'good' : 'bad');
    if (/shot down/.test(t)) return toast(t, f.side === me ? 'bad' : 'good');
    toast(t, 'info');
  }

  // ======================================================= HUD + PANEL
  function gameDate() {
    const d = new Date(new Date(scen.startDate).getTime() + st.time * scen.hoursPerSec * 3600e3);
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    return `${wd} ${d.getDate()} ${mo} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:00`;
  }
  function updateHud() {
    const S = st.sides[st.player];
    $('hud-date').textContent = gameDate();
    $('hud-money').textContent = Math.floor(S.money);
    $('hud-air').textContent = `${Math.floor(S.air)}/${S.airMax}`;
    const A = scen.attacker, vp = E.heldVP(st, A), f = Math.min(1, vp / (scen.target * 1.4));
    $('hud-vp-lbl').textContent = A === st.player ? 'Your objective' : `${st.sides[A].name} progress`;
    $('hud-vp').textContent = `${vp} / ${scen.target} VP`;
    $('hud-vp-fill').style.width = (f * 100) + '%';
    $('hud-vp-fill').style.background = A === st.player ? 'var(--blue)' : 'var(--red)';
    $('hud-vp-mark').style.left = (100 / 1.4) + '%';
    const hrs = Math.max(0, (st.duration - st.time) * scen.hoursPerSec);
    $('hud-time').textContent = hrs >= 24 ? `${Math.floor(hrs / 24)}d ${Math.floor(hrs % 24)}h` : `${Math.floor(hrs)}h`;
    document.querySelectorAll('#tb-deploy .tool').forEach(b => { b.disabled = S.money < U[b.dataset.type].cost; });
    $('btn-air').disabled = S.air < 1;
    $('paused-tag').hidden = speed !== 0 || !!st.over;
  }
  function selectedUnits() { return st.units.filter(u => sel.has(u.id)); }
  function symbolCanvas(type, friendly, ech, size) {
    const cv = document.createElement('canvas'), s = size || 20, w = Math.ceil(s * 2.1), h = Math.ceil(s * 1.9);
    cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const c = cv.getContext('2d'); c.scale(2, 2);
    NS.drawUnit(c, w / 2, h / 2 + s * 0.18, s, type, { friendly, ech });
    return cv;
  }
  function strBar(v) { const c = v > 60 ? 'var(--green)' : v > 30 ? 'var(--gold)' : 'var(--red)'; return `<div class="strbar"><i style="width:${Math.max(0, v)}%;background:${c}"></i></div>`; }
  function updatePanel() {
    const p = $('panel');
    for (const id of [...sel]) if (!st.units.some(u => u.id === id)) sel.delete(id);
    if (inspect && inspect.unit && (!st.units.includes(inspect.unit) || !seenByMe(inspect.unit))) inspect = null;
    const units = selectedUnits();
    if (!units.length && !inspect) { p.hidden = true; return; }
    p.hidden = false;
    if (units.length === 1 || (inspect && inspect.unit)) {
      const u = units[0] || inspect.unit, T = U[u.type], mine = u.side === st.player;
      const tags = [];
      if (u.engaged) tags.push('<span class="tag bad">In combat</span>');
      if (!u.sup) tags.push('<span class="tag bad">Out of supply</span>');
      if (u.ent > 0.5) tags.push('<span class="tag good">Dug in</span>');
      if (u.hq) tags.push('<span class="tag good">HQ bonus</span>');
      if (u.path.length && mine) tags.push('<span class="tag">Moving</span>');
      const ter = E.TERRAIN[st.terrain[E.cellIdx(u.x, u.y)]].name;
      p.innerHTML = `<div class="sym"><div id="p-sym"></div><div><h3>${u.name}</h3><div class="type">${mine ? '' : (st.sides[u.side].name + ' · ')}${typeName(u.type)} · ${NS.ECHELON[u.ech] || ''}</div></div></div>
        ${strBar(u.str)}
        <div class="tags">${tags.join('')}</div>
        <div class="rows"><span>Strength</span><span>${Math.max(0, Math.round(u.str))}%</span><span>Attack / Defense</span><span>${T.atk} / ${T.def}</span><span>Range</span><span>${T.ranged ? T.range + ' (stand still to fire)' : 'Close combat'}</span><span>Terrain</span><span>${ter}</span></div>
        <div class="about">${T.about}</div>
        ${mine ? `<div class="acts"><button data-act="stop">Stop (H)</button><button data-act="clear">Deselect</button></div><div class="hint">Tap the map to move. Drag from the unit to draw a route.</div>` : `<div class="acts"><button data-act="clear">Close</button></div>`}`;
      $('p-sym').appendChild(symbolCanvas(u.type, mine, u.ech, 24));
    } else if (units.length > 1) {
      const counts = {};
      for (const u of units) counts[u.type] = (counts[u.type] || 0) + 1;
      const avg = units.reduce((a, u) => a + u.str, 0) / units.length;
      p.innerHTML = `<h3>${units.length} units selected</h3><div class="type">Average strength ${Math.round(avg)}%</div>${strBar(avg)}
        <div class="group-list">${Object.keys(counts).map(t => `<div data-t="${t}"></div>`).join('')}</div>
        <div class="acts"><button data-act="stop">Stop (H)</button><button data-act="clear">Deselect</button></div>
        <div class="hint">Tap the map to move them together. <b>Drag a line</b> starting from one of them to spread them out along a front.</div>`;
      p.querySelectorAll('.group-list div').forEach(el => { const t = el.dataset.t; el.appendChild(symbolCanvas(t, true, null, 13)); el.insertAdjacentHTML('beforeend', `<span>${counts[t]} × ${typeName(t)}</span>`); });
    } else if (inspect && inspect.city) {
      const c = inspect.city;
      p.innerHTML = `<h3>${c.name}</h3><div class="type">${st.sides[c.owner].name}${c.cap ? ' · Capital' : ''}</div>
        <div class="rows"><span>Victory points</span><span>${c.vp}</span><span>Supply source</span><span>${c.sup ? 'Yes' : 'No'}</span><span>Income</span><span>+${(c.vp * 0.13).toFixed(2)}/s</span></div>
        <div class="about">${c.cap ? 'Capturing an enemy capital wins the war at once. ' : ''}${c.sup ? 'Supply flows out of this city into connected territory. ' : ''}A city cannot fall while one of its owner's ground units is close by.</div>
        <div class="acts"><button data-act="clear">Close</button></div>`;
    }
    p.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      if (b.dataset.act === 'stop') stopSelected();
      else { sel.clear(); inspect = null; }
      updatePanel();
    });
  }
  function stopSelected() { for (const u of selectedUnits()) { u.path = []; u.goal = null; } }

  function buildToolbar() {
    const g = $('tb-deploy'); g.innerHTML = '';
    for (const t of scen.buy) {
      const b = document.createElement('button'); b.className = 'tool'; b.dataset.type = t;
      b.title = `Deploy ${typeName(t)}: ${U[t].about}`;
      b.appendChild(symbolCanvas(t, true, null, 12));
      b.insertAdjacentHTML('beforeend', `<span>${shortType(t)}</span><span class="cost">${U[t].cost}</span>`);
      b.onclick = () => setMode(mode && mode.deploy === t ? null : { deploy: t });
      g.appendChild(b);
    }
  }
  const SHORT = { inf: 'Infantry', mech: 'Mech Inf', armor: 'Armor', recon: 'Recon', art: 'Artillery', mlrs: 'Rockets', ad: 'Air Def.', heli: 'Helos', uas: 'Drones' };
  function shortType(t) { const n = scen.names && scen.names[t] && scen.names[t].split(' / ')[0]; return n && n.length <= 10 ? n : SHORT[t]; }
  function setMode(m) {
    mode = m;
    document.querySelectorAll('#tb-deploy .tool').forEach(b => b.classList.toggle('on', !!(m && m.deploy === b.dataset.type)));
    $('btn-air').classList.toggle('on', !!(m && m.air));
    const hint = $('mode-hint');
    if (!m) { hint.hidden = true; canvas.classList.remove('target'); return; }
    canvas.classList.add('target');
    hint.hidden = false;
    hint.innerHTML = m.air ? 'Tap the map to bomb that spot. Enemy air defense nearby weakens the strike. <button>Cancel</button>'
      : `Tap one of your glowing cities to deploy <b>${typeName(m.deploy)}</b> (${U[m.deploy].cost}). Cities with enemies close by are blocked. <button>Cancel</button>`;
    hint.querySelector('button').onclick = () => setMode(null);
  }

  // ======================================================= INPUT
  function unitAt(p, which) {
    const s = symSize(); let best = null, bd = (s * 1.05) ** 2;
    for (const u of st.units) {
      if (!seenByMe(u)) continue;
      if (which === 'own' && u.side !== st.player) continue;
      if (which === 'foe' && u.side === st.player) continue;
      const [x, y] = toS(u.x, u.y), yy = U[u.type].air ? y - s * 0.35 : y;
      const d = (x - p.x) ** 2 + (yy - p.y) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  function cityAt(p, side) {
    let best = null, bd = 26 * 26;
    for (const c of st.cities) {
      if (side && c.owner !== side) continue;
      const [x, y] = toS(c.x, c.y), d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  const evPt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function onDown(e) {
    if (!st) return;
    canvas.setPointerCapture(e.pointerId);
    const p = evPt(e);
    pointers.set(e.pointerId, p);
    $('tooltip').hidden = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.z, mid: toW((a.x + b.x) / 2, (a.y + b.y) / 2) };
      return;
    }
    if (pointers.size > 2) return;
    const w = toW(p.x, p.y);
    if (e.button === 1 || keys.has(' ')) { drag = { kind: 'pan', start: p, cam0: { ...cam }, moved: true }; canvas.classList.add('grab'); return; }
    if (e.button === 2) { drag = { kind: 'line', start: p, pts: [w], right: true, moved: false }; return; }
    if (mode) { drag = { kind: 'maybe-pan', start: p, cam0: { ...cam }, tapMode: true }; return; }
    const own = unitAt(p, 'own');
    if (own && sel.has(own.id)) { drag = { kind: 'maybe-line', start: p, pts: [{ x: own.x, y: own.y }], unit: own }; return; }
    if (!own && (boxMode || e.shiftKey)) { drag = { kind: 'box', start: p, cur: p }; return; }
    drag = { kind: 'maybe-pan', start: p, cam0: { ...cam } };
  }
  function onMove(e) {
    if (!st) return;
    const p = evPt(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    hover = p;
    if (!drag) { if (e.pointerType === 'mouse') showTooltip(p); return; }
    const moved = Math.hypot(p.x - drag.start?.x, p.y - drag.start?.y) > 7;
    if (drag.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.z = drag.z0 * d / drag.d0; clampCam();
      cam.x = drag.mid.x - mx / cam.z; cam.y = drag.mid.y - my / cam.z; clampCam();
      return;
    }
    if (drag.kind === 'maybe-line' && moved) drag.kind = 'line';
    if (drag.kind === 'maybe-pan' && moved) { drag.kind = 'pan'; canvas.classList.add('grab'); }
    if (drag.kind === 'pan') {
      cam.x = drag.cam0.x - (p.x - drag.start.x) / cam.z; cam.y = drag.cam0.y - (p.y - drag.start.y) / cam.z; clampCam();
    } else if (drag.kind === 'line') {
      if (moved) drag.moved = true;
      const w = toW(p.x, p.y), l = drag.pts[drag.pts.length - 1];
      if (Math.hypot(w.x - l.x, w.y - l.y) > 5 / cam.z * 2) drag.pts.push(w);
    } else if (drag.kind === 'box') drag.cur = p;
  }
  function onUp(e) {
    if (!st) return;
    const p = evPt(e);
    pointers.delete(e.pointerId);
    canvas.classList.remove('grab');
    if (!drag) return;
    const d = drag;
    if (d.kind === 'pinch') { if (pointers.size === 0) drag = null; return; }
    drag = null;
    if (d.kind === 'maybe-pan' && d.tapMode) return tapMode(p);
    if (d.kind === 'maybe-pan' || d.kind === 'maybe-line') return tap(p, e);
    if (d.kind === 'line') {
      if (!d.moved && d.right) return moveOrder(toW(p.x, p.y), unitAt(p, 'foe'));
      return lineOrder(d.pts);
    }
    if (d.kind === 'box') {
      const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
      if (!e.shiftKey) sel.clear();
      for (const u of st.units) {
        if (u.side !== st.player) continue;
        const [x, y] = toS(u.x, u.y);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) sel.add(u.id);
      }
      inspect = null;
      if (boxMode) { boxMode = false; $('btn-box').classList.remove('on'); }
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
    const city = cityAt(p);
    inspect = foe ? { unit: foe } : city ? { city } : null;
    updatePanel();
  }
  function tapMode(p) {
    const w = toW(p.x, p.y);
    if (mode.air) {
      if (E.airStrike(st, st.player, w.x, w.y)) { toast('Aircraft inbound…', 'info', 2000); setMode(null); }
      else toast('No aircraft ready yet. They recharge over time.', 'bad');
      return;
    }
    if (mode.deploy) {
      const c = cityAt(p, st.player);
      if (!c) return toast('Tap one of your own cities (blue dots).', 'bad');
      if (!E.canBuyAt(st, st.player, c)) return toast(`${c.name} has enemies too close to deploy there.`, 'bad');
      const u = E.buy(st, st.player, mode.deploy, c);
      if (!u) return toast('Not enough funds.', 'bad');
      sel.clear(); sel.add(u.id); inspect = null;
      setMode(null); updatePanel();
    }
  }
  function moveOrder(w, foe) {
    const units = selectedUnits();
    if (!units.length) return;
    E.orderGroup(st, units, foe ? foe.x : w.x, foe ? foe.y : w.y);
    effects.push({ kind: 'ping', x: w.x, y: w.y, t0: performance.now() });
    if (units.some(u => !U[u.type].air && !u.path.length)) toast('Some units cannot reach that spot.', 'bad', 2000);
  }
  function lineOrder(pts) {
    const units = selectedUnits();
    if (!units.length || pts.length < 2) return;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len < 15) return moveOrder(pts[pts.length - 1]);
    if (units.length === 1) E.orderPath(st, units[0], pts);
    else { E.orderLine(st, units, pts); toast(`Front line drawn: ${units.length} units spreading out along it.`, 'good', 2200); }
  }
  function showTooltip(p) {
    const tip = $('tooltip');
    const u = unitAt(p), c = !u && cityAt(p);
    if (!u && !c) { tip.hidden = true; return; }
    if (u) {
      const mine = u.side === st.player;
      tip.innerHTML = `<b>${u.name}</b><br><span class="dim">${mine ? '' : st.sides[u.side].name + ' · '}${typeName(u.type)}</span><br>Strength ${Math.max(0, Math.round(u.str))}%${u.engaged ? ' · <span style="color:#ff9f6a">fighting</span>' : ''}${!u.sup ? ' · <span style="color:#ff9f1a">no supply</span>' : ''}${u.ent > 0.5 ? ' · dug in' : ''}`;
    } else {
      tip.innerHTML = `<b>${c.name}</b><br><span class="dim">${st.sides[c.owner].name}${c.cap ? ' · capital' : ''}</span><br>${c.vp} victory point${c.vp > 1 ? 's' : ''}${c.sup ? ' · supply source' : ''}`;
    }
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(sw - r.width - 8, p.x + 14) + 'px';
    tip.style.top = Math.min(sh - r.height - 8, p.y + 14) + 'px';
  }

  function setSpeed(s) {
    if (s > 0) lastSpeed = s;
    speed = s;
    document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
    if (st) updateHud();
  }

  // ======================================================= SHEETS
  function sheet(html) { $('sheet').innerHTML = html; $('overlay').hidden = false; }
  function closeSheet() { $('overlay').hidden = true; }
  function showHelp() {
    const wasSpeed = speed; if (st) setSpeed(0);
    sheet(`<h2>How to play</h2>
      <p>Everything happens in real time. You can <b>pause any time</b> with <kbd>Space</kbd> and still give orders.</p>
      <h3>Moving</h3>
      <ul>
        <li><b>Tap your unit</b> (blue box) to select it. Tap the map to send it there.</li>
        <li><b>Select many</b>: use <i>Box select</i> (or hold <kbd>Shift</kbd> and drag), or <i>Select all</i> (<kbd>A</kbd>).</li>
        <li><b>Draw a front line</b>: with several units selected, drag a line starting <i>from one of them</i>. They spread out evenly along it. With one unit, the line becomes its route.</li>
        <li>Mouse users: <b>right-click</b> to move, <b>right-drag</b> to draw a line from anywhere.</li>
        <li>Drag the empty map to look around. Pinch or scroll to zoom.</li>
      </ul>
      <h3>Fighting</h3>
      <ul>
        <li>Units fight automatically when they touch an enemy (red diamond). Several units on one enemy win faster.</li>
        <li>Units standing still <b>dig in</b> and defend better. Forests, hills and cities help defenders.</li>
        <li>Artillery and drones shoot from far away, but only at enemies someone can see and only when standing still.</li>
      </ul>
      <h3>Territory &amp; supply</h3>
      <ul>
        <li>Your units paint the ground blue as they move. Cities on your ground give you <b>funds</b>.</li>
        <li>Supply flows from your home edge and supply cities through your territory. <b>Cut off</b> units (orange <b>!</b>) weaken and slowly die.</li>
        <li>Surround empty enemy ground and it becomes yours.</li>
      </ul>
      <h3>Winning</h3>
      <ul>
        <li>The attacker must hold enough <b>victory points</b> (the dots after city names) when time runs out. The defender wins by holding out.</li>
        <li>Taking the enemy <b>capital</b> (star) wins at once.</li>
        <li>Spend funds at the bottom bar to deploy new units in your cities.</li>
      </ul>
      <div class="acts"><button class="btn primary" id="help-ok">Got it</button><button class="btn" id="help-manual">Symbol guide</button></div>`);
    $('help-ok').onclick = () => { closeSheet(); if (st && wasSpeed) setSpeed(wasSpeed); };
    $('help-manual').onclick = showManual;
  }
  function showManual() {
    const prev = scen; if (!scen) scen = SCENARIOS[SCENARIOS.length - 1];
    sheet(`<h2>Field manual</h2>
      <p>This game uses <b>NATO military map symbols</b> (APP-6). Your units are <b style="color:#80e0ff">blue rectangles</b>; enemy units are <b style="color:#ff8080">red diamonds</b>. The picture inside shows what the unit is. The marks on top show its size.</p>
      <h3>Unit types</h3><div class="manual-grid" id="man-units"></div>
      <h3>Size marks</h3><div class="manual-grid" id="man-ech"></div>
      <h3>On the map</h3>
      <ul><li>Bar under a symbol: strength. Green is healthy, red is nearly destroyed.</li>
      <li>Pulsing orange ring: in combat. Orange <b>!</b>: cut off from supply.</li>
      <li>Star: capital. Dots after a city name: victory points. White dot in a city: supply source.</li></ul>
      <div class="acts"><button class="btn primary" id="man-ok">Close</button></div>`);
    const g = $('man-units');
    for (const t of Object.keys(U)) {
      const el = document.createElement('div');
      el.appendChild(symbolCanvas(t, true, null, 18));
      el.appendChild(symbolCanvas(t, false, null, 18));
      el.insertAdjacentHTML('beforeend', `<div><b>${U[t].name}</b><small>${U[t].about}</small></div>`);
      g.appendChild(el);
    }
    const ge = $('man-ech');
    for (const [k, v] of Object.entries(NS.ECHELON)) {
      const el = document.createElement('div');
      el.appendChild(symbolCanvas('inf', true, k, 18));
      el.insertAdjacentHTML('beforeend', `<div><b>${k}: ${v}</b><small>${{ II: 'About 500–800 soldiers.', III: 'About 2,000–3,000.', X: 'About 3,000–5,000.', XX: '10,000–20,000. Hits harder.', XXX: 'Command of several divisions.' }[k]}</small></div>`);
      ge.appendChild(el);
    }
    scen = prev;
    $('man-ok').onclick = () => { if (st) showGameMenu(); else closeSheet(); };
    if (!st) $('man-ok').textContent = 'Close';
  }
  function showGameMenu() {
    setSpeed(0);
    sheet(`<h2>Paused</h2><p>${scen.title}, ${scen.year}. You command <b>${st.sides[st.player].name}</b>.</p>
      <div class="acts" style="flex-direction:column">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="help">How to play</button>
        <button class="btn" data-a="manual">Symbol guide</button>
        <button class="btn" data-a="restart">Restart this battle</button>
        <button class="btn ghost" data-a="quit">Save &amp; quit to menu</button>
      </div>`);
    $('sheet').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'resume') { closeSheet(); setSpeed(lastSpeed); }
      if (a === 'help') showHelp();
      if (a === 'manual') showManual();
      if (a === 'restart') { store.del(SAVE_KEY); startGame(scen, st.player, st.difficulty); }
      if (a === 'quit') quitToMenu();
    });
  }
  function showEnd() {
    endShown = true;
    store.del(SAVE_KEY);
    const win = st.over.winner === st.player, me = st.player, foe = E.other(me);
    const cities = s => st.cities.filter(c => c.owner === s).length;
    sheet(`<div class="kicker">${scen.title} · ${scen.year}</div>
      <h2 class="end-title ${win ? 'win' : 'lose'}">${win ? 'Victory' : 'Defeat'}</h2>
      <p>${st.over.reason}</p>
      <div class="end-stats">
        <span></span><span><b>${st.sides[me].name}</b></span><span><b>${st.sides[foe].name}</b></span>
        <span>Units lost</span><span>${st.losses[me]}</span><span>${st.losses[foe]}</span>
        <span>Cities held</span><span>${cities(me)}</span><span>${cities(foe)}</span>
        <span>Units left</span><span>${st.units.filter(u => u.side === me).length}</span><span>${st.units.filter(u => u.side === foe).length}</span>
      </div>
      <p style="margin-top:14px">Battle ended ${gameDate()}.</p>
      <div class="acts"><button class="btn primary" id="end-again">Play again</button><button class="btn" id="end-side">Swap sides</button><button class="btn ghost" id="end-menu">Menu</button></div>`);
    $('end-again').onclick = () => startGame(scen, st.player, st.difficulty);
    $('end-side').onclick = () => startGame(scen, E.other(st.player), st.difficulty);
    $('end-menu').onclick = quitToMenu;
  }

  // ======================================================= LOOP
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (!st) return;
    // keyboard panning
    const pan = 600 * dt / cam.z;
    if (keys.has('arrowleft')) cam.x -= pan;
    if (keys.has('arrowright')) cam.x += pan;
    if (keys.has('arrowup')) cam.y -= pan;
    if (keys.has('arrowdown')) cam.y += pan;
    if (keys.size) clampCam();
    if (!st.over && $('overlay').hidden) {
      acc += dt * speed;
      let n = 0;
      while (acc >= 0.1 && n < 10) { E.step(st, 0.1); AI.think(st, st.ai); acc -= 0.1; n++; }
      if (n === 10) acc = 0;
    }
    pullFx(now);
    fogT -= dt; if (fogT <= 0) { fogT = 0.25; buildFog(); }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; updateHud(); }
    panelT -= dt; if (panelT <= 0) { panelT = 0.5; updatePanel(); }
    saveT -= dt; if (saveT <= 0) { saveT = 10; if (!st.over) store.set(SAVE_KEY, E.serialize(st)); }
    if (st.over && !endShown) { endShown = true; setTimeout(showEnd, 1200); }
    draw(now);
  }

  function onKey(e) {
    if (!st || $('game').hidden) return;
    const k = e.key.toLowerCase();
    if (e.type === 'keyup') { keys.delete(k); return; }
    if (e.target.tagName === 'INPUT') return;
    if (!$('overlay').hidden) { if (k === 'escape') { closeSheet(); } return; }
    keys.add(k);
    if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : lastSpeed); }
    else if (k === '1') setSpeed(1); else if (k === '2') setSpeed(2); else if (k === '3') setSpeed(4);
    else if (k === 'a') selectAll();
    else if (k === 'h') stopSelected();
    else if (k === 'f' && st.sides[st.player].airMax > 0) setMode(mode && mode.air ? null : { air: true });
    else if (k === 'escape') { if (mode) setMode(null); else { sel.clear(); inspect = null; updatePanel(); } }
    else if (k === '+' || k === '=') zoomAt(sw / 2, sh / 2, 1.25);
    else if (k === '-') zoomAt(sw / 2, sh / 2, 0.8);
    else if (k === '?') showHelp();
  }
  function selectAll() {
    sel.clear(); inspect = null;
    for (const u of st.units) if (u.side === st.player && u.type !== 'hq' && !U[u.type].ranged && !U[u.type].air) sel.add(u.id);
    updatePanel();
    toast(`${sel.size} front-line units selected. Drag a line from one of them to form a front.`, 'info', 3000);
  }

  // ======================================================= BOOT
  function boot() {
    canvas = $('map'); ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); drag = null; });
    canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; hover = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); const p = evPt(e); zoomAt(p.x, p.y, Math.pow(1.0015, -e.deltaY)); }, { passive: false });
    addEventListener('keydown', onKey); addEventListener('keyup', onKey);
    addEventListener('blur', () => keys.clear());
    addEventListener('resize', () => { if (st) { resize(); clampCam(); } else drawMenuBg(); });
    document.querySelectorAll('.speed button').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
    $('btn-menu').onclick = showGameMenu;
    $('btn-air').onclick = () => setMode(mode && mode.air ? null : { air: true });
    $('btn-all').onclick = selectAll;
    $('btn-box').onclick = () => { boxMode = !boxMode; $('btn-box').classList.toggle('on', boxMode); if (boxMode) toast('Drag on the map to draw a selection box.', 'info', 2500); };
    $('btn-help').onclick = showHelp;
    $('overlay').addEventListener('click', e => { if (e.target.id === 'overlay' && st && !st.over) { closeSheet(); } });
    $('continue-wrap').hidden = !store.get(SAVE_KEY);
    buildMenu();
    requestAnimationFrame(frame);
    window.FrontLine = { get state() { return st; }, get camera() { return cam; } };  // handy for debugging in the console
  }
  boot();
})();
