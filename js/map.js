/* World map: vector provinces over a shaded-relief background, HOI4-style zoom.
   The map is drawn as cached 256px tiles per zoom level (like a web map), so panning and
   zooming only draw the few tiles that are new; a captured province only redraws its own tiles. */
(function (root) {
  'use strict';
  const NS = root.NatoSymbols;
  const WU = 10;                                  // world units per degree of longitude
  const R2D = 180 / Math.PI;
  const miller = lat => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat / R2D)) * R2D;
  const HAS_CANVAS = typeof Path2D !== 'undefined';
  const TS = 256, S0 = 0.125, MAXL = 10;          // tile size in device px; level 0 scale (device px per world unit)
  const MAXZ = 16;                                // max zoom in CSS px per world unit: past this the relief art and data soften out

  let reliefImg = null;
  function relief() {
    if (!reliefImg) { reliefImg = new Image(); reliefImg.src = 'data/relief.jpg'; }
    return reliefImg;
  }

  // Decode the shared arcs and province rings once per data set.
  function prepare(data) {
    if (data._geo) return data._geo;
    const Q = data.quant, top = miller(data.latMax);
    const X = lon => (lon + 180) * WU, Y = lat => (top - miller(lat)) * WU;
    const arcs = data.arcs.map(a => {
      const out = new Float32Array(a.length);
      let x = 0, y = 0;
      for (let i = 0; i < a.length; i += 2) {
        x += a[i]; y += a[i + 1];
        out[i] = X(x / Q - 180); out[i + 1] = Y(data.latMax - y / Q);
      }
      return out;
    });
    const users = arcs.map(() => []);
    const provs = data.provinces.map((p, i) => {
      const path = HAS_CANVAS ? new Path2D() : null, rings = [];
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const poly of p.g || []) for (const ring of poly) {
        const pts = [];
        for (const ref of ring) {
          const a = arcs[ref >= 0 ? ref : ~ref], n = a.length / 2;
          users[ref >= 0 ? ref : ~ref].push(i);
          for (let k = 0; k < n; k++) {
            const j = ref >= 0 ? k : n - 1 - k;
            pts.push(a[j * 2], a[j * 2 + 1]);
          }
        }
        const r = new Float32Array(pts);
        rings.push(r);
        for (let k = 0; k < r.length; k += 2) {
          const x = r[k], y = r[k + 1];
          if (path) { if (k) path.lineTo(x, y); else path.moveTo(x, y); }
          if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        }
        if (path) path.closePath();
      }
      return { path, rings, box: [minx, miny, maxx, maxy], lx: X(p.x), ly: Y(p.y) };
    });
    const CELL = 60;
    const index = boxes => {
      const grid = new Map();
      boxes.forEach((b, i) => {
        for (let gx = Math.floor(b[0] / CELL); gx <= Math.floor(b[2] / CELL); gx++) for (let gy = Math.floor(b[1] / CELL); gy <= Math.floor(b[3] / CELL); gy++) {
          const k = gx * 4096 + gy; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
        }
      });
      return grid;
    };
    const arcBox = arcs.map(a => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < a.length; i += 2) { if (a[i] < x0) x0 = a[i]; if (a[i] > x1) x1 = a[i]; if (a[i + 1] < y0) y0 = a[i + 1]; if (a[i + 1] > y1) y1 = a[i + 1]; }
      return [x0, y0, x1, y1];
    });
    const grid = index(provs.map(p => p.box)), arcGrid = index(arcBox);
    // ids whose boxes touch a world rectangle
    const query = (g, boxes, x0, y0, x1, y1) => {
      const out = new Set();
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
        const l = g.get(gx * 4096 + gy); if (!l) continue;
        for (const i of l) { const b = boxes[i]; if (b[0] <= x1 && b[2] >= x0 && b[1] <= y1 && b[3] >= y0) out.add(i); }
      }
      return out;
    };
    const inRings = (rings, x, y) => {
      let inside = false;
      for (const r of rings) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const yi = r[i + 1], yj = r[j + 1];
        if ((yi > y) !== (yj > y) && x < (r[j] - r[i]) * (y - yi) / (yj - yi) + r[i]) inside = !inside;
      }
      return inside;
    };
    const provBoxes = provs.map(p => p.box);
    const geo = {
      arcs, users: users.map(u => [...new Set(u)]), provs, grid, arcGrid, arcBox, CELL, W: 360 * WU, H: (top - miller(data.latMin)) * WU, X, Y,
      lon: x => x / WU - 180,
      lat: y => { const m = top - y / WU; return (Math.atan(Math.exp(m / 1.25 / R2D)) - Math.PI / 4) / 0.4 * R2D; },
      provsIn: (x0, y0, x1, y1) => query(grid, provBoxes, x0, y0, x1, y1),
      arcsIn: (x0, y0, x1, y1) => query(arcGrid, arcBox, x0, y0, x1, y1),
      // province under a world point, or -1 for sea
      at(x, y, hint) {
        if (hint != null && hint >= 0) { const b = provs[hint].box; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inRings(provs[hint].rings, x, y)) return hint; }
        const l = grid.get(Math.floor(x / CELL) * 4096 + Math.floor(y / CELL));
        if (l) for (const i of l) { const b = provs[i].box; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inRings(provs[i].rings, x, y)) return i; }
        return -1;
      },
      locate(lon, lat, hint) { return geo.at(X(lon), Y(lat), hint); }
    };
    data._geo = geo;
    return geo;
  }
  function arcPath(geo, list) {
    const p = new Path2D();
    for (const k of list) { const a = geo.arcs[k]; p.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]); }
    return p;
  }

  // ================================================================ off-main-thread tile rendering
  // Tile painting (vector provinces + relief per 256px tile) is the most expensive thing the
  // map does — 15-70ms per tile at mid zoom, which blows frame budgets during zooms. It runs
  // in Web Worker painters on OffscreenCanvases instead, and the main thread only composites
  // finished tiles. tilePainter() is the single implementation: it runs unchanged in a worker
  // (source stringified below), and synchronously on the main thread as the fallback path.
  // A snapshot of the decoded geometry (no Path2D, plain typed arrays) is transferred to each
  // worker once at boot; the tile state (ownership, colours, war pairs) is rebuilt whenever
  // `version` changes.
  function geoPacket(geo) {
    const arcs = geo.arcs.map(a => a.slice());                       // fresh copies: safe to transfer
    const transfer = [];
    for (const a of arcs) transfer.push(a.buffer);
    const provs = geo.provs.map(p => {
      const g = p.rings.map(r => r.slice());
      for (const r of g) transfer.push(r.buffer);
      return { g };
    });
    return { arcs, provs, users: geo.users.map(u => u.slice()), W: geo.W, H: geo.H, transfer };
  }
  function statePack(g) {
    const wars = new Set();
    for (let a = 0; a < g.nations.length; a++) {
      if (!g.nations[a].alive) continue;
      for (let b = a + 1; b < g.nations.length; b++) if (root.World.atWar(g, a, b)) wars.add(a * 512 + b);
    }
    return { owner: g.owner, ctrl: g.ctrl, colors: g.nations.map(n => n.color), wars };
  }
  function wDecode(pkt) {
    // worker side of prepare(): rebuild paintable paths and the spatial index from a packet
    const CELL = 60;
    const index = boxes => {
      const grid = new Map();
      boxes.forEach((b, i) => {
        for (let gx = Math.floor(b[0] / CELL); gx <= Math.floor(b[2] / CELL); gx++) for (let gy = Math.floor(b[1] / CELL); gy <= Math.floor(b[3] / CELL); gy++) {
          const k = gx * 4096 + gy; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
        }
      });
      return grid;
    };
    const provs = pkt.provs.map(p => {
      const path = new Path2D();
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const r of p.g) {
        for (let k = 0; k < r.length; k += 2) {
          const x = r[k], y = r[k + 1];
          if (k) path.lineTo(x, y); else path.moveTo(x, y);
          if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        }
        path.closePath();
      }
      return { path, rings: p.g, box: [minx, miny, maxx, maxy] };
    });
    const arcBox = pkt.arcs.map(a => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < a.length; i += 2) { if (a[i] < x0) x0 = a[i]; if (a[i] > x1) x1 = a[i]; if (a[i + 1] < y0) y0 = a[i + 1]; if (a[i + 1] > y1) y1 = a[i + 1]; }
      return [x0, y0, x1, y1];
    });
    const arcGrid = index(arcBox), provBoxes = provs.map(p => p.box), grid = index(provBoxes);
    const query = (g, boxes, x0, y0, x1, y1) => {
      const out = new Set();
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
        const l = g.get(gx * 4096 + gy); if (!l) continue;
        for (const i of l) { const b = boxes[i]; if (b[0] <= x1 && b[2] >= x0 && b[1] <= y1 && b[3] >= y0) out.add(i); }
      }
      return out;
    };
    return { W: pkt.W, H: pkt.H, arcs: pkt.arcs, provs, users: pkt.users, provsIn: (x0, y0, x1, y1) => query(grid, provBoxes, x0, y0, x1, y1), arcsIn: (x0, y0, x1, y1) => query(arcGrid, arcBox, x0, y0, x1, y1) };
  }
  function tilePainter(env, job) {
    const geo = env.geo, ST = env.state, TS = env.ts, ctx = job.cv.getContext('2d');
    const sc = env.s0 * 2 ** job.L, tw = TS / sc;
    const x0 = job.tx * tw, y0 = job.ty * tw, x1 = x0 + tw, y1 = y0 + tw;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a2c3d'; ctx.fillRect(0, 0, TS, TS);
    ctx.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
    const img = env.relief;
    if (img && img.complete !== false && (img.naturalWidth || img.width)) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const kx = iw / geo.W, ky = ih / geo.H;
      const rx0 = Math.max(0, x0), ry0 = Math.max(0, y0), rx1 = Math.min(geo.W, x1), ry1 = Math.min(geo.H, y1);
      if (rx1 > rx0 && ry1 > ry0) {
        // fade the relief out as it is stretched past what the picture can show: political colour and borders take over
        const over = sc / job.dpr / (iw / geo.W);
        const alpha = over <= 1.6 ? 1 : Math.max(0.22, 1 - (over - 1.6) / 4);
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, rx0 * kx, ry0 * ky, (rx1 - rx0) * kx, (ry1 - ry0) * ky, rx0, ry0, rx1 - rx0, ry1 - ry0);
        ctx.globalAlpha = 1;
      }
    }
    const pad = 1 / sc;
    const ids = geo.provsIn(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
    // deepen the sea so land stands out
    const sea = new Path2D(); sea.rect(x0 - pad, y0 - pad, tw + 2 * pad, tw + 2 * pad);
    for (const i of ids) sea.addPath(geo.provs[i].path);
    ctx.fillStyle = 'rgba(12,28,46,0.5)'; ctx.fill(sea, 'evenodd');
    // nation colours over the terrain; occupied land striped in the occupier's colour
    const byOwner = new Map(), occ = new Map();
    for (const i of ids) {
      const o = ST.owner[i]; if (o < 0) continue;
      let p = byOwner.get(o); if (!p) byOwner.set(o, p = new Path2D()); p.addPath(geo.provs[i].path);
      const ct = ST.ctrl[i];
      if (ct >= 0 && ct !== o) { let q = occ.get(ct); if (!q) occ.set(ct, q = new Path2D()); q.addPath(geo.provs[i].path); }
    }
    ctx.globalAlpha = 0.58;
    for (const [o, p] of byOwner) { ctx.fillStyle = ST.colors[o]; ctx.fill(p); }
    ctx.globalAlpha = 0.85;
    for (const [o, p] of occ) { ctx.fillStyle = stripes(ctx, ST.colors[o], sc / job.dpr); ctx.fill(p); }
    ctx.globalAlpha = 1;
    // borders by kind
    const nation = [], prov = [], coast = [], front = [];
    for (const k of geo.arcsIn(x0 - pad, y0 - pad, x1 + pad, y1 + pad)) {
      const u = geo.users[k];
      if (u.length < 2) { coast.push(k); continue; }
      const a = u[0], b = u[1];
      if (ST.owner[a] !== ST.owner[b]) nation.push(k); else prov.push(k);
      const ca = ST.ctrl[a], cb = ST.ctrl[b];
      if (ca >= 0 && cb >= 0 && ca !== cb && ST.wars.has(Math.min(ca, cb) * 512 + Math.max(ca, cb))) front.push(k);
    }
    // widths in screen px; tiles are shown at 50-100% of their native size, so draw lines a bit heavier
    const z = sc / job.dpr, px = w => w * 1.3 / z;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (z > 0.9 && prov.length) { ctx.strokeStyle = `rgba(20,16,10,${Math.min(0.45, (z - 0.9) * 0.4)})`; ctx.lineWidth = px(0.8); ctx.stroke(arcPath(geo, prov)); }
    if (coast.length) { ctx.strokeStyle = 'rgba(15,25,35,0.75)'; ctx.lineWidth = px(1); ctx.stroke(arcPath(geo, coast)); }
    if (nation.length) {
      const p = arcPath(geo, nation);
      ctx.strokeStyle = 'rgba(18,12,8,0.9)'; ctx.lineWidth = px(Math.max(1.4, Math.min(3.2, z * 0.9))); ctx.stroke(p);
      ctx.strokeStyle = 'rgba(255,240,220,0.22)'; ctx.lineWidth = px(0.6); ctx.stroke(p);
    }
    if (front.length && job.front) {
      const p = arcPath(geo, front);
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = px(4.5); ctx.stroke(p);
      ctx.strokeStyle = '#ff5145'; ctx.lineWidth = px(2.6); ctx.stroke(p);
    }
  }
  function workerSource() {
    // assemble the painter bundle: every function is closure-free, so its source is portable
    return `'use strict';
let GEO = null, STATE = null, TSZ = 256, CP = [];
${wDecode.toString()}
${arcPath.toString()}
${stripes.toString()}
${tilePainter.toString()}
onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    GEO = wDecode(m.geo); GEO.ts = m.ts; GEO.s0 = m.s0; GEO.relief = m.relief || null;
    TSZ = m.ts;
    postMessage({ t: 'ready' });
  } else if (m.t === 'state') {
    STATE = { owner: m.owner, ctrl: m.ctrl, colors: m.colors, wars: m.wars };
  } else if (m.t === 'job') {
    // paint on a canvas owned by the worker (a canvas with a context can't be transferred),
    // then hand the finished pixels over as a transferable ImageBitmap
    let cv = CP.pop(); if (!cv) cv = new OffscreenCanvas(TSZ, TSZ);
    m.cv = cv;
    tilePainter({ geo: GEO, state: STATE, ts: GEO.ts, s0: GEO.s0, relief: GEO.relief }, m);
    postMessage({ t: 'done', k: m.k, ver: m.ver, bmp: cv.transferToImageBitmap() }, []);
  }
}`;
  }

  class WorldMap {
    constructor(canvas, data, opts) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.data = data; this.opts = opts;
      this.geo = prepare(data);
      this.W = this.geo.W; this.H = this.geo.H;
      this.cam = { x: 0, y: 0, z: 1 };
      this.anim = null; this.wheel = null;
      this.tiles = new Map(); this.pool = []; this.cacheCap = 256;
      this.wq = []; this.wks = null; this.wInit = false; this.statePktVer = -1; this.mEnv = null; this.mEnvVer = -1;
      this.bootWorkers();
      this.version = 0; this.labelsDirty = true; this.labelsAt = 0;
      this.hit = document.createElement('canvas').getContext('2d');
      this.textW = new Map();
      const img = relief(); if (!img.complete) img.addEventListener('load', () => this.paint(), { once: true });
      this.bindInput();
    }

    // ---------------------------------------------------------------- invalidation
    // Everything changed (a war, a peace, a new game): redraw all tiles, keeping the old ones on screen meanwhile.
    paint() { for (const t of this.tiles.values()) t.dirty = true; this.labelsDirty = true; this.version++; }
    // Only these provinces changed hands.
    invalidate(list) {
      if (!list.length) return;
      const pad = 2, boxes = list.map(p => this.geo.provs[p].box);
      for (const t of this.tiles.values()) {
        if (t.dirty) continue;
        for (const b of boxes) if (b[0] - pad <= t.x1 && b[2] + pad >= t.x0 && b[1] - pad <= t.y1 && b[3] + pad >= t.y0) { t.dirty = true; break; }
      }
      this.labelsDirty = true; this.version++;
    }
    computeLabels() {
      const g = this.opts.state(), data = this.data, geo = this.geo, out = [];
      const byNation = new Map();
      g.owner.forEach((o, i) => { if (o >= 0) { if (!byNation.has(o)) byNation.set(o, []); byNation.get(o).push(i); } });
      for (const [n, list] of byNation) {
        if (!g.nations[n].alive) continue;
        // the largest connected block of the nation's provinces
        const inSet = new Set(list), seen = new Set();
        let best = null, ba = 0;
        for (const s of list) {
          if (seen.has(s)) continue;
          const comp = [], q = [s]; seen.add(s);
          while (q.length) { const p = q.pop(); comp.push(p); for (const x of data.provinces[p].nb) if (inSet.has(x) && !seen.has(x)) { seen.add(x); q.push(x); } }
          const area = comp.reduce((t, p) => t + data.provinces[p].a, 0);
          if (area > ba) { ba = area; best = comp; }
        }
        // centre and main axis (weighted by area)
        let sw = 0, mx = 0, my = 0;
        for (const p of best) { const w = data.provinces[p].a + 2; sw += w; mx += geo.provs[p].lx * w; my += geo.provs[p].ly * w; }
        mx /= sw; my /= sw;
        let sxx = 0, syy = 0, sxy = 0;
        for (const p of best) { const w = data.provinces[p].a + 2, dx = geo.provs[p].lx - mx, dy = geo.provs[p].ly - my; sxx += w * dx * dx; syy += w * dy * dy; sxy += w * dx * dy; }
        let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        ang = Math.max(-0.5, Math.min(0.5, ang));
        let lo = Infinity, hi = -Infinity;
        for (const p of best) { const [a, b, c, d] = geo.provs[p].box; for (const [x, y] of [[a, b], [c, d], [a, d], [c, b]]) { const t = (x - mx) * Math.cos(ang) + (y - my) * Math.sin(ang); lo = Math.min(lo, t); hi = Math.max(hi, t); } }
        const len = Math.max(5, (hi - lo) * 0.62);
        out.push({ n, x: mx, y: my, ang, len, area: ba });
      }
      return out;
    }

    // ---------------------------------------------------------------- camera
    resize() {
      const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      this.sw = r.width; this.sh = r.height; this.dpr = dpr;
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.anim = null; this.wheel = null;
      // tile cache bound: enough for the largest possible single view at this size, never fewer than 256
      this.cacheCap = Math.max(256, (Math.ceil(this.sw * dpr / TS) + 2) * (Math.ceil(this.sh * dpr / TS) + 2) + 160);
      this.clamp();
    }
    fitZ() { return Math.min(this.sw / this.W, this.sh / this.H); }
    clamp() {
      const c = this.cam, zmin = this.fitZ();
      c.z = Math.max(zmin, Math.min(MAXZ, c.z));
      const vw = this.sw / c.z, vh = this.sh / c.z;
      c.x = vw >= this.W ? (this.W - vw) / 2 : Math.max(0, Math.min(this.W - vw, c.x));
      c.y = vh >= this.H ? (this.H - vh) / 2 : Math.max(0, Math.min(this.H - vh, c.y));
    }
    focus(p, z) { const pr = this.geo.provs[p]; this.focusAt(pr.lx, pr.ly, z); }
    // Animate to a world point at a zoom level (buttery fly-to used by map clicks and "show" buttons).
    flyTo(x, y, z, ms) {
      z = Math.max(this.fitZ(), Math.min(MAXZ, z || this.cam.z));
      const vw = this.sw / z, vh = this.sh / z;
      const tx = vw >= this.W ? (this.W - vw) / 2 : Math.max(0, Math.min(this.W - vw, x - vw / 2));
      const ty = vh >= this.H ? (this.H - vh) / 2 : Math.max(0, Math.min(this.H - vh, y - vh / 2));
      this.anim = { t0: performance.now(), ms: ms || 480, from: { ...this.cam }, to: { x: tx, y: ty, z } };
      this.wheel = null;
    }
    focusAt(x, y, z) { this.flyTo(x, y, z, Math.min(650, 380 + Math.abs(Math.log2((z || 2.6) / this.cam.z)) * 180)); }
    toW(sx, sy) { return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y }; }
    toS(x, y) { return [(x - this.cam.x) * this.cam.z, (y - this.cam.y) * this.cam.z]; }
    // screen position of a lon/lat point
    llS(lon, lat) { return this.toS(this.geo.X(lon), this.geo.Y(lat)); }
    lonLatAt(sx, sy) { const w = this.toW(sx, sy); return [this.geo.lon(w.x), this.geo.lat(w.y)]; }
    provAt(sx, sy) { const w = this.toW(sx, sy); return this.geo.at(w.x, w.y); }
    // Wheel zoom: the event sets a target zoom, draw() eases the camera toward it — smooth instead of instant jumps.
    zoomAt(sx, sy, f) {
      const zmin = this.fitZ();
      const cur = this.wheel ? this.wheel.zt : this.cam.z;
      const zt = Math.max(zmin, Math.min(MAXZ, cur * f));
      if (Math.abs(zt / this.cam.z - 1) < 0.002 && !this.wheel) return;
      this.anim = null;
      // anchor: keep the world point under the cursor under the cursor while the ease plays out
      const w = this.toW(sx, sy);
      this.wheel = { zt, sx, sy, w, t: 0 };
    }
    // Advance eased wheel zoom / fly-to. Called once per frame from draw().
    stepCamera(now) {
      if (this.anim) {
        const a = this.anim, t = Math.min(1, (now - a.t0) / a.ms);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        this.cam.z = a.from.z + (a.to.z - a.from.z) * e;
        this.cam.x = a.from.x + (a.to.x - a.from.x) * e;
        this.cam.y = a.from.y + (a.to.y - a.from.y) * e;
        this.clamp();
        if (t >= 1) { if (Math.abs(a.to.z / this.cam.z - 1) < 0.002) { this.cam.x = a.to.x; this.cam.y = a.to.y; this.cam.z = a.to.z; } this.anim = null; }
        this.interacting = true; this.lastInput = now;
      } else if (this.wheel && this.wheel.zt !== this.cam.z) {
        const w = this.wheel;
        const dt = Math.min(64, now - (w.t || now)); w.t = now;
        const nz = this.cam.z + (w.zt - this.cam.z) * (1 - Math.exp(-dt / 75));
        this.cam.z = nz; this.clamp();
        this.cam.x = w.w.x - w.sx / this.cam.z; this.cam.y = w.w.y - w.sy / this.cam.z;
        this.clamp();
        if (Math.abs(w.zt / this.cam.z - 1) < 0.003) { const zt = w.zt, sx = w.sx, sy = w.sy, pw = w.w; this.wheel = null; this.cam.z = zt; this.clamp(); this.cam.x = pw.x - sx / zt; this.cam.y = pw.y - sy / zt; this.clamp(); }
        this.interacting = true; this.lastInput = now;
      }
    }
    unitSize() { return Math.min(34, this.cam.z * 7); }

    // ---------------------------------------------------------------- tiles
    renderTile(t) {
      // synchronous tile paint — the fallback when worker painters are unavailable.
      // A tile painted by a worker holds an ImageBitmap, which has no 2d context: swap in a canvas.
      if (!t.cv || typeof t.cv.getContext !== 'function') {
        const cv = this.pool.pop() || document.createElement('canvas');
        cv.width = cv.height = TS;
        cv.getContext('2d').drawImage(t.cv, 0, 0, TS, TS);
        if (t.cv && t.cv.close) t.cv.close();
        t.cv = cv;
      }
      tilePainter(this.mainEnv(), { L: t.L, tx: t.tx, ty: t.ty, cv: t.cv, dpr: this.dpr, front: this.opts.showFront !== false });
      if (!t.ready) t.shownAt = performance.now();
      t.dirty = false; t.ready = true;
    }

    // ---------------------------------------------------------------- worker painters
    // Workers paint tiles onto OffscreenCanvases and transfer them back; drawTiles() only
    // composites finished tiles, so motion is never blocked by tile painting.
    bootWorkers() {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
      try {
        const url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
        let n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
        this.wks = [];
        while (n--) this.wks.push(this.mkWorker(url));
        URL.revokeObjectURL(url);
        this.bootRelief();
      } catch (e) { this.wks = null; }
    }
    mkWorker(url) {
      const entry = { w: new Worker(url), busy: false };
      entry.w.onmessage = e => this.onWorkerMsg(entry, e.data);
      entry.w.onerror = err => { console.error('tile worker:', err.message || 'unknown worker error'); this.killWorkers(); };
      return entry;
    }
    bootRelief() {
      const img = relief();
      const go = () => {
        if (!this.wks) return;
        createImageBitmap(img).then(bmp => {
          if (!this.wks) return;
          for (const e of this.wks) {
            try {
              const pkt = geoPacket(this.geo);                 // fresh copies per worker: safe to transfer
              e.w.postMessage({ t: 'init', geo: pkt, relief: bmp, ts: TS, s0: S0 }, pkt.transfer);
            } catch (err) { console.error('tile worker init:', String(err).slice(0, 200)); }
          }
          this.wInit = true;
          this.deliver();
        }).catch(err => { console.error('tile worker boot:', String(err).slice(0, 300)); this.killWorkers(); });
      };
      if (img.complete && img.naturalWidth) go();
      else img.addEventListener('load', go, { once: true });
    }
    killWorkers() {
      if (this.wks) for (const e of this.wks) { try { e.w.terminate(); } catch (er) { } }
      this.wks = null; this.wInit = false; this.wq.length = 0;
      for (const t of this.tiles.values()) { t.fly = false; t.q = false; }   // the sync path takes over
    }
    onWorkerMsg(entry, m) {
      entry.busy = false;
      const t = m.k != null ? this.tiles.get(m.k) : null;
      if (t && m.ver === this.version) {
        if (!t.ready) t.shownAt = performance.now();
        if (t.cv && typeof t.cv.getContext === 'function' && this.pool.length < 24) this.pool.push(t.cv);
        t.cv = m.bmp; t.dirty = false; t.ready = true; t.fly = false;
      } else {
        if (t) t.fly = false;                              // stale content: let the tile be re-enqueued
        if (m.bmp && m.bmp.close) m.bmp.close();           // stale pixels: release them
      }
      this.deliver();
    }
    deliver() {
      // send queued jobs to idle painters, until every worker is busy or the queue is empty
      if (!this.workersActive()) return;
      while (this.wq.length) {
        const e = this.wks.find(x => !x.busy);
        if (!e) return;
        const t = this.wq.shift();
        t.q = false;
        if (this.tiles.get(t.k) !== t) continue;           // evicted meanwhile
        if (this.statePktVer !== this.version) {           // game state changed: brief the painters
          const s = statePack(this.opts.state());
          for (const x of this.wks) x.w.postMessage({ t: 'state', ver: this.version, owner: s.owner, ctrl: s.ctrl, colors: s.colors, wars: s.wars });
          this.statePktVer = this.version;
        }
        e.busy = true;
        e.w.postMessage({ t: 'job', k: t.k, L: t.L, tx: t.tx, ty: t.ty, ver: this.version, dpr: this.dpr, front: this.opts.showFront !== false });
      }
    }
    enqueue(list) {
      for (const t of list) if (!t.q && !t.fly) { t.q = true; this.wq.push(t); }
      while (this.wq.length > 240) { const s = this.wq.pop(); s.q = false; }   // bound stale work during fast motion
      this.deliver();
    }
    workersActive() { return this.wks && this.wInit; }
    mainEnv() {
      if (this.mEnvVer !== this.version) {
        this.mEnv = { geo: this.geo, state: statePack(this.opts.state()), ts: TS, s0: S0, relief: relief() };
        this.mEnvVer = this.version;
      }
      return this.mEnv;
    }
    dispose() {
      this.killWorkers();
      this.tiles.clear(); this.pool.length = 0;
    }
    tile(L, tx, ty, create) {
      const k = L * 1e8 + tx * 1e4 + ty;
      let t = this.tiles.get(k);
      if (t) { this.tiles.delete(k); this.tiles.set(k, t); return t; }      // keep recently used tiles last
      if (!create) return null;
      const tw = TS / (S0 * 2 ** L);
      let cv = this.pool.pop();
      if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = TS; }
      t = { k, L, tx, ty, cv, x0: tx * tw, y0: ty * tw, x1: (tx + 1) * tw, y1: (ty + 1) * tw, dirty: true, ready: false, q: false, fly: false, shownAt: 0 };
      this.tiles.set(k, t);
      return t;
    }
    // Shrink the tile cache, oldest (least recently used) first. Only ever called before a
    // frame's tile list is built or after a frame is drawn — evicting mid-frame would recycle
    // a canvas that the draw list still references, leaving stale content in the wrong place.
    trimTiles(maxKeep, keep) {
      for (const [k, t] of this.tiles) {
        if (this.tiles.size <= maxKeep) break;
        if (keep && keep.has(t)) continue;
        this.tiles.delete(k); this.pool.push(t.cv);
      }
      if (this.pool.length > this.cacheCap) this.pool.length = this.cacheCap;   // canvases beyond the bound go to the GC
    }
    // Nearest drawn tile above this one, for a blurry stand-in while it renders.
    // Skip over-distant ancestors: a stand-in taken from a many-times-larger tile stretches
    // a few source pixels across the whole viewport (the "phantom mini map" artifact).
    ancestor(L, tx, ty) {
      for (let l = L - 1; l >= 0; l--) {
        const f = 2 ** (L - l), t = this.tile(l, Math.floor(tx / f), Math.floor(ty / f), false);
        if (t && t.ready) return f > 16 ? null : { t, f, sx: (tx - Math.floor(tx / f) * f) * TS / f, sy: (ty - Math.floor(ty / f) * f) * TS / f };
      }
      return null;
    }
    drawTiles(ctx, now) {
      const { cam, dpr } = this, sc = cam.z * dpr;
      const L = Math.max(0, Math.min(MAXL, Math.ceil(Math.log2(sc / S0) - 0.05)));
      const tw = TS / (S0 * 2 ** L);
      const nx = Math.ceil(this.W / tw), ny = Math.ceil(this.H / tw);
      const tx0 = Math.max(0, Math.floor(cam.x / tw)), ty0 = Math.max(0, Math.floor(cam.y / tw));
      const tx1 = Math.min(nx - 1, Math.floor((cam.x + this.sw / cam.z) / tw)), ty1 = Math.min(ny - 1, Math.floor((cam.y + this.sh / cam.z) / tw));
      // the whole-world level always exists as the last-resort stand-in
      const need = [];
      for (let x = 0; x < Math.ceil(this.W / TS * S0); x++) for (let y = 0; y < Math.ceil(this.H / TS * S0); y++) { const t = this.tile(0, x, y, true); if (!t.ready || t.dirty) need.push(t); }
      const vis = [];
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const t = this.tile(L, tx, ty, true); vis.push(t); if (!t.ready || t.dirty) need.push(t); }
      // render missing tiles first (nearest the centre), then stale ones, within a time budget
      const cx = cam.x + this.sw / cam.z / 2, cy = cam.y + this.sh / cam.z / 2;
      need.sort((a, b) => (a.ready - b.ready) || (a.L - b.L) * 0 || (((a.x0 + a.x1) / 2 - cx) ** 2 + ((a.y0 + a.y1) / 2 - cy) ** 2) - (((b.x0 + b.x1) / 2 - cx) ** 2 + ((b.y0 + b.y1) / 2 - cy) ** 2));
      // while the view is moving, show stand-ins (a blurry parent tile) and only draw what has nothing to show at all;
      // blank bursts are capped per frame so a zoom across a level boundary can't eat the budget
      const moving = this.interacting && now - this.lastInput < 180, t0 = performance.now();
      let rendered = 0;
      if (this.workersActive()) {
        // painters run off the main thread: hand every needed tile over and composite
        // whatever has finished — the frame itself never blocks on tile painting
        for (const t of need) if (!t.q && !t.fly) { t.q = true; this.wq.push(t); }
        while (this.wq.length > 240) { const s = this.wq.pop(); s.q = false; }
        this.deliver();
      } else {
        let blanks = 0;
        for (const t of need) {
          const blank = !t.ready && (t.L === 0 || !this.ancestor(t.L, t.tx, t.ty));
          if (moving) {
            if (!blank) continue;                       // stand-ins carry the frame; paint when still
            if (blanks++ >= 2) { if (rendered) break; continue; }
          } else if (rendered && performance.now() - t0 > 8) continue;
          this.renderTile(t); rendered++;
        }
      }
      ctx.imageSmoothingEnabled = true;
      // Whole-world base under everything: while sharper tiles stream in (or after a repaint)
      // the map can never fall back to bare ocean-blue — no blank flash.
      const W2 = this.cv.width, H2 = this.cv.height;
      for (const t of this.tiles.values()) {
        if (t.L !== 0 || !t.ready) continue;
        const dx = (t.x0 - cam.x) * sc, dy = (t.y0 - cam.y) * sc, w = (t.x1 - t.x0) * sc, h = (t.y1 - t.y0) * sc;
        if (dx > W2 || dy > H2 || dx + w < 0 || dy + h < 0) continue;
        ctx.drawImage(t.cv, dx, dy, w, h);
      }
      // Tiles are placed at their exact sub-pixel rect (not snapped to whole device pixels):
      // slow pans glide instead of stepping, and neighbouring tiles always meet on one edge.
      const FADE = 130;
      for (const t of vis) {
        const dx = (t.x0 - cam.x) * sc, dy = (t.y0 - cam.y) * sc;
        const w = (t.x1 - t.x0) * sc + 0.5, h = (t.y1 - t.y0) * sc + 0.5;   // +0.5 hides sampling seams
        if (t.ready) {
          // a freshly painted tile cross-fades over its blurry stand-in instead of popping
          const age = t.shownAt ? now - t.shownAt : FADE;
          if (age < FADE) {
            const a = this.ancestor(t.L, t.tx, t.ty);
            if (a) ctx.drawImage(a.t.cv, a.sx, a.sy, TS / a.f, TS / a.f, dx, dy, w, h);
            ctx.globalAlpha = age / FADE;
          }
          ctx.drawImage(t.cv, dx, dy, w, h);
          if (age < FADE) ctx.globalAlpha = 1;
        } else {
          const a = this.ancestor(t.L, t.tx, t.ty);
          if (a) ctx.drawImage(a.t.cv, a.sx, a.sy, TS / a.f, TS / a.f, dx, dy, w, h);
        }
      }
      // idle prefetch: warm the tiles the user is about to see, so panning and zooming never
      // starts cold. The level above and below the current one around the centre, and the ring
      // of tiles just past the view edge on this level — budgeted so it never competes with real work.
      if (!moving && now - this.lastInput > 280 && !need.length) {
        const t1 = performance.now(), cand = [];
        const viewW = this.sw / cam.z, viewH = this.sh / cam.z;
        const pick = (l, x0, y0, x1, y1, cap) => {
          const l2 = Math.max(0, Math.min(MAXL, l));
          if (l2 !== l) return;
          const w2 = TS / (S0 * 2 ** l2), n2x = Math.ceil(this.W / w2), n2y = Math.ceil(this.H / w2);
          const a0 = Math.max(0, Math.floor(x0 / w2)), b0 = Math.max(0, Math.floor(y0 / w2));
          const a1 = Math.min(n2x - 1, Math.floor(x1 / w2)), b1 = Math.min(n2y - 1, Math.floor(y1 / w2));
          for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
            const t = this.tile(l2, a, b, true);
            if (!t.ready || t.dirty) cand.push(t);
            if (cand.length >= cap) return;
          }
        };
        pick(L + 1, cam.x + viewW * 0.2, cam.y + viewH * 0.2, cam.x + viewW * 0.8, cam.y + viewH * 0.8, 40);   // closer zoom-in
        pick(L - 1, cam.x - viewW * 0.25, cam.y - viewH * 0.25, cam.x + viewW * 1.25, cam.y + viewH * 1.25, 40);  // zoom-out reserve
        pick(L, Math.max(0, cam.x - viewW * 0.15), Math.max(0, cam.y - viewH * 0.15), cam.x + viewW * 1.15, cam.y + viewH * 1.15, 40);  // pan ring
        if (this.tiles.size > this.cacheCap - 24) cand.length = 0;   // no room: painting it would evict it again
        if (this.workersActive()) this.enqueue(cand);
        else for (const t of cand) { if (performance.now() - t1 > 8) break; this.renderTile(t); }
      }
      this.trimTiles(this.cacheCap);   // back to the working bound once nothing holds tile references
    }

    // ---------------------------------------------------------------- labels (drawn every frame, on top of the tiles)
    textWidth(c, s) { let w = this.textW.get(s); if (w == null) { c.font = '500 10px "Source Serif 4", Georgia, serif'; w = c.measureText(s).width / 10; this.textW.set(s, w); } return w; }
    drawLabels(c, now) {
      const g = this.opts.state(), { cam, geo, data } = this, z = cam.z;
      if (this.labelsDirty && now - this.labelsAt > 1200) { this.labels = this.computeLabels(); this.labelsDirty = false; this.labelsAt = now; }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const x0 = cam.x, y0 = cam.y, x1 = cam.x + this.sw / z, y1 = cam.y + this.sh / z;
      // province names when zoomed in
      if (z > 3.2) {
        const fs = Math.min(15, 6 + z * 0.9);
        c.font = `500 ${fs}px "Source Serif 4", Georgia, serif`;
        c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,250,240,0.55)'; c.fillStyle = 'rgba(30,24,16,0.85)';
        for (const i of geo.provsIn(x0, y0, x1, y1)) {
          const pr = geo.provs[i], name = data.provinces[i].n;
          if ((pr.box[2] - pr.box[0]) * z < this.textWidth(c, name) * fs * 0.9) continue;
          const [x, y] = this.toS(pr.lx, pr.ly);
          c.strokeText(name, x, y + fs * 0.9); c.fillText(name, x, y + fs * 0.9);
        }
      }
      // capitals
      for (const n of g.nations) {
        if (!n.alive || (z < 0.8 && !n.great)) continue;
        const pr = geo.provs[n.cap], [x, y] = this.toS(pr.lx, pr.ly);
        if (x < -10 || y < -10 || x > this.sw + 10 || y > this.sh + 10) continue;
        star(c, x, y, Math.min(8, 3 + z * 0.8), Math.min(3.4, 1.3 + z * 0.35), '#fff7e0', 'rgba(20,10,0,.8)');
      }
      // nation names, along the country's main axis
      for (const L of this.labels || []) {
        const n = g.nations[L.n]; if (!n.alive) continue;
        const name = n.name.toUpperCase();
        let fs = L.len * z / (name.length * 0.72 + 1);
        fs = Math.min(fs, 16 + Math.sqrt(L.area) * z * 0.05, 64);
        if (fs < 8.5) continue;
        const [x, y] = this.toS(L.x, L.y);
        if (x < -300 || y < -100 || x > this.sw + 300 || y > this.sh + 100) continue;
        c.save(); c.translate(x, y); c.rotate(L.ang);
        c.font = `600 ${fs}px "Source Serif 4", Georgia, serif`;
        if ('letterSpacing' in c) c.letterSpacing = `${Math.round(fs * 0.18)}px`;
        c.lineWidth = Math.max(2, fs / 7); c.strokeStyle = 'rgba(20,14,8,0.55)'; c.strokeText(name, 0, 0);
        c.fillStyle = 'rgba(255,248,232,0.92)'; c.fillText(name, 0, 0);
        if ('letterSpacing' in c) c.letterSpacing = '0px';
        c.restore();
      }
    }

    // ---------------------------------------------------------------- frame
    draw(now) {
      if (!this.sw) return;
      this.stepCamera(now);
      const { ctx, cam, geo } = this, z = cam.z;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1a2c3d'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      this.drawTiles(ctx, now);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawLabels(ctx, now);
      const t = now / 1000;
      // highlights
      const hl = this.opts.highlights();
      if (hl.length) {
        ctx.save(); ctx.translate(-cam.x * z, -cam.y * z); ctx.scale(z, z);
        for (const h of hl) {
          const p = geo.provs[h.p].path;
          if (h.fill) { ctx.fillStyle = h.fill; ctx.fill(p); }
          if (h.outline) { ctx.strokeStyle = h.outline; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); ctx.lineWidth = 2.5 / z; ctx.stroke(p); ctx.globalAlpha = 1; }
        }
        ctx.restore();
      }
      // generals' fronts
      for (const f of this.opts.fronts ? this.opts.fronts() : []) {
        ctx.save(); ctx.translate(-cam.x * z, -cam.y * z); ctx.scale(z, z);
        ctx.setLineDash(f.dash ? [8 / z, 5 / z] : []);
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 6 / z; ctx.stroke(f.path);
        ctx.strokeStyle = f.color; ctx.lineWidth = 3.5 / z; ctx.stroke(f.path);
        ctx.restore(); ctx.setLineDash([]);
        if (f.arrow) this.arrow(ctx, f.arrow[0], f.arrow[1], f.color);
      }
      // army routes
      const armies = this.opts.armies();
      for (const a of armies) {
        if (!a.route || !a.route.length || !a.showPath) continue;
        ctx.strokeStyle = a.pathColor || 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.2; ctx.setLineDash([6, 4]);
        ctx.beginPath();
        let [x0, y0] = this.llS(a.x, a.y); ctx.moveTo(x0, y0);
        let lx = x0, ly = y0, px = x0, py = y0;
        for (const q of a.route) { const [x, y] = this.llS(q[0], q[1]); ctx.lineTo(x, y); px = lx; py = ly; lx = x; ly = y; }
        ctx.stroke(); ctx.setLineDash([]);
        this.arrowHead(ctx, [px, py], [lx, ly], a.pathColor || '#fff');
      }
      // armies: they grow as you zoom in; ones sharing a spot are fanned out side by side
      const s = this.unitSize(), mini = s < 9, sp = mini ? 7 : s * 1.75;
      const spots = new Map();
      this.armyHits = [];
      for (const a of armies) {
        if (!a.always && (mini || z < 4)) continue;          // neutral armies only when zoomed in
        let [x, y] = this.llS(a.x, a.y);
        if (x < -50 || y < -50 || x > this.sw + 50 || y > this.sh + 50) continue;
        const k = Math.round(x / sp) + ':' + Math.round(y / (mini ? 6 : s));
        const n = spots.get(k) || 0; spots.set(k, n + 1);
        x += (n % 2 ? 1 : -1) * Math.ceil(n / 2) * sp;
        if (mini) {
          ctx.fillStyle = a.affil === 'friend' ? NS.FRIEND : a.affil === 'hostile' ? NS.HOSTILE : NS.NEUTRAL;
          ctx.strokeStyle = a.selected ? '#fff' : '#0b0f14'; ctx.lineWidth = a.selected ? 2 : 1;
          ctx.fillRect(x - 3.5, y - 2.5, 7, 5); ctx.strokeRect(x - 3.5, y - 2.5, 7, 5);
          this.armyHits.push({ a, x, y, r: 9 });
          continue;
        }
        ctx.globalAlpha = a.sea ? 0.75 : 1;
        if (a.genColor) { ctx.fillStyle = a.genColor; ctx.fillRect(x - s * 0.75, y + s * 0.5, s * 1.5, Math.max(2, s * 0.12)); }
        NS.drawUnit(ctx, x, y, s, a.type, { affil: a.affil, ech: a.ech, selected: a.selected });
        ctx.font = `700 ${Math.round(s * 0.55)}px "IBM Plex Mono", monospace`;
        const label = (a.sea ? '⚓ ' : '') + (a.div >= 10 ? Math.round(a.div) + '' : a.div.toFixed(1).replace(/\.0$/, ''));
        const tw = ctx.measureText(label).width + 6, by = y + s * (a.affil === 'hostile' ? 0.86 : 0.62) + 2;
        ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(x - tw / 2, by, tw, s * 0.62);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, x, by + 1); ctx.textBaseline = 'middle';
        if (a.org != null && a.org < 99) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x - s * 0.75, y - s * 0.62 - 5, s * 1.5, 3.5); ctx.fillStyle = a.org > 50 ? '#7fe08a' : a.org > 25 ? '#ffcf5a' : '#ff6a5f'; ctx.fillRect(x - s * 0.75, y - s * 0.62 - 5, s * 1.5 * a.org / 100, 3.5); }
        ctx.globalAlpha = 1;
        this.armyHits.push({ a, x, y, r: s });
      }
      // battles: crossed swords that pulse
      for (const b of this.opts.battles ? this.opts.battles() : []) {
        const [x, y] = this.llS(b.x, b.y), r = 7 + 2 * Math.sin(t * 6), off = Math.max(12, s * 0.9);
        ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x - r, y - r - off); ctx.lineTo(x + r, y + r - off); ctx.moveTo(x + r, y - r - off); ctx.lineTo(x - r, y + r - off); ctx.stroke();
        ctx.strokeStyle = b.mine ? '#ffcf5a' : '#ff8a66'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - r, y - r - off); ctx.lineTo(x + r, y + r - off); ctx.moveTo(x + r, y - r - off); ctx.lineTo(x - r, y + r - off); ctx.stroke();
      }
    }
    arrowHead(ctx, [lx, ly], [ex, ey], color) {
      const ang = Math.atan2(ey - ly, ex - lx);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 11 * Math.cos(ang - 0.45), ey - 11 * Math.sin(ang - 0.45)); ctx.lineTo(ex - 11 * Math.cos(ang + 0.45), ey - 11 * Math.sin(ang + 0.45)); ctx.fill();
    }
    arrow(ctx, from, to, color) {
      const a = this.toS(from[0], from[1]), b = this.toS(to[0], to[1]);
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(b[0] + 8 * Math.cos(ang), b[1] + 8 * Math.sin(ang)); ctx.lineTo(b[0] - 14 * Math.cos(ang - 0.6), b[1] - 14 * Math.sin(ang - 0.6)); ctx.lineTo(b[0] - 14 * Math.cos(ang + 0.6), b[1] - 14 * Math.sin(ang + 0.6)); ctx.fill();
    }
    // A border line between two nations (for generals' fronts).
    borderPath(a, b) {
      const g = this.opts.state(), list = [];
      this.geo.users.forEach((u, k) => {
        if (u.length < 2) return;
        const c0 = g.ctrl[u[0]], c1 = g.ctrl[u[1]];
        if ((c0 === a && c1 === b) || (c0 === b && c1 === a)) list.push(k);
      });
      return list.length ? arcPath(this.geo, list) : null;
    }

    armyAt(sx, sy) {
      let best = null, bd = Infinity;
      for (const h of this.armyHits || []) { const d = (h.x - sx) ** 2 + (h.y - sy) ** 2; if (d < (h.r * 1.1) ** 2 && d < bd) { bd = d; best = h.a; } }
      return best;
    }

    // ---------------------------------------------------------------- input
    bindInput() {
      const cv = this.cv, ptrs = new Map();
      let drag = null;
      const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const touch = () => { this.interacting = true; this.lastInput = performance.now(); };
      cv.addEventListener('pointerdown', e => {
        cv.setPointerCapture(e.pointerId);
        this.anim = null; this.wheel = null;          // touching the map takes over from any camera animation
        const p = pt(e); ptrs.set(e.pointerId, p);
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), z0: this.cam.z, mid: this.toW((a.x + b.x) / 2, (a.y + b.y) / 2) }; return; }
        drag = { start: p, cam0: { ...this.cam }, moved: false, button: e.button };
      });
      cv.addEventListener('pointermove', e => {
        const p = pt(e);
        if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
        if (!drag) { if (e.pointerType === 'mouse' && this.opts.onHover) this.opts.onHover(this.provAt(p.x, p.y), p, this.armyAt(p.x, p.y)); return; }
        if (drag.pinch && ptrs.size === 2) {
          const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          this.cam.z = drag.z0 * d / drag.d0; this.clamp();
          this.cam.x = drag.mid.x - (a.x + b.x) / 2 / this.cam.z; this.cam.y = drag.mid.y - (a.y + b.y) / 2 / this.cam.z; this.clamp(); touch(); return;
        }
        if (drag.pinch) return;
        if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.moved = true;
        if (drag.moved) {
          this.cam.x = drag.cam0.x - (p.x - drag.start.x) / this.cam.z; this.cam.y = drag.cam0.y - (p.y - drag.start.y) / this.cam.z;
          this.clamp(); touch(); cv.classList.add('grab');
        }
      });
      const up = e => {
        const p = pt(e); ptrs.delete(e.pointerId); cv.classList.remove('grab');
        if (!drag) return;
        const d = drag; if (d.pinch) { if (!ptrs.size) drag = null; return; }
        drag = null;
        if (!d.moved && e.type === 'pointerup') this.opts.onClick(this.provAt(p.x, p.y), { right: d.button === 2, shift: e.shiftKey, army: this.armyAt(p.x, p.y), ll: this.lonLatAt(p.x, p.y) });
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        const p = pt(e);
        const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);   // lines / pages → pixels
        this.zoomAt(p.x, p.y, Math.pow(1.0018, -dy));
        touch();
      }, { passive: false });
    }
  }

  // Diagonal stripes in a colour, sized in screen pixels. Closure-free so the painter can
  // run inside a Web Worker too (document.createElement is unavailable there).
  function stripes(ctx, color, z) {
    if (!stripes.cache) stripes.cache = new Map();
    let base = stripes.cache.get(color);
    if (!base) {
      base = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : new OffscreenCanvas(12, 12);
      base.width = base.height = 12;
      const c = base.getContext('2d');
      c.strokeStyle = color; c.lineWidth = 4.5;
      c.beginPath(); for (let k = -12; k <= 24; k += 12) { c.moveTo(k, 12); c.lineTo(k + 12, 0); } c.stroke();
      stripes.cache.set(color, base);
    }
    const pat = ctx.createPattern(base, 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / z));
    return pat;
  }
  function star(c, x, y, R, r, fill, stroke) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 1.2; c.strokeStyle = stroke; c.stroke();
  }

  // Small political map for the start screen.
  function renderPreview(cv, data, state) {
    const geo = prepare(data), c = cv.getContext('2d');
    const s = Math.max(cv.width / geo.W, cv.height / geo.H);
    c.fillStyle = '#16283a'; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.translate((cv.width - geo.W * s) / 2, (cv.height - geo.H * s) / 2 - 8); c.scale(s, s);
    const img = relief(); if (img.complete && img.naturalWidth) c.drawImage(img, 0, 0, geo.W, geo.H);
    c.globalAlpha = 0.62;
    state.owner.forEach((o, i) => { if (o >= 0) { c.fillStyle = state.nations[o].color; c.fill(geo.provs[i].path); } });
    c.globalAlpha = 1;
    c.restore();
    if (!img.complete) img.addEventListener('load', () => renderPreview(cv, data, state), { once: true });
  }

  root.WorldMap = WorldMap;
  root.WorldMap.renderPreview = renderPreview;
  root.WorldMap.prepare = prepare;
})(typeof window !== 'undefined' ? window : globalThis);
