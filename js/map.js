/* World map: vector provinces over a shaded-relief background, HOI4-style zoom. */
(function (root) {
  'use strict';
  const NS = root.NatoSymbols;
  const WU = 10;                                  // world units per degree of longitude
  const R2D = 180 / Math.PI;
  const miller = lat => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat / R2D)) * R2D;

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
      const path = new Path2D();
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const poly of p.g || []) for (const ring of poly) {
        let first = true;
        for (const ref of ring) {
          const a = arcs[ref >= 0 ? ref : ~ref], n = a.length / 2;
          users[ref >= 0 ? ref : ~ref].push(i);
          for (let k = 0; k < n; k++) {
            const j = ref >= 0 ? k : n - 1 - k, x = a[j * 2], y = a[j * 2 + 1];
            if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
            if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
          }
        }
        path.closePath();
      }
      return { path, box: [minx, miny, maxx, maxy], lx: X(p.x), ly: Y(p.y) };
    });
    // spatial index of province boxes for hit-testing
    const CELL = 60, grid = new Map();
    provs.forEach((p, i) => {
      const [a, b, c, d] = p.box;
      for (let gx = Math.floor(a / CELL); gx <= Math.floor(c / CELL); gx++) for (let gy = Math.floor(b / CELL); gy <= Math.floor(d / CELL); gy++) {
        const k = gx + ',' + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
      }
    });
    const land = new Path2D(); provs.forEach(p => land.addPath(p.path));
    data._geo = { arcs, users: users.map(u => [...new Set(u)]), provs, grid, CELL, land, W: 360 * WU, H: (top - miller(data.latMin)) * WU, X, Y };
    return data._geo;
  }
  function arcPath(geo, list) {
    const p = new Path2D();
    for (const k of list) { const a = geo.arcs[k]; p.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]); }
    return p;
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  class WorldMap {
    constructor(canvas, data, opts) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.data = data; this.opts = opts;
      this.geo = prepare(data);
      this.W = this.geo.W; this.H = this.geo.H;
      this.cam = { x: 0, y: 0, z: 1 };
      this.cache = document.createElement('canvas');
      this.cacheCam = null; this.version = 0; this.cacheVersion = -1;
      this.hit = document.createElement('canvas').getContext('2d');
      const img = relief(); if (!img.complete) img.addEventListener('load', () => { this.version++; }, { once: true });
      this.bindInput();
    }

    // ---------------------------------------------------------------- layers that depend on ownership
    paint() {
      const g = this.opts.state(), geo = this.geo;
      // fills: one path per owner, occupied provinces striped with the occupier's colour
      const byOwner = new Map(), occ = new Map();
      g.owner.forEach((o, i) => {
        if (o < 0) return;
        if (!byOwner.has(o)) byOwner.set(o, new Path2D());
        byOwner.get(o).addPath(geo.provs[i].path);
        const c = g.ctrl[i];
        if (c >= 0 && c !== o) { if (!occ.has(c)) occ.set(c, new Path2D()); occ.get(c).addPath(geo.provs[i].path); }
      });
      this.fills = byOwner; this.occ = occ;
      // borders by kind
      const nation = [], prov = [], coast = [], front = [];
      geo.users.forEach((u, k) => {
        if (u.length < 2) { coast.push(k); return; }
        const a = u[0], b = u[1];
        if (g.owner[a] !== g.owner[b]) nation.push(k); else prov.push(k);
        const ca = g.ctrl[a], cb = g.ctrl[b];
        if (ca >= 0 && cb >= 0 && ca !== cb && World.atWar(g, ca, cb)) front.push(k);
      });
      this.borders = { nation: arcPath(geo, nation), prov: arcPath(geo, prov), coast: arcPath(geo, coast), front: arcPath(geo, front) };
      this.labels = this.computeLabels();
      this.version++;
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
      this.cache.width = this.cv.width; this.cache.height = this.cv.height;
      this.cacheCam = null; this.clamp();
    }
    fitZ() { return Math.min(this.sw / this.W, this.sh / this.H); }
    clamp() {
      const c = this.cam, zmin = this.fitZ();
      c.z = Math.max(zmin, Math.min(40, c.z));
      const vw = this.sw / c.z, vh = this.sh / c.z;
      c.x = vw >= this.W ? (this.W - vw) / 2 : Math.max(0, Math.min(this.W - vw, c.x));
      c.y = vh >= this.H ? (this.H - vh) / 2 : Math.max(0, Math.min(this.H - vh, c.y));
    }
    focus(p, z) {
      const pr = this.geo.provs[p];
      this.cam.z = z || Math.max(this.cam.z, 3);
      this.cam.x = pr.lx - this.sw / this.cam.z / 2; this.cam.y = pr.ly - this.sh / this.cam.z / 2;
      this.clamp();
    }
    toW(sx, sy) { return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y }; }
    toS(x, y) { return [(x - this.cam.x) * this.cam.z, (y - this.cam.y) * this.cam.z]; }
    provAt(sx, sy) {
      const w = this.toW(sx, sy), geo = this.geo;
      const cand = geo.grid.get(Math.floor(w.x / geo.CELL) + ',' + Math.floor(w.y / geo.CELL)) || [];
      for (const i of cand) {
        const b = geo.provs[i].box;
        if (w.x < b[0] || w.x > b[2] || w.y < b[1] || w.y > b[3]) continue;
        if (this.hit.isPointInPath(geo.provs[i].path, w.x, w.y)) return i;
      }
      return -1;
    }
    zoomAt(sx, sy, f) {
      const w = this.toW(sx, sy); this.cam.z *= f; this.clamp();
      this.cam.x = w.x - sx / this.cam.z; this.cam.y = w.y - sy / this.cam.z; this.clamp();
    }
    unitSize() { return Math.min(34, this.cam.z * 7); }

    // ---------------------------------------------------------------- static layer (re-rendered when the view settles)
    renderCache() {
      const c = this.cache.getContext('2d'), { cam, geo } = this, g = this.opts.state(), z = cam.z;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = '#1a2c3d'; c.fillRect(0, 0, this.sw, this.sh);
      c.save();
      c.translate(-cam.x * z, -cam.y * z); c.scale(z, z);
      const img = relief();
      if (img.complete && img.naturalWidth) { c.imageSmoothingEnabled = true; c.drawImage(img, 0, 0, this.W, this.H); }
      // deepen the sea so land stands out
      const sea = new Path2D(); sea.rect(-10, -10, this.W + 20, this.H + 20); sea.addPath(geo.land);
      c.fillStyle = 'rgba(12,28,46,0.5)'; c.fill(sea, 'evenodd');
      // nation colours over the terrain
      c.globalAlpha = 0.58;
      for (const [o, path] of this.fills || []) { c.fillStyle = g.nations[o].color; c.fill(path); }
      c.globalAlpha = 0.85;
      for (const [o, path] of this.occ || []) { c.fillStyle = stripes(c, g.nations[o].color, z); c.fill(path); }
      c.globalAlpha = 1;
      if (this.borders) {
        c.lineJoin = 'round'; c.lineCap = 'round';
        if (z > 0.9) { c.strokeStyle = `rgba(20,16,10,${Math.min(0.45, (z - 0.9) * 0.4)})`; c.lineWidth = 0.8 / z; c.stroke(this.borders.prov); }
        c.strokeStyle = 'rgba(15,25,35,0.75)'; c.lineWidth = 1 / z; c.stroke(this.borders.coast);
        c.strokeStyle = 'rgba(18,12,8,0.9)'; c.lineWidth = Math.max(1.4, Math.min(3.2, z * 0.9)) / z; c.stroke(this.borders.nation);
        c.strokeStyle = 'rgba(255,240,220,0.22)'; c.lineWidth = 0.6 / z; c.stroke(this.borders.nation);
        if (this.opts.showFront !== false) {
          c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 4.5 / z; c.stroke(this.borders.front);
          c.strokeStyle = '#ff5145'; c.lineWidth = 2.6 / z; c.stroke(this.borders.front);
        }
      }
      c.restore();
      this.drawLabels(c);
      this.cacheCam = { ...cam }; this.cacheVersion = this.version;
    }
    drawLabels(c) {
      const g = this.opts.state(), { cam, geo, data } = this, z = cam.z;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      // province names when zoomed in
      if (z > 3.2) {
        const fs = Math.min(15, 6 + z * 0.9);
        c.font = `500 ${fs}px "Source Serif 4", Georgia, serif`;
        data.provinces.forEach((p, i) => {
          const pr = geo.provs[i], [x, y] = this.toS(pr.lx, pr.ly);
          if (x < -60 || y < -20 || x > this.sw + 60 || y > this.sh + 20) return;
          const w = (pr.box[2] - pr.box[0]) * z;
          if (w < c.measureText(p.n).width * 0.9) return;
          c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,250,240,0.55)'; c.strokeText(p.n, x, y + fs * 0.9);
          c.fillStyle = 'rgba(30,24,16,0.85)'; c.fillText(p.n, x, y + fs * 0.9);
        });
      }
      // capitals
      for (const n of g.nations) {
        if (!n.alive) continue;
        const pr = geo.provs[n.cap], [x, y] = this.toS(pr.lx, pr.ly);
        if (x < -10 || y < -10 || x > this.sw + 10 || y > this.sh + 10) continue;
        if (z < 0.8 && !n.great) continue;
        star(c, x, y, Math.min(8, 3 + z * 0.8), Math.min(3.4, 1.3 + z * 0.35), '#fff7e0', 'rgba(20,10,0,.8)');
      }
      // nation names, along the country's main axis
      for (const L of this.labels || []) {
        const n = g.nations[L.n]; if (!n.alive) continue;
        const name = n.name.toUpperCase();
        const px = L.len * z;
        let fs = px / (name.length * 0.72 + 1);
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
      const { ctx, cam, geo } = this, g = this.opts.state(), z = cam.z;
      if (!this.sw) return;
      const cc = this.cacheCam, moving = this.interacting && now - this.lastInput < 160;
      const stale = !cc || this.cacheVersion !== this.version || cc.x !== cam.x || cc.y !== cam.y || cc.z !== cam.z;
      if (stale && (!moving || !cc)) this.renderCache();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1a2c3d'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      if (this.cacheCam) {
        // while panning/zooming, stretch the last render; it is redrawn sharp once the view settles
        const k = cam.z / this.cacheCam.z, dx = (this.cacheCam.x - cam.x) * cam.z, dy = (this.cacheCam.y - cam.y) * cam.z;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.drawImage(this.cache, dx, dy, this.sw * k, this.sh * k);
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
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
      const armies = this.opts.armies(), data = this.data;
      for (const a of armies) {
        if (!a.path || !a.path.length || !a.showPath) continue;
        ctx.strokeStyle = a.pathColor || 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.2; ctx.setLineDash([6, 4]);
        ctx.beginPath();
        let [x0, y0] = this.toS(geo.provs[a.p].lx, geo.provs[a.p].ly); ctx.moveTo(x0, y0);
        for (const q of a.path) { const [x, y] = this.toS(geo.provs[q].lx, geo.provs[q].ly); ctx.lineTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]);
        const last = a.path.length > 1 ? a.path[a.path.length - 2] : a.p, end = a.path[a.path.length - 1];
        this.arrowHead(ctx, this.toS(geo.provs[last].lx, geo.provs[last].ly), this.toS(geo.provs[end].lx, geo.provs[end].ly), a.pathColor || '#fff');
      }
      // armies: they grow as you zoom in
      const s = this.unitSize(), mini = s < 9;
      const byProv = new Map();
      for (const a of armies) { if (!byProv.has(a.p)) byProv.set(a.p, []); byProv.get(a.p).push(a); }
      this.armyHits = [];
      for (const [p, list] of byProv) {
        const pr = geo.provs[p];
        list.forEach((a, k) => {
          let [x, y] = this.toS(pr.lx, pr.ly);
          const sp = mini ? 7 : s * 1.75;
          x += (k - (list.length - 1) / 2) * sp;
          if (x < -50 || y < -50 || x > this.sw + 50 || y > this.sh + 50) return;
          if (!a.always && (mini || z < 4)) return;          // neutral armies only when zoomed in
          if (mini) {
            ctx.fillStyle = a.affil === 'friend' ? NS.FRIEND : a.affil === 'hostile' ? NS.HOSTILE : NS.NEUTRAL;
            ctx.strokeStyle = a.selected ? '#fff' : '#0b0f14'; ctx.lineWidth = a.selected ? 2 : 1;
            ctx.fillRect(x - 3.5, y - 2.5, 7, 5); ctx.strokeRect(x - 3.5, y - 2.5, 7, 5);
            this.armyHits.push({ a, x, y, r: 9 });
            return;
          }
          if (a.genColor) { ctx.fillStyle = a.genColor; ctx.fillRect(x - s * 0.75, y + s * 0.5, s * 1.5, Math.max(2, s * 0.12)); }
          NS.drawUnit(ctx, x, y, s, a.type, { affil: a.affil, ech: a.ech, selected: a.selected });
          ctx.font = `700 ${Math.round(s * 0.55)}px "IBM Plex Mono", monospace`;
          const label = a.div >= 10 ? Math.round(a.div) + '' : a.div.toFixed(1).replace(/\.0$/, '');
          const tw = ctx.measureText(label).width + 6, by = y + s * (a.affil === 'hostile' ? 0.86 : 0.62) + 2;
          ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(x - tw / 2, by, tw, s * 0.62);
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, x, by + 1); ctx.textBaseline = 'middle';
          this.armyHits.push({ a, x, y, r: s });
        });
      }
      // battle markers
      for (const b of this.opts.battles ? this.opts.battles() : []) {
        const pr = geo.provs[b.p], [x, y] = this.toS(pr.lx, pr.ly), r = 8 + 2 * Math.sin(t * 6), off = Math.max(14, s);
        ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 3;
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
        if (!d.moved && e.type === 'pointerup') this.opts.onClick(this.provAt(p.x, p.y), { right: d.button === 2, shift: e.shiftKey, army: this.armyAt(p.x, p.y) });
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('wheel', e => { e.preventDefault(); const p = pt(e); this.zoomAt(p.x, p.y, Math.pow(1.0018, -e.deltaY)); touch(); }, { passive: false });
    }
  }

  // Diagonal stripes in a colour, sized in screen pixels.
  const stripeCache = new Map();
  function stripes(ctx, color, z) {
    let base = stripeCache.get(color);
    if (!base) {
      base = document.createElement('canvas'); base.width = base.height = 12;
      const c = base.getContext('2d');
      c.strokeStyle = color; c.lineWidth = 4.5;
      c.beginPath(); for (let k = -12; k <= 24; k += 12) { c.moveTo(k, 12); c.lineTo(k + 12, 0); } c.stroke();
      stripeCache.set(color, base);
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
    const draw = () => {
      const img = relief(); if (img.complete && img.naturalWidth) c.drawImage(img, 0, 0, geo.W, geo.H);
      c.globalAlpha = 0.62;
      state.owner.forEach((o, i) => { if (o >= 0) { c.fillStyle = state.nations[o].color; c.fill(geo.provs[i].path); } });
      c.globalAlpha = 1;
    };
    draw();
    c.restore();
    const img = relief();
    if (!img.complete) img.addEventListener('load', () => renderPreview(cv, data, state), { once: true });
  }

  root.WorldMap = WorldMap;
  root.WorldMap.renderPreview = renderPreview;
  root.WorldMap.prepare = prepare;
})(window);
