/* World map rendering and input. */
(function (root) {
  'use strict';
  const NS = root.NatoSymbols;

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  class WorldMap {
    constructor(canvas, data, opts) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.data = data; this.W = data.w; this.H = data.h;
      this.grid = World.decodeGrid(data);
      this.opts = opts;                       // { state(), onClick(prov, ev), onHover(prov), highlights(), armies() }
      this.cam = { x: 0, y: 0, z: 1 };
      this.S = (innerWidth > 900 && (devicePixelRatio || 1) >= 1) ? 3 : 2;
      this.paths = new Map();
      this.dirty = true;
      this.buildCoast();
      this.bindInput();
    }

    // ---------------------------------------------------------------- layers
    buildCoast() {
      const { W, H, grid } = this, d = new Uint8Array(W * H).fill(9), q = [];
      for (let i = 0; i < W * H; i++) if (grid[i]) { d[i] = 0; q.push(i); }
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % W, y = (i / W) | 0, nd = d[i] + 1;
        if (nd > 6) continue;
        for (const j of [x > 0 ? i - 1 : i + W - 1, x < W - 1 ? i + 1 : i - W + 1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
          if (j >= 0 && d[j] > nd) { d[j] = nd; q.push(j); }
        }
      }
      this.coast = d;
    }
    // Repaint the political map (call after ownership changes).
    paint() {
      const g = this.opts.state(), { W, H, grid, S } = this, data = this.data;
      const cols = g.nations.map(n => hexRgb(n.color));
      const P = data.provinces.length;
      const own = new Int32Array(P + 1), ctl = new Int32Array(P + 1);
      own[0] = -9; ctl[0] = -9;
      for (let p = 0; p < P; p++) { own[p + 1] = g.owner[p]; ctl[p + 1] = g.ctrl[p]; }
      if (!this.base) { this.base = document.createElement('canvas'); this.base.width = W * S; this.base.height = H * S; }
      const c = this.base.getContext('2d'), img = c.createImageData(W * S, H * S), px = img.data;
      const shade = new Float32Array(P + 1);
      for (let p = 1; p <= P; p++) shade[p] = 0.94 + ((p * 2654435761 >>> 0) % 1000) / 1000 * 0.1;
      for (let cy = 0; cy < H; cy++) {
        for (let cx = 0; cx < W; cx++) {
          const i = cy * W + cx, p = grid[i];
          const right = cx < W - 1 ? grid[i + 1] : grid[i - W + 1], down = cy < H - 1 ? grid[i + W] : p;
          let r, gg, b;
          if (!p) {
            const k = this.coast[i];
            const lat = cy / H;
            r = 20 + (k < 3 ? (3 - k) * 7 : 0); gg = 38 + lat * 6 + (k < 3 ? (3 - k) * 9 : 0); b = 58 + (k < 3 ? (3 - k) * 10 : 0);
          }
          const o = own[p], ct = ctl[p];
          for (let sy = 0; sy < S; sy++) {
            const row = ((cy * S + sy) * W * S + cx * S) * 4;
            for (let sx = 0; sx < S; sx++) {
              const k = row + sx * 4;
              let R = r, G = gg, B = b;
              if (p) {
                let col = o >= 0 ? cols[o] : [150, 142, 120];
                if (ct !== o && ct >= 0) {
                  const stripe = ((cx * S + sx + cy * S + sy) % (S * 3)) < S * 1.2;
                  if (stripe) col = cols[ct];
                }
                const f = shade[p];
                R = col[0] * f; G = col[1] * f; B = col[2] * f;
                // borders on the right/bottom edge of the cell
                const edgeR = sx === S - 1 && right !== p, edgeD = sy === S - 1 && down !== p;
                if (edgeR || edgeD) {
                  const other = edgeR ? right : down;
                  if (!other || own[other] !== o) { R *= 0.25; G *= 0.25; B *= 0.25; }   // national border / coast
                  else { R *= 0.72; G *= 0.72; B *= 0.72; }                                  // province border
                }
                const edgeL = sx === 0 && cx > 0 && grid[i - 1] && own[grid[i - 1]] !== o, edgeU = sy === 0 && cy > 0 && grid[i - W] && own[grid[i - W]] !== o;
                if (edgeL || edgeU) { R *= 0.4; G *= 0.4; B *= 0.4; }
              }
              px[k] = R; px[k + 1] = G; px[k + 2] = B; px[k + 3] = 255;
            }
          }
        }
      }
      c.putImageData(img, 0, 0);
      this.labels = this.computeLabels();
      this.dirty = true;
    }
    computeLabels() {
      const g = this.opts.state(), data = this.data, out = [];
      g.nations.forEach((n, i) => {
        if (!n.alive) return;
        const cap = data.provinces[n.cap];
        let sx = 0, sy = 0, sa = 0, cells = 0;
        data.provinces.forEach((p, k) => {
          if (g.owner[k] !== i) return;
          const dx = Math.min(Math.abs(p.x - cap.x), this.W - Math.abs(p.x - cap.x)), dy = Math.abs(p.y - cap.y);
          if (dx > 70 || dy > 45) return;           // the home landmass, not far colonies
          sx += p.x * (p.a + 5); sy += p.y * (p.a + 5); sa += p.a + 5; cells += p.a;
        });
        if (!sa) return;
        out.push({ i, x: sx / sa + 0.5, y: sy / sa + 0.5, size: Math.sqrt(cells) * 0.42 });
      });
      return out;
    }
    provPath(p) {
      if (this.paths.has(p)) return this.paths.get(p);
      const { W, H, grid } = this, path = new Path2D(), id = p + 1, pr = this.data.provinces[p];
      for (let y = Math.max(0, pr.y - 60); y < Math.min(H, pr.y + 60); y++) {
        let run = -1;
        for (let x = 0; x <= W; x++) {
          const inside = x < W && grid[y * W + x] === id;
          if (inside && run < 0) run = x;
          if (!inside && run >= 0) { path.rect(run, y, x - run, 1); run = -1; }
        }
      }
      this.paths.set(p, path);
      return path;
    }

    // ---------------------------------------------------------------- camera
    resize() {
      const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      this.sw = r.width; this.sh = r.height; this.dpr = dpr;
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.clamp(); this.dirty = true;
    }
    fitZ() { return Math.min(this.sw / this.W, this.sh / this.H); }
    clamp() {
      const c = this.cam, zmin = this.fitZ();
      c.z = Math.max(zmin, Math.min(24, c.z));
      const vw = this.sw / c.z, vh = this.sh / c.z;
      c.x = vw >= this.W ? (this.W - vw) / 2 : Math.max(0, Math.min(this.W - vw, c.x));
      c.y = vh >= this.H ? (this.H - vh) / 2 : Math.max(0, Math.min(this.H - vh, c.y));
    }
    focus(p, z) {
      const pr = this.data.provinces[p];
      this.cam.z = z || Math.max(this.cam.z, this.fitZ() * 3);
      this.cam.x = pr.x - this.sw / this.cam.z / 2; this.cam.y = pr.y - this.sh / this.cam.z / 2;
      this.clamp(); this.dirty = true;
    }
    toW(sx, sy) { return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y }; }
    toS(x, y) { return [(x - this.cam.x) * this.cam.z, (y - this.cam.y) * this.cam.z]; }
    provAt(sx, sy) {
      const w = this.toW(sx, sy), x = Math.floor(w.x), y = Math.floor(w.y);
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
      return this.grid[y * this.W + x] - 1;
    }
    zoomAt(sx, sy, f) {
      const w = this.toW(sx, sy); this.cam.z *= f; this.clamp();
      this.cam.x = w.x - sx / this.cam.z; this.cam.y = w.y - sy / this.cam.z; this.clamp(); this.dirty = true;
    }

    // ---------------------------------------------------------------- draw
    draw(now) {
      const { ctx, cam, data } = this, g = this.opts.state();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#0d1824'; ctx.fillRect(0, 0, this.sw, this.sh);
      if (!this.base) return;
      ctx.save();
      ctx.translate(-cam.x * cam.z, -cam.y * cam.z); ctx.scale(cam.z, cam.z);
      ctx.imageSmoothingEnabled = cam.z < this.S * 1.5;
      ctx.drawImage(this.base, 0, 0, this.W, this.H);
      // highlights
      const hl = this.opts.highlights();
      for (const h of hl) {
        ctx.fillStyle = h.fill; ctx.fill(this.provPath(h.p));
      }
      ctx.restore();

      const t = now / 1000;
      // selected province outline glow
      for (const h of hl) if (h.outline) {
        ctx.save(); ctx.translate(-cam.x * cam.z, -cam.y * cam.z); ctx.scale(cam.z, cam.z);
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4); ctx.fillStyle = h.outline; ctx.fill(this.provPath(h.p)); ctx.restore();
      }
      // capitals
      for (const n of g.nations) {
        if (!n.alive) continue;
        const p = data.provinces[n.cap], [x, y] = this.toS(p.x + 0.5, p.y + 0.5);
        if (x < -20 || y < -20 || x > this.sw + 20 || y > this.sh + 20) continue;
        if (cam.z < this.fitZ() * 1.6 && !n.great) continue;
        star(ctx, x, y, 4.5, 2, '#fff', 'rgba(0,0,0,.6)');
      }
      // nation names
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const L of this.labels || []) {
        const n = g.nations[L.i]; if (!n.alive) continue;
        const fs = L.size * cam.z;
        if (fs < 9) continue;
        const size = Math.min(fs, 34 + Math.sqrt(fs));
        const [x, y] = this.toS(L.x, L.y);
        if (x < -200 || y < -50 || x > this.sw + 200 || y > this.sh + 50) continue;
        ctx.font = `700 ${size}px "Barlow Condensed", sans-serif`;
        const txt = n.name.toUpperCase();
        ctx.lineWidth = Math.max(2, size / 8); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(txt, x, y);
        ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText(txt, x, y);
      }
      // province names when zoomed in
      if (cam.z > 9) {
        ctx.font = '500 11px "Barlow Condensed", sans-serif';
        data.provinces.forEach(p => {
          const [x, y] = this.toS(p.x + 0.5, p.y + 0.5 + 2.2);
          if (x < -40 || y < -20 || x > this.sw + 40 || y > this.sh + 20) return;
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(p.n, x, y);
          ctx.fillStyle = '#e8edf2'; ctx.fillText(p.n, x, y);
        });
      }
      // army routes
      const armies = this.opts.armies();
      for (const a of armies) {
        if (!a.path || !a.path.length || !a.showPath) continue;
        let prev = data.provinces[a.p];
        ctx.strokeStyle = a.pathColor || 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.2; ctx.setLineDash([6, 4]);
        ctx.beginPath();
        let [x0, y0] = this.toS(prev.x + 0.5, prev.y + 0.5); ctx.moveTo(x0, y0);
        for (const q of a.path) { const pr = data.provinces[q]; const [x, y] = this.toS(pr.x + 0.5, pr.y + 0.5); ctx.lineTo(x, y); x0 = x; y0 = y; }
        ctx.stroke(); ctx.setLineDash([]);
        const last = a.path.length > 1 ? data.provinces[a.path[a.path.length - 2]] : prev, end = data.provinces[a.path[a.path.length - 1]];
        const [lx, ly] = this.toS(last.x + 0.5, last.y + 0.5), [ex, ey] = this.toS(end.x + 0.5, end.y + 0.5), ang = Math.atan2(ey - ly, ex - lx);
        ctx.fillStyle = a.pathColor || '#fff';
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 10 * Math.cos(ang - 0.45), ey - 10 * Math.sin(ang - 0.45)); ctx.lineTo(ex - 10 * Math.cos(ang + 0.45), ey - 10 * Math.sin(ang + 0.45)); ctx.fill();
      }
      // armies
      const s = Math.max(9, Math.min(20, 3.5 * Math.sqrt(cam.z * 6)));
      const byProv = new Map();
      for (const a of armies) { if (!byProv.has(a.p)) byProv.set(a.p, []); byProv.get(a.p).push(a); }
      this.armyHits = [];
      for (const [p, list] of byProv) {
        const pr = data.provinces[p];
        list.forEach((a, k) => {
          let [x, y] = this.toS(pr.x + 0.5, pr.y + 0.5);
          x += (k - (list.length - 1) / 2) * s * 1.7;
          if (x < -30 || y < -30 || x > this.sw + 30 || y > this.sh + 30) return;
          if (!a.always && cam.z < this.fitZ() * 7) return;      // neutral armies only when zoomed in
          NS.drawUnit(ctx, x, y, s, a.type, { friendly: a.affil === 'friend', affil: a.affil, ech: a.ech, selected: a.selected });
          ctx.font = `700 ${Math.round(s * 0.62)}px "IBM Plex Mono", monospace`;
          const label = a.div >= 10 ? Math.round(a.div) + '' : a.div.toFixed(1).replace(/\.0$/, '');
          const tw = ctx.measureText(label).width + 6, by = y + s * (a.affil === 'friend' ? 0.5 : 0.82) + 2;
          ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(x - tw / 2, by, tw, s * 0.7);
          ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.fillText(label, x, by + 1); ctx.textBaseline = 'middle';
          this.armyHits.push({ a, x, y, r: s });
        });
      }
      // battle markers
      for (const b of this.opts.battles ? this.opts.battles() : []) {
        const pr = data.provinces[b.p], [x, y] = this.toS(pr.x + 0.5, pr.y + 0.5);
        const r = 9 + 2 * Math.sin(t * 6);
        ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - r, y - r - 14); ctx.lineTo(x + r, y + r - 14); ctx.moveTo(x + r, y - r - 14); ctx.lineTo(x - r, y + r - 14); ctx.stroke();
      }
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
          this.cam.x = drag.mid.x - (a.x + b.x) / 2 / this.cam.z; this.cam.y = drag.mid.y - (a.y + b.y) / 2 / this.cam.z; this.clamp(); this.dirty = true; return;
        }
        if (drag.pinch) return;
        if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.moved = true;
        if (drag.moved) {
          this.cam.x = drag.cam0.x - (p.x - drag.start.x) / this.cam.z; this.cam.y = drag.cam0.y - (p.y - drag.start.y) / this.cam.z;
          this.clamp(); this.dirty = true; cv.classList.add('grab');
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
      cv.addEventListener('wheel', e => { e.preventDefault(); const p = pt(e); this.zoomAt(p.x, p.y, Math.pow(1.0018, -e.deltaY)); }, { passive: false });
    }
  }
  function star(c, x, y, R, r, fill, stroke) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 1.2; c.strokeStyle = stroke; c.stroke();
  }

  root.WorldMap = WorldMap;
})(window);
