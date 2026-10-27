/* Opening sequence, drawn live from the game's own 1939 map data. Three cuts:
   signal - VHS look: wireframe globe, glitch cards, Europe tilted with the strike on Warsaw, the world alight
   war    - hard red/black/white cuts: typed date, nation silhouettes, one-word cards, a red globe
   neon   - colour-cycling nation shapes beside stacked, repeated lettering
   strike, theatres, countdown - remixes of the first two, built from the shared scenes below
   Plays once per browser session; any key, click or "Skip" ends it. */
(function (root) {
  'use strict';
  const LILAC = '#c9b2ff', MAGENTA = '#ff4fd8', ICE = '#a9c3ff';
  const D2R = Math.PI / 180;

  // timeline, in seconds
  const T = { globe: 0, card1: 3.4, europe: 5.0, rapid: 9.8, fire: 11.3, end: 13.7, out: 16.6 };
  const RAPID = ['MOBILISE', 'DECLARE', 'CONQUER'];

  const DUR = { signal: T.out, war: 12.4, neon: 11.2, strike: 0, theatres: 0, countdown: 0 };
  function play(dataPromise, style) {
    style = style in DUR ? style : 'signal';
    return new Promise(resolve => {
      const box = document.getElementById('intro'), cv = document.getElementById('intro-cv');
      const tc = document.getElementById('intro-tc'), date = document.getElementById('intro-date');
      const c = cv.getContext('2d'), buf = document.createElement('canvas'), b = buf.getContext('2d');
      let W = 0, H = 0, dpr = 1, geo = null, data = null, t0 = 0, raf = 0, done = false;
      let lines = null, euro = null, shapes = null, TH = null, seq = null;

      function size() {
        dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
        cv.width = buf.width = Math.round(W * dpr); cv.height = buf.height = Math.round(H * dpr);
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function finish() {
        if (done) return; done = true; cancelAnimationFrame(raf);
        removeEventListener('keydown', key); removeEventListener('resize', size);
        box.classList.add('leaving');
        setTimeout(() => { box.hidden = true; box.classList.remove('leaving'); resolve(); }, 600);
      }
      const key = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish(); } };
      document.getElementById('intro-skip').onclick = finish;
      box.onclick = e => { if (e.target.id !== 'intro-skip') finish(); };
      addEventListener('keydown', key); addEventListener('resize', size);
      box.hidden = false; size();

      dataPromise.then(d => {
        data = d; geo = root.WorldMap.prepare(d);
        lines = coastLines(geo); shapes = nationShapes(d, geo);
        TH = {
          poland: theatre(d, geo, { box: [-6, 60, 36, 40], att: 'Germany', def: 'Poland', from: 'BERLIN', to: 'WARSAW' }),
          france: theatre(d, geo, { box: [-8, 57, 22, 40], att: 'Germany', def: 'France', from: 'BERLIN', to: 'PARIS', near: 900 }),
          malaya: theatre(d, geo, { box: [92, 40, 146, -12], att: 'Japan', def: 'United Kingdom', from: 'TOKYO', to: 'SINGAPORE', at: [103.8, 1.35], near: 600 })
        };
        euro = TH.poland;
        seq = SEQS[style] ? SEQS[style]() : null; if (seq) DUR[style] = seq.reduce((a, x) => a + x[0], 0);
        box.dataset.style = style;
        t0 = performance.now(); raf = requestAnimationFrame(frame);
      }, finish);
      // if the map never arrives, do not hold the player hostage
      setTimeout(() => { if (!t0) finish(); }, 12000);

      function frame(now) {
        if (done) return;
        const t = Math.max(0, (now - t0) / 1000);   // the first frame can be stamped a hair before t0
        if (t >= DUR[style]) return finish();
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
        b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
        b.fillStyle = '#05040a'; b.fillRect(0, 0, W, H);
        let glitch = 0;
        if (seq) { let at = 0, cur = seq[seq.length - 1], u = 0; for (const x of seq) { if (t < at + x[0]) { cur = x; u = t - at; break; } at += x[0]; }
          glitch = cur[1](b, u) || 0; composite(glitch + (u < .1 ? .6 : 0)); tc.textContent = timecode(t); date.textContent = cur[2] || ''; raf = requestAnimationFrame(frame); return; }
        if (style === 'war') { glitch = warFrame(b, t); composite(glitch); tc.textContent = timecode(t); date.textContent = t < 5.6 ? '01.09.1939' : t < 9.8 ? '07.12.1941' : '--.--.----'; raf = requestAnimationFrame(frame); return; }
        if (style === 'neon') { glitch = neonFrame(b, t); composite(.45 + glitch); tc.textContent = timecode(t); date.textContent = ''; raf = requestAnimationFrame(frame); return; }
        if (t < T.card1) { globe(b, t, 0, Math.min(1, t / .6)); }
        else if (t < T.europe) { glitch = card(b, t - T.card1, '1 SEPTEMBER 1939', '04:45 · THE DANZIG CORRIDOR', 'blue'); }
        else if (t < T.rapid) { europeScene(b, t - T.europe); }
        else if (t < T.fire) { const k = Math.floor((t - T.rapid) / .5); glitch = card(b, (t - T.rapid) % .5, RAPID[Math.min(2, k)], '', k % 2 ? 'red' : 'black'); }
        else if (t < T.end) { globe(b, t, Math.min(1, (t - T.fire) / 1.6), 1); }
        else { glitch = endCard(b, t - T.end); }
        // fade from black at the start and between the last two scenes
        if (t < .4) { b.fillStyle = `rgba(0,0,0,${1 - t / .4})`; b.fillRect(0, 0, W, H); }
        composite(glitch + (scenePulse(t) ? .6 : 0));
        tc.textContent = timecode(t);
        date.textContent = stamp(t);
        raf = requestAnimationFrame(frame);
      }
      // a short tear at every cut
      function scenePulse(t) { return [T.card1, T.europe, T.rapid, T.rapid + .5, T.rapid + 1, T.fire, T.end].some(x => t > x && t - x < .12); }

      // ---------------------------------------------------------------- post effects
      function composite(glitch) {
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        c.drawImage(buf, 0, 0);
        // colour fringing: two faint offset copies
        const o = (2 + glitch * 10) * dpr;
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = .22 + glitch * .2;
        c.drawImage(buf, o, 0); c.drawImage(buf, -o, 0);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        // horizontal tears
        const n = glitch > .2 ? 6 + Math.floor(glitch * 10) : Math.random() < .04 ? 2 : 0;
        for (let i = 0; i < n; i++) {
          const y = Math.random() * cv.height, h = (4 + Math.random() * 40) * dpr, dx = (Math.random() - .5) * 80 * dpr * (glitch + .3);
          c.drawImage(buf, 0, y, cv.width, h, dx, y, cv.width, h);
        }
      }

      // ---------------------------------------------------------------- globe
      const LILAC_PAL = { ring: '201,178,255', line: '225,212,255', hot: '255,79,216', core: '255,240,255' };
      const RED_PAL = { ring: '255,70,80', line: '255,120,120', hot: '255,90,40', core: '255,250,230' };
      function globe(g, t, fire, alpha, pal) {
        pal = pal || LILAC_PAL;
        const R = Math.min(W, H) * (.3 + fire * .06), cx = W / 2, cy = H / 2 + (fire ? 0 : 6);
        const lon0 = (fire ? 20 : -40 + t * 22) * D2R, lat0 = (fire ? 38 : 22) * D2R;
        const sl0 = Math.sin(lat0), cl0 = Math.cos(lat0);
        const proj = (lon, lat) => { const dl = lon * D2R - lon0, la = lat * D2R, cl = Math.cos(la); const cosc = sl0 * Math.sin(la) + cl0 * cl * Math.cos(dl); return [cx + R * cl * Math.sin(dl), cy - R * (cl0 * Math.sin(la) - sl0 * cl * Math.cos(dl)), cosc > 0]; };
        g.globalAlpha = alpha;
        // outer rings
        g.strokeStyle = `rgba(${pal.ring},.55)`; g.lineWidth = 1;
        g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
        g.strokeStyle = `rgba(${pal.ring},.25)`; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, 7); g.stroke();
        // graticule
        g.strokeStyle = `rgba(${pal.ring},.16)`;
        for (let lo = -180; lo < 180; lo += 20) polyline(g, proj, k => [lo, -80 + k * 4], 41);
        for (let la = -60; la <= 60; la += 20) polyline(g, proj, k => [-180 + k * 4.5, la], 81);
        // coastlines and borders: a wide soft pass, then a thin bright one
        for (const [w, col] of [[3, `rgba(${pal.ring},.12)`], [1, `rgba(${pal.line},.85)`]]) {
          g.strokeStyle = col; g.lineWidth = w; g.beginPath();
          for (const L of lines) { let pen = false; for (let i = 0; i < L.length; i += 2) { const p = proj(L[i], L[i + 1]); if (!p[2]) { pen = false; continue; } if (pen) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); pen = true; } } }
          g.stroke();
        }
        if (fire > 0) {
          // Europe alight
          const p = proj(15, 51);
          const r = R * (.25 + fire * .45), fl = .75 + Math.sin(t * 23) * .1 + Math.random() * .08;
          const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
          gr.addColorStop(0, `rgba(${pal.core},${fl})`); gr.addColorStop(.25, `rgba(${pal.hot},${.75 * fl})`); gr.addColorStop(1, `rgba(${pal.hot},0)`);
          g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
          for (let i = 0; i < 40 * fire; i++) { const a = Math.random() * 6.28, d = Math.random() * r * 1.4; g.fillStyle = `rgba(255,${120 + Math.random() * 120 | 0},240,${Math.random() * .8})`; g.fillRect(p[0] + Math.cos(a) * d, p[1] - Math.abs(Math.sin(a)) * d * 1.3, 2, 2); }
          g.globalCompositeOperation = 'source-over';
        }
        g.globalAlpha = 1;
      }
      function polyline(g, proj, at, n) {
        g.beginPath(); let pen = false;
        for (let k = 0; k < n; k++) { const [lo, la] = at(k), p = proj(lo, la); if (!p[2]) { pen = false; continue; } if (pen) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); pen = true; } }
        g.stroke();
      }

      // ---------------------------------------------------------------- title cards
      function card(g, t, text, sub, tone) {
        if (tone === 'blue') {
          const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#0a1a8c'); gr.addColorStop(.7, '#2a3cff'); gr.addColorStop(1, '#dfe6ff');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .12})`; g.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3); }
        } else if (tone === 'red') { g.fillStyle = '#2a0006'; g.fillRect(0, 0, W, H); }
        const fs = Math.min(W / (text.length * .5), H * .2), x = W / 2, y = H / 2;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        if ('letterSpacing' in g) g.letterSpacing = (fs * .04).toFixed(1) + 'px';
        const j = t < .15 ? (Math.random() - .5) * 20 : 0;
        g.fillStyle = tone === 'blue' ? '#f2d6ff' : tone === 'red' ? '#ff3b4f' : '#ffffff';
        g.shadowColor = tone === 'blue' ? 'rgba(10,10,80,.8)' : 'rgba(255,79,216,.6)'; g.shadowBlur = 18;
        g.fillText(text, x + j, y);
        g.shadowBlur = 0;
        if (sub) { g.font = `500 ${Math.max(12, fs * .14)}px "IBM Plex Mono", monospace`; if ('letterSpacing' in g) g.letterSpacing = '4px'; g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(sub, x, y + fs * .7); }
        if ('letterSpacing' in g) g.letterSpacing = '0px';
        return t < .18 ? 1 : 0;
      }
      function endCard(g, t, pal) {
        pal = pal || LILAC_PAL;
        // a perspective grid floor, then the name
        g.strokeStyle = `rgba(${pal.ring},.22)`; g.lineWidth = 1;
        const hy = H * .62;
        for (let i = -20; i <= 20; i++) { g.beginPath(); g.moveTo(W / 2 + i * 12, hy); g.lineTo(W / 2 + i * W * .12, H); g.stroke(); }
        for (let k = 0; k < 12; k++) { const yy = hy + (H - hy) * Math.pow(((k + (t * .8) % 1) / 12), 2); g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
        const a = Math.min(1, t / .5), fs = Math.min(W * .12, H * .16);
        g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `300 ${fs}px "Spectral", Georgia, serif`; if ('letterSpacing' in g) g.letterSpacing = (fs * .35).toFixed(1) + 'px';
        g.shadowColor = `rgba(${pal.hot},.7)`; g.shadowBlur = 30; g.fillStyle = '#fff';
        g.fillText('IMPERIUM', W / 2 + fs * .17, H * .42); g.shadowBlur = 0;
        g.font = `500 ${Math.max(11, fs * .13)}px "IBM Plex Mono", monospace`; if ('letterSpacing' in g) g.letterSpacing = '6px';
        g.fillStyle = `rgba(${pal.line},.85)`; g.fillText('LEAD ANY NATION · 1900 · 1939 · 2003', W / 2, H * .42 + fs * .75);
        if ('letterSpacing' in g) g.letterSpacing = '0px';
        g.globalAlpha = 1;
        if (t > 2.4) { g.fillStyle = `rgba(0,0,0,${Math.min(1, (t - 2.4) / .5)})`; g.fillRect(0, 0, W, H); }
        return t < .25 || (t > 1.2 && t < 1.32) ? 1 : 0;
      }

      // ---------------------------------------------------------------- a campaign on a tilted map
      function europeScene(g, t) { theatreScene(g, t, euro, LILAC_PAL); }
      function theatreScene(g, t, E, pal) {
        if (!E) return;
        // tilted plane: the map is squashed vertically and pushed in slowly
        const span = E.box[2] - E.box[0], s = Math.max(W / span, H / (E.box[3] - E.box[1]) / .62) * (1.05 + t * .05);
        const cx = (E.box[0] + E.box[2]) / 2 + t * 3, cy = (E.box[1] + E.box[3]) / 2;
        const toS = (x, y) => [W / 2 + (x - cx) * s, H * .54 + (y - cy) * s * .62];
        g.save(); g.setTransform(dpr * s, 0, 0, dpr * s * .62, dpr * (W / 2 - cx * s), dpr * (H * .54 - cy * s * .62));
        g.fillStyle = '#1b1f2e'; g.fill(E.land);
        g.fillStyle = E.hatch(g, pal.hot); g.fill(E.ger);
        const k = Math.max(0, Math.min(1, (t - 2) / 2.2)), n = Math.floor(E.pol.length * k);
        const taken = new Path2D(); for (let i = 0; i < n; i++) taken.addPath(E.pol[i]);
        if (n) g.fill(taken);
        g.globalAlpha = .9; g.fillStyle = `rgba(${pal.hot},.35)`; g.fill(E.ger); if (n) g.fill(taken);
        g.globalAlpha = 1; g.lineJoin = 'round';
        g.strokeStyle = 'rgba(169,195,255,.25)'; g.lineWidth = .6 / s; g.stroke(E.prov);
        g.strokeStyle = 'rgba(200,215,255,.9)'; g.lineWidth = 1.6 / s; g.stroke(E.border);
        g.restore();
        // the arc from Berlin to Warsaw, then the strike
        const a = toS(E.from[0], E.from[1]), z = toS(E.to[0], E.to[1]);
        const q = Math.max(0, Math.min(1, (t - .8) / 1));
        if (q > 0) {
          g.strokeStyle = '#ffffff'; g.lineWidth = 2.4; g.shadowColor = '#ffffff'; g.shadowBlur = 12; g.beginPath();
          for (let i = 0; i <= 40 * q; i++) { const u = i / 40, x = a[0] + (z[0] - a[0]) * u, y = a[1] + (z[1] - a[1]) * u - Math.sin(u * Math.PI) * H * .22; i ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke(); g.shadowBlur = 0;
        }
        if (t > 1.8) {
          const bt = t - 1.8, bw = 26 * Math.max(.3, 1 - bt / 2.5), bh = H * .7;
          const gr = g.createLinearGradient(0, z[1] - bh, 0, z[1]); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.95)');
          g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(z[0] - bw / 2, z[1] - bh, bw, bh);
          for (let r = 0; r < 3; r++) { const rr = ((bt * 70 + r * 40) % 120) + 8; g.strokeStyle = `rgba(255,255,255,${1 - rr / 128})`; g.lineWidth = 2; g.beginPath(); g.ellipse(z[0], z[1], rr * 1.6, rr * .62, 0, 0, 7); g.stroke(); }
          g.globalCompositeOperation = 'source-over';
        }
        // labels
        g.font = '600 13px "IBM Plex Mono", monospace'; g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'left';
        g.fillText(E.fromName, a[0] + 8, a[1] - 6); g.fillText(E.toName, z[0] + 10, z[1] + 16);
      }

      // ---------------------------------------------------------------- war footing
      const WAR_NATIONS = ['Germany', 'Italy', 'Japan', 'USSR', 'United Kingdom', 'France', 'United States'];
      const WAR_WORDS = ['ALLIANCES', 'BETRAYAL', 'TOTAL WAR'];
      function warFrame(g, t) {
        if (t < 1.4) {
          const txt = '1 SEPTEMBER 1939 · 04:45', n = Math.min(txt.length, Math.floor(t / 1.1 * txt.length));
          g.font = `500 ${Math.min(30, W / 26)}px "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
          g.fillText(txt.slice(0, n) + (Math.floor(t * 4) % 2 ? '_' : ' '), W / 2, H / 2); return 0;
        }
        if (t < 2.8) return card(g, t - 1.4, 'WAR FOOTING', 'ALL FORCES TO READINESS', 'blue');
        if (t < 5.6) {
          const k = Math.floor((t - 2.8) / .4), u = (t - 2.8) % .4, nm = WAR_NATIONS[Math.min(WAR_NATIONS.length - 1, k)], inv = k % 2 === 1;
          g.fillStyle = inv ? '#d4141f' : '#000'; g.fillRect(0, 0, W, H);
          silhouette(g, nm, [W * .1, H * .1, W * .8, H * .72], inv ? '#000' : '#e8202f', inv ? '#000' : '#ff5a64');
          for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, W, 1); }
          const fs = Math.min(W / 9, H * .14);
          g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
          g.fillText(nm.toUpperCase(), W * .06, H * .92);
          if (u < .05) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, W, H); }
          return u < .08 ? 1 : 0;
        }
        if (t < 7.4) { const k = Math.floor((t - 5.6) / .6); return card(g, (t - 5.6) % .6, WAR_WORDS[Math.min(2, k)], '', k === 1 ? 'red' : 'black'); }
        if (t < 9.8) { globe(g, t, Math.min(1, (t - 7.4) / 1.4), 1, RED_PAL); return 0; }
        return warEnd(g, t - 9.8);
      }
      function warEnd(g, t) {
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        const fs = Math.min(W * .16, H * .22), a = Math.min(1, t / .25);
        g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; if ('letterSpacing' in g) g.letterSpacing = (fs * .06).toFixed(1) + 'px';
        g.fillStyle = '#e8202f'; g.shadowColor = 'rgba(255,40,50,.6)'; g.shadowBlur = 24; g.fillText('IMPERIUM', W / 2, H * .45); g.shadowBlur = 0;
        g.font = `500 ${Math.max(11, fs * .1)}px "IBM Plex Mono", monospace`; if ('letterSpacing' in g) g.letterSpacing = '6px';
        g.fillStyle = '#fff'; g.fillText('LEAD ANY NATION · 1900 · 1939 · 2003', W / 2, H * .45 + fs * .62);
        if ('letterSpacing' in g) g.letterSpacing = '0px'; g.globalAlpha = 1;
        if (t > 2.1) { g.fillStyle = `rgba(0,0,0,${Math.min(1, (t - 2.1) / .5)})`; g.fillRect(0, 0, W, H); }
        return t < .2 || (t > 1 && t < 1.08) ? 1 : 0;
      }

      // ---------------------------------------------------------------- neon
      const NEON_NATIONS = ['Germany', 'United Kingdom', 'USSR', 'Japan', 'France', 'Italy', 'United States', 'Poland'];
      function neonFrame(g, t) {
        const end = 9.6;
        if (t >= end) {
          const u = t - end, fs = Math.min(W * .1, H * .12);
          g.font = `800 ${fs}px "Spectral", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          for (let i = 0; i < 6; i++) { g.fillStyle = `hsl(${(u * 300 + i * 50) % 360},100%,62%)`; g.fillText('IMPERIUM', W / 2 + (Math.random() - .5) * 6, H * (.12 + i * .155)); }
          if (u > 1) { g.fillStyle = `rgba(0,0,0,${Math.min(1, (u - 1) / .5)})`; g.fillRect(0, 0, W, H); }
          return u < .1 ? 1 : 0;
        }
        const k = Math.floor(t / 1.2), u = t % 1.2, nm = NEON_NATIONS[k % NEON_NATIONS.length], h = (t * 140 + k * 70) % 360;
        // an occasional dim frame, like a dropped signal
        const dim = u > .55 && u < .62;
        g.globalAlpha = dim ? .25 : 1;
        const gr = g.createLinearGradient(0, H * .1, 0, H * .9);
        gr.addColorStop(0, `hsl(${h},100%,62%)`); gr.addColorStop(.5, `hsl(${(h + 70) % 360},100%,55%)`); gr.addColorStop(1, `hsl(${(h + 150) % 360},100%,58%)`);
        silhouette(g, nm, [W * .03, H * .08, W * .5, H * .84], gr, `hsl(${(h + 180) % 360},100%,70%)`, true);
        g.globalAlpha = 1;
        // stacked, slightly slanted lettering on the right, repeated
        const fs = Math.min(W * .038, H * .07);
        g.save(); g.translate(W * .56, H * .14); g.transform(1, -.06, 0, 1, 0, 0);
        g.font = `600 ${fs}px "Spectral", Georgia, serif`; g.textAlign = 'left'; g.textBaseline = 'top';
        for (let i = 0; i < 4; i++) {
          const y = i * fs * 2.6;
          g.fillStyle = '#d9e04c'; g.fillText('IMPERIUM WINS', (Math.random() - .5) * 2, y);
          g.fillText('LEAD ANY NATION', (Math.random() - .5) * 2, y + fs * 1.05);
        }
        g.restore();
        // a small boxed name tag, bottom right
        g.font = `600 ${Math.max(11, fs * .4)}px "IBM Plex Mono", monospace`; const tw = g.measureText(nm.toUpperCase()).width;
        g.fillStyle = '#fff'; g.fillRect(W - tw - 44, H - 64, tw + 24, 30); g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(nm.toUpperCase(), W - tw - 32, H - 49);
        return u < .06 ? 1 : 0;
      }
      // a nation's home territory, fitted into a screen box
      function silhouette(g, nm, rect, fill, stroke, inner) {
        const S = shapes && shapes[nm]; if (!S) return;
        const [x, y, w, h] = rect, bw = S.box[2] - S.box[0], bh = S.box[3] - S.box[1], k = Math.min(w / bw, h / bh);
        const ox = x + (w - bw * k) / 2 - S.box[0] * k, oy = y + (h - bh * k) / 2 - S.box[1] * k;
        g.save(); g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
        g.fillStyle = fill; g.fill(S.path);
        if (inner) { g.strokeStyle = stroke; g.lineWidth = 1.4 / k; g.globalAlpha *= .7; g.stroke(S.inner); }
        g.globalAlpha = 1; g.strokeStyle = stroke; g.lineWidth = 2 / k; g.stroke(S.path);
        g.restore();
      }

      // ---------------------------------------------------------------- shared pieces for the remixes
      function typed(g, u, txt, dur) {
        const n = Math.min(txt.length, Math.floor(u / dur * txt.length));
        g.font = `500 ${Math.min(30, W / 26)}px "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
        g.fillText(txt.slice(0, n) + (Math.floor(u * 4) % 2 ? '_' : ' '), W / 2, H / 2); return 0;
      }
      function silFrame(g, u, nm, inv, label) {
        g.fillStyle = inv ? '#d4141f' : '#000'; g.fillRect(0, 0, W, H);
        silhouette(g, nm, [W * .1, H * .1, W * .8, H * .72], inv ? '#000' : '#e8202f', inv ? '#000' : '#ff5a64');
        for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, W, 1); }
        const fs = Math.min(W / 9, H * .14);
        g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
        g.fillText((label || nm).toUpperCase(), W * .06, H * .92);
        if (u < .05) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, W, H); }
        return u < .08 ? 1 : 0;
      }
      const SEQS = {
        // Signal's opening and globe, War footing's colours and cuts
        strike: () => [
          [2.6, (g, u) => { globe(g, u, 0, Math.min(1, u / .6)); }, '01.09.1939'],
          [1.4, (g, u) => card(g, u, 'WAR FOOTING', 'ALL FORCES TO READINESS', 'blue'), '01.09.1939'],
          [4.4, (g, u) => { theatreScene(g, u, TH.poland, RED_PAL); }, '01.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'Germany', false), '03.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'United Kingdom', true), '03.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'France', false), '03.09.1939'],
          [.7, (g, u) => card(g, u, 'TOTAL WAR', '', 'red'), '03.09.1939'],
          [2.2, (g, u) => { globe(g, 20, Math.min(1, u / 1.4), 1, RED_PAL); }, '22.06.1941'],
          [2.9, (g, u) => endCard(g, u, RED_PAL), '--.--.----']
        ],
        // three campaigns, each with its date card, in Signal's lilac
        theatres: () => [
          [2.3, (g, u) => { globe(g, u, 0, Math.min(1, u / .6)); }, '01.09.1939'],
          [1.2, (g, u) => card(g, u, '1 SEPTEMBER 1939', 'POLAND', 'blue'), '01.09.1939'],
          [3.4, (g, u) => { theatreScene(g, u, TH.poland, LILAC_PAL); }, '01.09.1939'],
          [1.2, (g, u) => card(g, u, '10 MAY 1940', 'THE LOW COUNTRIES AND FRANCE', 'blue'), '10.05.1940'],
          [3.4, (g, u) => { theatreScene(g, u, TH.france, LILAC_PAL); }, '10.05.1940'],
          [1.2, (g, u) => card(g, u, '8 DECEMBER 1941', 'MALAYA', 'blue'), '08.12.1941'],
          [3.4, (g, u) => { theatreScene(g, u, TH.malaya, LILAC_PAL); }, '08.12.1941'],
          [2.0, (g, u) => { globe(g, 20, Math.min(1, u / 1.4), 1); }, '08.12.1941'],
          [2.9, (g, u) => endCard(g, u), '--.--.----']
        ],
        // War footing's hard cuts around an escalating readiness count
        countdown: () => [
          [1.3, (g, u) => typed(g, u, 'ALL STATIONS · ALL STATIONS', 1.0), '31.08.1939'],
          [.8, (g, u) => card(g, u, 'DEFCON 5', '', 'black'), '31.08.1939'],
          [.8, (g, u) => card(g, u, 'DEFCON 4', '', 'blue'), '31.08.1939'],
          [.4, (g, u) => silFrame(g, u, 'Germany', false), '01.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'Poland', true), '01.09.1939'],
          [.8, (g, u) => card(g, u, 'DEFCON 3', '', 'blue'), '01.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'USSR', false), '17.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'Japan', true), '17.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'United States', false), '17.09.1939'],
          [.8, (g, u) => card(g, u, 'DEFCON 2', '', 'red'), '17.09.1939'],
          [.7, (g, u) => { const on = Math.floor(u * 10) % 2 === 0; if (on) card(g, u, 'DEFCON 1', '', 'red'); return 1; }, '--.--.----'],
          [2.2, (g, u) => { globe(g, 20, Math.min(1, u / 1.2), 1, RED_PAL); }, '--.--.----'],
          [2.6, (g, u) => warEnd(g, u), '--.--.----']
        ]
      };

      function timecode(t) { const s = Math.floor(t); return `0:00:${String(s).padStart(2, '0')}`; }
      function stamp(t) {
        if (t < T.europe) return '01.09.1939';
        if (t < T.rapid) { const d = Math.min(35, Math.floor((t - T.europe) / 4.8 * 36)); const dt = new Date(Date.UTC(1939, 8, 1 + d)); return `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.1939`; }
        if (t < T.end) return '22.06.1941';
        return '--.--.----';
      }
    });
  }

  // world coastlines and borders as lon/lat polylines, thinned to a few thousand points
  function coastLines(geo) {
    let total = 0; for (const a of geo.arcs) total += a.length / 2;
    const step = Math.max(1, Math.round(total / 26000)), out = [];
    for (const a of geo.arcs) {
      const n = a.length / 2; if (n < 2) continue;
      const pts = [];
      for (let i = 0; i < n; i += step) pts.push(geo.lon(a[i * 2]), geo.lat(a[i * 2 + 1]));
      pts.push(geo.lon(a[(n - 1) * 2]), geo.lat(a[(n - 1) * 2 + 1]));
      out.push(pts);
    }
    return out;
  }

  // home territory per nation (provinces near the capital, so far colonies do not shrink the picture), plus inner province lines
  function nationShapes(data, geo) {
    const out = {};
    data.nations.forEach((n, ni) => {
      const cap = geo.provs[n.cap]; if (!cap) return;
      const path = new Path2D(), inner = new Path2D(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
      data.provinces.forEach((p, i) => {
        if (p.o !== ni) return; const q = geo.provs[i];
        if (Math.abs(q.lx - cap.lx) > 300 || Math.abs(q.ly - cap.ly) > 220) return;
        path.addPath(q.path); inner.addPath(q.path); any = true;
        x0 = Math.min(x0, q.box[0]); y0 = Math.min(y0, q.box[1]); x1 = Math.max(x1, q.box[2]); y1 = Math.max(y1, q.box[3]);
      });
      if (any) out[n.name] = { path, inner, box: [x0, y0, x1, y1] };
    });
    return out;
  }

  // A campaign on the 1939 map: land in a lon/lat box, the attacker hatched, the defender's provinces
  // in the box ordered by distance from the attacker's capital (so they fall from the front inward),
  // borders, and the two end points of the arc.
  function theatre(data, geo, cfg) {
    const [lo0, la0, lo1, la1] = cfg.box, box = [geo.X(lo0), geo.Y(la0), geo.X(lo1), geo.Y(la1)];
    const find = nm => data.nations.findIndex(n => n.name === nm);
    const att = find(cfg.att), def = find(cfg.def); if (att < 0 || def < 0) return null;
    const owner = data.provinces.map(p => p.o);
    const land = new Path2D(), attP = new Path2D(), prov = new Path2D(), border = new Path2D(), defList = [];
    const pad = 40, inBox = b => b[2] > box[0] - pad && b[0] < box[2] + pad && b[3] > box[1] - pad && b[1] < box[3] + pad;
    const ac = geo.provs[data.nations[att].cap], dc = geo.provs[data.nations[def].cap];
    const to = cfg.at ? [geo.X(cfg.at[0]), geo.Y(cfg.at[1])] : [dc.lx, dc.ly];
    geo.provs.forEach((p, i) => {
      if (!inBox(p.box)) return;
      land.addPath(p.path);
      if (owner[i] === att) attP.addPath(p.path);
      if (owner[i] === def && (!cfg.near || Math.hypot(p.lx - to[0], p.ly - to[1]) < cfg.near)) defList.push([Math.hypot(p.lx - ac.lx, p.ly - ac.ly), p.path]);
    });
    defList.sort((a, b) => a[0] - b[0]);
    for (const k of geo.arcsIn(box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)) {
      const u = geo.users[k], a = geo.arcs[k], target = u.length < 2 || owner[u[0]] !== owner[u[1]] ? border : prov;
      target.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) target.lineTo(a[i], a[i + 1]);
    }
    const pats = {};
    const hatch = (g, rgb) => { if (pats[rgb]) return pats[rgb]; const t = document.createElement('canvas'); t.width = t.height = 12; const x = t.getContext('2d'); x.strokeStyle = `rgba(${rgb},.95)`; x.lineWidth = 3; x.beginPath(); x.moveTo(-3, 15); x.lineTo(15, -3); x.moveTo(-3, 3); x.lineTo(3, -3); x.moveTo(9, 15); x.lineTo(15, 9); x.stroke(); const pt = g.createPattern(t, 'repeat'); pt.setTransform && pt.setTransform(new DOMMatrix().scale(.06)); return (pats[rgb] = pt); };
    return { box, land, ger: attP, pol: defList.map(x => x[1]), prov, border, from: [ac.lx, ac.ly], to, fromName: cfg.from, toName: cfg.to, hatch };
  }

  root.Intro = { play, seen() { try { return sessionStorage.getItem('imperium-intro') === '1'; } catch (e) { return false; } }, mark() { try { sessionStorage.setItem('imperium-intro', '1'); } catch (e) { /* storage unavailable */ } } };
})(window);
