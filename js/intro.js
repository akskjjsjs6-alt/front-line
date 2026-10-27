/* Opening sequence, drawn live from the game's own 1939 map data. Three cuts:
   signal - VHS look: wireframe globe, glitch cards, Europe tilted with the strike on Warsaw, the world alight
   war    - hard red/black/white cuts: typed date, nation silhouettes, one-word cards, a red globe
   neon   - colour-cycling nation shapes beside stacked, repeated lettering
   strike, theatres, countdown - remixes of the first two, built from the shared scenes below
   eras, century - the same two looks across all three periods, using the 1900 and 2003 maps too
   main   - the chosen cut: globe, the three eras with footage behind the date cards, troops crossing into
            Poland, TOTAL WAR over a nuclear flash, the space race, a memorial card, the red IMPERIUM end.
   Footage: drop clips into media/intro/ (march, navy, speech1939, speech2003, china, nuke).mp4 and they
   play behind the cards; until a clip exists, a drawn stand-in takes its place.
   Plays once per browser session; any key, click or "Skip" ends it. */
(function (root) {
  'use strict';
  const LILAC = '#c9b2ff', MAGENTA = '#ff4fd8', ICE = '#a9c3ff';
  const D2R = Math.PI / 180;

  // timeline, in seconds
  const T = { globe: 0, card1: 3.4, europe: 5.0, rapid: 9.8, fire: 11.3, end: 13.7, out: 16.6 };
  const RAPID = ['MOBILISE', 'DECLARE', 'CONQUER'];

  const DUR = { signal: T.out, war: 12.4, neon: 11.2, strike: 0, theatres: 0, countdown: 0, eras: 0, century: 0, main: 0 };
  const ALL_PERIODS = { eras: 1, century: 1, main: 1 };
  const CLIP_NAMES = ['march', 'navy', 'speech1939', 'speech2003', 'china', 'nuke'];
  // dataPromise is the 1939 map; load(pid) fetches another period's map for the cuts that span all three
  function play(dataPromise, style, load) {
    style = style in DUR ? style : 'signal';
    return new Promise(resolve => {
      const box = document.getElementById('intro'), cv = document.getElementById('intro-cv');
      const tc = document.getElementById('intro-tc'), date = document.getElementById('intro-date');
      const c = cv.getContext('2d'), buf = document.createElement('canvas'), b = buf.getContext('2d');
      let W = 0, H = 0, dpr = 1, geo = null, data = null, t0 = 0, raf = 0, done = false;
      let lines = null, euro = null, shapes = null, TH = null, seq = null, SH = {};

      function size() {
        dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
        cv.width = buf.width = Math.round(W * dpr); cv.height = buf.height = Math.round(H * dpr);
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function finish() {
        if (done) return; done = true; cancelAnimationFrame(raf);
        for (const v of Object.values(clips)) { v.pause(); v.removeAttribute('src'); v.load(); }
        removeEventListener('keydown', key); removeEventListener('resize', size);
        box.classList.add('leaving');
        setTimeout(() => { box.hidden = true; box.classList.remove('leaving'); resolve(); }, 600);
      }
      const key = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish(); } };
      document.getElementById('intro-skip').onclick = finish;
      box.onclick = e => { if (e.target.id !== 'intro-skip') finish(); };
      addEventListener('keydown', key); addEventListener('resize', size);
      box.hidden = false; size();
      // optional footage: a clip is used only once it has data; a missing file just leaves the stand-in
      const clips = {};
      if (style === 'main') for (const nm of CLIP_NAMES) {
        const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.src = `media/intro/${nm}.mp4`; v.addEventListener('loadeddata', () => { clips[nm] = v; v.play().catch(() => {}); }, { once: true });
      }
      function footage(g, nm, u, tint, stand) {
        const v = clips[nm];
        if (v && v.readyState >= 2) {
          const k = Math.max(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * k, h = v.videoHeight * k;
          g.filter = 'grayscale(1) contrast(1.3)'; g.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); g.filter = 'none';
        } else stand(g, u);
        // tint, then a hard flash every so often
        g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
        if (Math.floor(u * 7) % 5 === 0 && (u * 7) % 1 < .35) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, W, H); }
      }

      const others = ALL_PERIODS[style] && load ? Promise.all([load('1900'), load('2003')]) : Promise.resolve([]);
      // until the maps arrive this is a plain loading screen: the name, a typed status line, a bar per map
      const parts = [dataPromise].concat(ALL_PERIODS[style] && load ? [load('1900'), load('2003')] : []);
      let got = 0; parts.forEach(pr => pr.then(() => { got++; }, () => {}));
      const tw = performance.now();
      (function wait(now) {
        if (t0 || done) return;
        const u = (now - tw) / 1000;
        b.setTransform(dpr, 0, 0, dpr, 0, 0); b.fillStyle = '#05040a'; b.fillRect(0, 0, W, H);
        b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillStyle = 'rgba(225,212,255,.9)';
        b.font = `300 ${Math.min(42, W / 16)}px "Spectral", Georgia, serif`; if ('letterSpacing' in b) b.letterSpacing = '18px';
        b.fillText('IMPERIUM', W / 2 + 9, H / 2 - 30); if ('letterSpacing' in b) b.letterSpacing = '0px';
        const msg = 'RECEIVING MAP SHEETS', n = Math.min(msg.length, Math.floor(u * 18));
        b.font = '500 12px "IBM Plex Mono", monospace'; b.fillStyle = 'rgba(255,255,255,.75)';
        b.fillText(msg.slice(0, n) + (Math.floor(u * 4) % 2 ? '_' : ' ') + `  ${got}/${parts.length}`, W / 2, H / 2 + 14);
        const bw = Math.min(260, W * .5), q = Math.min(1, (got + Math.min(.9, u / 3)) / parts.length);
        b.fillStyle = 'rgba(201,178,255,.2)'; b.fillRect(W / 2 - bw / 2, H / 2 + 34, bw, 1);
        b.fillStyle = 'rgba(255,79,216,.9)'; b.fillRect(W / 2 - bw / 2, H / 2 + 34, bw * q, 1);
        composite(Math.random() < .05 ? .5 : 0); tc.textContent = timecode(u); date.textContent = '';
        requestAnimationFrame(wait);
      })(tw);
      Promise.all([dataPromise, others]).then(([d, [d1900, d2003]]) => {
        data = d; geo = root.WorldMap.prepare(d);
        lines = coastLines(geo); shapes = nationShapes(d, geo); SH['1939'] = shapes;
        const g1900 = d1900 && root.WorldMap.prepare(d1900), g2003 = d2003 && root.WorldMap.prepare(d2003);
        if (d1900) SH['1900'] = nationShapes(d1900, g1900);
        if (d2003) SH['2003'] = nationShapes(d2003, g2003);
        TH = {
          poland: theatre(d, geo, { box: [-6, 60, 36, 40], att: 'Germany', def: 'Poland', from: 'BERLIN', to: 'WARSAW' }),
          france: theatre(d, geo, { box: [-8, 57, 22, 40], att: 'Germany', def: 'France', from: 'BERLIN', to: 'PARIS', near: 900 }),
          malaya: theatre(d, geo, { box: [92, 40, 146, -12], att: 'Japan', def: 'United Kingdom', from: 'TOKYO', to: 'SINGAPORE', at: [103.8, 1.35], near: 600 }),
          boer: d1900 && theatre(d1900, g1900, { box: [8, -14, 42, -36], att: 'United Kingdom', def: 'Transvaal', from: 'CAPE TOWN', fromAt: [18.4, -33.9], to: 'PRETORIA', at: [28.2, -25.7] }),
          iraq: d2003 && theatre(d2003, g2003, { box: [34, 40, 56, 26], att: 'Kuwait', def: 'Iraq', from: 'KUWAIT', to: 'BAGHDAD', at: [44.4, 33.3] })
        };
        euro = TH.poland;
        seq = SEQS[style] ? SEQS[style]() : null; if (seq) DUR[style] = seq.reduce((a, x) => a + x[0], 0);
        box.dataset.style = style;
        t0 = performance.now(); raf = requestAnimationFrame(frame);
      }, finish);
      // if the maps never arrive, do not hold the player hostage
      setTimeout(() => { if (!t0) finish(); }, 20000);

      function frame(now) {
        if (done) return;
        const t = Math.max(0, (now - t0) / 1000);   // the first frame can be stamped a hair before t0
        if (t >= DUR[style]) return finish();
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
        b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
        b.fillStyle = '#05040a'; b.fillRect(0, 0, W, H);
        let glitch = 0;
        if (seq) { let at = 0, cur = seq[seq.length - 1], u = 0; for (const x of seq) { if (t < at + x[0]) { cur = x; u = t - at; break; } at += x[0]; }
          glitch = cur[1](b, u) || 0; composite(glitch < 0 ? 0 : glitch + (u < .1 ? .6 : 0)); tc.textContent = timecode(t); date.textContent = cur[2] || ''; raf = requestAnimationFrame(frame); return; }
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
      const RED_MARCH = Object.assign({ units: true }, RED_PAL);
      // armies crossing the border: NATO symbols with dashed tracks behind them
      function marchUnits(g, t, E, toS) {
        const q = Math.max(0, Math.min(1, (t - .5) / 3.4)), ease = q * q * (3 - 2 * q);
        E.units.forEach(([sx, sy, ex, ey, type], i) => {
          const k = Math.max(0, Math.min(1, ease * 1.15 - i * .03));
          const a = toS(sx, sy), z = toS(ex, ey), x = a[0] + (z[0] - a[0]) * k, y = a[1] + (z[1] - a[1]) * k;
          g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.6; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
          if (root.NatoSymbols) root.NatoSymbols.drawUnit(g, x, y, 13, type, { affil: 'hostile', ech: 'XX' });
          else { g.fillStyle = '#ff5a64'; g.fillRect(x - 10, y - 7, 20, 14); }
        });
      }
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
      function card(g, t, text, sub, tone, bg) {
        if (bg) {
          bg(g, t);
          const gr = g.createLinearGradient(0, 0, W, 0);
          if (tone === 'blue') { gr.addColorStop(0, 'rgba(10,26,140,.5)'); gr.addColorStop(.7, 'rgba(42,60,255,.3)'); gr.addColorStop(1, 'rgba(223,230,255,.45)'); }
          else { gr.addColorStop(0, 'rgba(40,0,6,.25)'); gr.addColorStop(1, 'rgba(40,0,6,.25)'); }
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .1})`; g.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3); }
          tone = tone === 'blue' ? 'blue-over' : tone;
        } else if (tone === 'blue') {
          const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#0a1a8c'); gr.addColorStop(.7, '#2a3cff'); gr.addColorStop(1, '#dfe6ff');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .12})`; g.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3); }
        } else if (tone === 'red') { g.fillStyle = '#2a0006'; g.fillRect(0, 0, W, H); }
        const fs = Math.min(W / (text.length * .5), H * .2), x = W / 2, y = H / 2;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        if ('letterSpacing' in g) g.letterSpacing = (fs * .04).toFixed(1) + 'px';
        const j = t < .15 ? (Math.random() - .5) * 20 : 0;
        const blue = tone === 'blue' || tone === 'blue-over';
        g.fillStyle = blue ? '#f2d6ff' : tone === 'red' ? '#ff3b4f' : '#ffffff';
        g.shadowColor = blue ? 'rgba(10,10,80,.8)' : 'rgba(255,79,216,.6)'; g.shadowBlur = 18;
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
        if (E.units && pal.units) marchUnits(g, t, E, toS);
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
      function warEnd(g, t, over) {
        if (!over) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
        const fs = Math.min(W * .16, H * .22), a = Math.min(1, t / .25);
        g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; if ('letterSpacing' in g) g.letterSpacing = (fs * .06).toFixed(1) + 'px';
        g.fillStyle = '#e8202f'; g.shadowColor = 'rgba(255,40,50,.6)'; g.shadowBlur = 24; g.fillText('IMPERIUM', W / 2, H * .45); g.shadowBlur = 0;
        g.font = `500 ${Math.max(11, fs * .1)}px "IBM Plex Mono", monospace`; if ('letterSpacing' in g) g.letterSpacing = '6px';
        g.fillStyle = '#fff'; g.fillText('LEAD ANY NATION · 1900 · 1939 · 2003', W / 2, H * .45 + fs * .62);
        if ('letterSpacing' in g) g.letterSpacing = '0px'; g.globalAlpha = 1;
        const fadeAt = over ? 2.9 : 2.1;
        if (t > fadeAt) { g.fillStyle = `rgba(0,0,0,${Math.min(1, (t - fadeAt) / .5)})`; g.fillRect(0, 0, W, H); }
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
      function silhouette(g, nm, rect, fill, stroke, inner, period) {
        const S = (SH[period || '1939'] || shapes || {})[nm]; if (!S) return;
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
      function bigLabel(g, text, period) {
        const fs = Math.min(W / 9, H * .14);
        g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
        g.fillText(text, W * .06, H * .92);
        if (period) { g.font = `500 ${Math.min(22, W / 50)}px "IBM Plex Mono", monospace`; g.textAlign = 'right'; g.fillText(period, W * .94, H * .92); }
      }
      function silFrame(g, u, nm, inv, label, period) {
        g.fillStyle = inv ? '#d4141f' : '#000'; g.fillRect(0, 0, W, H);
        silhouette(g, nm, [W * .1, H * .1, W * .8, H * .72], inv ? '#000' : '#e8202f', inv ? '#000' : '#ff5a64', false, period);
        if (period) { g.font = `500 ${Math.min(22, W / 50)}px "IBM Plex Mono", monospace`; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.fillText(period, W * .94, H * .92); }
        for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, W, 1); }
        const fs = Math.min(W / 9, H * .14);
        g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
        g.fillText((label || nm).toUpperCase(), W * .06, H * .92);
        if (u < .05) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, W, H); }
        return u < .08 ? 1 : 0;
      }
      // ---------------------------------------------------------------- drawn stand-ins for footage
      const rnd = k => { const x = Math.sin(k * 127.1) * 43758.5453; return x - Math.floor(x); };
      function standMarch(g, u) {
        g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, W, H);
        const sky = g.createLinearGradient(0, 0, 0, H * .62); sky.addColorStop(0, '#2a2a2e'); sky.addColorStop(1, '#8a8478'); g.fillStyle = sky; g.fillRect(0, 0, W, H * .62);
        g.fillStyle = '#1a1916'; g.fillRect(0, H * .62, W, H * .38);
        // ranks of soldiers in step, nearer ranks larger and faster
        for (let r = 0; r < 6; r++) {
          const sc = .45 + r * .22, y0 = H * (.6 + r * .07), gap = 34 * sc, sp = 30 * sc;
          for (let i = -2; i < W / gap + 2; i++) {
            const x = ((i * gap + u * sp + r * 11) % (W + gap * 2)) - gap, step = Math.sin(u * 7 + i * .3) > 0;
            const h = 70 * sc; g.fillStyle = '#060606';
            g.beginPath(); g.ellipse(x, y0 - h, 6.5 * sc, 4.5 * sc, 0, Math.PI, 0); g.fill();            // helmet
            g.fillRect(x - 4.5 * sc, y0 - h, 9 * sc, h * .52);                                             // body
            g.fillRect(x + 4 * sc, y0 - h * 1.25, 1.6 * sc, h * .75);                                     // rifle
            const l = step ? 5 : -5; g.fillRect(x - 3.5 * sc + l * sc * .3, y0 - h * .48, 3 * sc, h * .48); g.fillRect(x + 1 * sc - l * sc * .3, y0 - h * .48, 3 * sc, h * .48); // legs
          }
        }
      }
      function standNavy(g, u) {
        const sky = g.createLinearGradient(0, 0, 0, H * .58); sky.addColorStop(0, '#3a3f44'); sky.addColorStop(1, '#a9a69c'); g.fillStyle = sky; g.fillRect(0, 0, W, H * .58);
        g.fillStyle = '#2c3034'; g.fillRect(0, H * .58, W, H * .42);
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(rnd(i) * W, H * (.6 + rnd(i + 9) * .4), 30 + rnd(i + 3) * 80, 1); }
        // a line of dreadnoughts steaming left, each with funnels, masts and a smoke trail
        for (let k = 0; k < 4; k++) {
          const sc = .6 + k * .25, len = 260 * sc, x = W * (1.1 - k * .22) - u * 40 * sc, y = H * (.56 + k * .055);
          g.fillStyle = '#121416';
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.lineTo(x + len * .96, y + 12 * sc); g.lineTo(x + len * .06, y + 12 * sc); g.closePath(); g.fill();
          g.fillRect(x + len * .25, y - 14 * sc, len * .45, 14 * sc);
          for (const f of [.33, .48]) { g.fillRect(x + len * f, y - 34 * sc, 9 * sc, 22 * sc); for (let s2 = 0; s2 < 8; s2++) { g.fillStyle = `rgba(30,30,30,${.25 - s2 * .03})`; g.beginPath(); g.arc(x + len * f + 5 * sc + s2 * 16 * sc, y - 40 * sc - s2 * 4 * sc, (6 + s2 * 3) * sc, 0, 7); g.fill(); } g.fillStyle = '#121416'; }
          g.fillRect(x + len * .2, y - 52 * sc, 2 * sc, 40 * sc); g.fillRect(x + len * .62, y - 46 * sc, 2 * sc, 34 * sc);
        }
      }
      function standSpeech(g, u) {
        // a generic speaker at a podium with microphones and banners; stands in for archive footage
        const bgl = g.createRadialGradient(W / 2, H * .35, 0, W / 2, H * .35, W * .6); bgl.addColorStop(0, '#9a9a9a'); bgl.addColorStop(1, '#2a2a2a'); g.fillStyle = bgl; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(40,40,40,.55)'; g.fillRect(W * (.14 + i * .29), 0, W * .12, H * .72); }
        const cx = W / 2 + Math.sin(u * 3) * 3, top = H * .3, gest = Math.sin(u * 5) * .5 + .5;
        g.fillStyle = '#050505';
        g.beginPath(); g.ellipse(cx, top, H * .055, H * .07, 0, 0, 7); g.fill();
        g.beginPath(); g.moveTo(cx - H * .16, H * .78); g.lineTo(cx - H * .12, top + H * .08); g.lineTo(cx + H * .12, top + H * .08); g.lineTo(cx + H * .16, H * .78); g.fill();
        g.save(); g.translate(cx + H * .11, top + H * .12); g.rotate(-.6 - gest * .9); g.fillRect(0, -H * .02, H * .22, H * .04); g.restore();
        g.fillStyle = '#0a0a0a'; g.fillRect(cx - H * .2, H * .56, H * .4, H * .44);
        for (const dx of [-.06, 0, .06]) { g.fillRect(cx + H * dx - 2, H * .44, 4, H * .12); g.beginPath(); g.arc(cx + H * dx, H * .44, 7, 0, 7); g.fill(); }
        // camera flashes
        if (rnd(Math.floor(u * 9)) > .8) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, W, H); }
      }
      function standChina(g, u) { standMarch(g, u * 1.3); }
      // a drawn nuclear blast: flash, fireball, rising stem and cap, shock ring
      function nuke(g, u) {
        g.fillStyle = '#0b0705'; g.fillRect(0, 0, W, H);
        const gy = H * .78, cx = W / 2, rise = Math.min(1, u / 1.4), R = H * (.08 + rise * .16);
        const sky = g.createRadialGradient(cx, gy - H * .3 * rise, 0, cx, gy - H * .3 * rise, W * .8);
        sky.addColorStop(0, 'rgba(255,170,90,.55)'); sky.addColorStop(1, 'rgba(40,10,0,0)'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.fillStyle = '#120a06'; g.fillRect(0, gy, W, H - gy);
        // stem
        const sw = R * .45; const st = g.createLinearGradient(0, gy, 0, gy - H * .42 * rise); st.addColorStop(0, '#5a2a12'); st.addColorStop(1, '#d26a2a');
        g.fillStyle = st; g.beginPath(); g.moveTo(cx - sw, gy); g.quadraticCurveTo(cx - sw * .4, gy - H * .2 * rise, cx - sw * .5, gy - H * .42 * rise); g.lineTo(cx + sw * .5, gy - H * .42 * rise); g.quadraticCurveTo(cx + sw * .4, gy - H * .2 * rise, cx + sw, gy); g.fill();
        // cap: many puffs around a torus
        const capY = gy - H * .45 * rise;
        for (let i = 0; i < 70; i++) { const a = rnd(i) * 6.28, rr = R * (.6 + rnd(i + 5) * .5); const x = cx + Math.cos(a) * rr * 1.4, y = capY + Math.sin(a) * rr * .5; const pr = R * (.25 + rnd(i + 2) * .25); const pg = g.createRadialGradient(x, y, 0, x, y, pr); pg.addColorStop(0, `rgba(255,${190 + rnd(i) * 60 | 0},120,.9)`); pg.addColorStop(1, 'rgba(120,40,10,0)'); g.fillStyle = pg; g.fillRect(x - pr, y - pr, pr * 2, pr * 2); }
        const core = g.createRadialGradient(cx, capY, 0, cx, capY, R); core.addColorStop(0, 'rgba(255,255,230,.95)'); core.addColorStop(1, 'rgba(255,140,40,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = core; g.fillRect(cx - R, capY - R, R * 2, R * 2);
        // shock ring along the ground
        g.strokeStyle = `rgba(255,220,180,${Math.max(0, .8 - u * .4)})`; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, gy, W * .1 + u * W * .35, 10 + u * 20, 0, 0, 7); g.stroke();
        g.globalCompositeOperation = 'source-over';
        // the opening flash, over everything
        if (u < .35) { g.fillStyle = `rgba(255,255,255,${1 - u / .35})`; g.fillRect(0, 0, W, H); }
      }
      // the space race: satellites and a station circling the globe
      function spaceRace(g, u) {
        globe(g, 2 + u, 0, 1);
        const R = Math.min(W, H) * .3, cx = W / 2, cy = H / 2 + 6;
        for (let k = 0; k < 4; k++) {
          const tilt = -.5 + k * .35, rx = R * (1.25 + k * .12), ry = rx * (.28 + k * .05), a = u * (1.4 - k * .2) + k * 1.7;
          g.save(); g.translate(cx, cy); g.rotate(tilt);
          g.strokeStyle = 'rgba(201,178,255,.35)'; g.setLineDash([3, 5]); g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.stroke(); g.setLineDash([]);
          const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
          g.fillStyle = '#fff'; g.shadowColor = '#ff4fd8'; g.shadowBlur = 14; g.fillRect(x - 4, y - 2, 8, 4); g.fillRect(x - 12, y - 1, 6, 2); g.fillRect(x + 6, y - 1, 6, 2); g.shadowBlur = 0;
          g.restore();
        }
        g.font = `800 ${Math.min(W / 9, H * .13)}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f2d6ff';
        g.shadowColor = 'rgba(255,79,216,.6)'; g.shadowBlur = 18; g.fillText('THE SPACE RACE', W / 2, H * .92); g.shadowBlur = 0;
      }
      // a quiet memorial card: no flash, no glitch
      function memorial(g, u) {
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        const a = Math.min(1, u / .5) * Math.min(1, (2.2 - u) / .5);
        g.globalAlpha = Math.max(0, a); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e8e8e8';
        g.font = `300 ${Math.min(W / 14, H * .1)}px "Spectral", Georgia, serif`; if ('letterSpacing' in g) g.letterSpacing = '6px';
        g.fillText('11 SEPTEMBER 2001', W / 2, H / 2 - 10);
        g.font = '500 12px "IBM Plex Mono", monospace'; if ('letterSpacing' in g) g.letterSpacing = '5px'; g.fillStyle = 'rgba(232,232,232,.7)';
        g.fillText('NEW YORK · WASHINGTON · PENNSYLVANIA', W / 2, H / 2 + 40);
        if ('letterSpacing' in g) g.letterSpacing = '0px'; g.globalAlpha = 1;
        return -1;   // no glitch on this card
      }
      // the red end card over marching troops
      function mainEnd(g, u) {
        footage(g, 'march', u, 'rgba(120,10,16,1)', standMarch);
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, W, H);
        const r = warEnd(g, u, true);
        return r;
      }

      const SEQS = {
        main: () => [
          [2.6, (g, u) => { globe(g, u, 0, Math.min(1, u / .6)); }, '01.01.1900'],
          [1.7, (g, u) => card(g, u, '5 JUNE 1900', 'THE AGE OF EMPIRES · PRETORIA', 'blue', (g2, v) => footage(g2, 'navy', v, 'rgba(90,110,200,1)', standNavy)), '05.06.1900'],
          [3.0, (g, u) => { theatreScene(g, u, TH.boer, LILAC_PAL); }, '05.06.1900'],
          [1.7, (g, u) => card(g, u, '1 SEPTEMBER 1939', 'THE WORLD AT WAR · POLAND', 'blue', (g2, v) => footage(g2, 'speech1939', v, 'rgba(90,110,200,1)', standSpeech)), '01.09.1939'],
          [4.4, (g, u) => { theatreScene(g, u, TH.poland, RED_MARCH); }, '01.09.1939'],
          [1.8, (g, u) => card(g, u, 'TOTAL WAR', '', 'black', (g2, v) => footage(g2, 'nuke', v, 'rgba(255,200,170,1)', nuke)), '06.08.1945'],
          [2.4, (g, u) => { spaceRace(g, u); }, '04.10.1957'],
          [2.2, (g, u) => memorial(g, u), '11.09.2001'],
          [1.7, (g, u) => card(g, u, '20 MARCH 2003', 'A NEW CENTURY · BAGHDAD', 'blue', (g2, v) => footage(g2, 'speech2003', v, 'rgba(90,110,200,1)', standSpeech)), '20.03.2003'],
          [3.0, (g, u) => { theatreScene(g, u, TH.iraq, LILAC_PAL); }, '20.03.2003'],
          [1.3, (g, u) => { footage(g, 'china', u, 'rgba(200,20,30,1)', standChina); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H); silhouette(g, 'China', [W * .1, H * .1, W * .8, H * .72], 'rgba(0,0,0,.92)', '#ff5a64', false, '2003'); bigLabel(g, 'CHINA', '2003'); return u < .08 ? 1 : 0; }, '20.03.2003'],
          [.5, (g, u) => silFrame(g, u, 'United States', false, null, '2003'), '20.03.2003'],
          [2.0, (g, u) => { globe(g, 20, Math.min(1, u / 1.2), 1, RED_PAL); }, '--.--.----'],
          [3.4, (g, u) => mainEnd(g, u), '--.--.----']
        ],
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
        // Signal across the century: Pretoria 1900, Warsaw 1939, Baghdad 2003
        eras: () => [
          [2.3, (g, u) => { globe(g, u, 0, Math.min(1, u / .6)); }, '05.06.1900'],
          [1.3, (g, u) => card(g, u, '5 JUNE 1900', 'THE AGE OF EMPIRES · PRETORIA', 'blue'), '05.06.1900'],
          [3.4, (g, u) => { theatreScene(g, u, TH.boer, LILAC_PAL); }, '05.06.1900'],
          [1.3, (g, u) => card(g, u, '1 SEPTEMBER 1939', 'THE WORLD AT WAR · WARSAW', 'blue'), '01.09.1939'],
          [3.4, (g, u) => { theatreScene(g, u, TH.poland, LILAC_PAL); }, '01.09.1939'],
          [1.3, (g, u) => card(g, u, '20 MARCH 2003', 'A NEW CENTURY · BAGHDAD', 'blue'), '20.03.2003'],
          [3.4, (g, u) => { theatreScene(g, u, TH.iraq, LILAC_PAL); }, '20.03.2003'],
          [2.0, (g, u) => { globe(g, 20, Math.min(1, u / 1.4), 1); }, '20.03.2003'],
          [2.9, (g, u) => endCard(g, u), '--.--.----']
        ],
        // War footing across the century: each era's powers in silhouette
        century: () => [
          [1.3, (g, u) => typed(g, u, '1900 · 1939 · 2003', 1.0), '01.01.1900'],
          [.9, (g, u) => card(g, u, 'EMPIRES', 'THE AGE OF EMPIRES', 'blue'), '01.01.1900'],
          [.4, (g, u) => silFrame(g, u, 'Austria-Hungary', false, null, '1900'), '01.01.1900'],
          [.4, (g, u) => silFrame(g, u, 'Ottoman Empire', true, null, '1900'), '01.01.1900'],
          [.4, (g, u) => silFrame(g, u, 'Qing China', false, null, '1900'), '01.01.1900'],
          [.9, (g, u) => card(g, u, 'WORLD WAR', 'THE WORLD AT WAR', 'red'), '01.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'Germany', true, null, '1939'), '01.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'Japan', false, null, '1939'), '01.09.1939'],
          [.4, (g, u) => silFrame(g, u, 'USSR', true, null, '1939'), '01.09.1939'],
          [.9, (g, u) => card(g, u, 'NEW ORDER', 'A NEW CENTURY', 'blue'), '20.03.2003'],
          [.4, (g, u) => silFrame(g, u, 'United States', false, null, '2003'), '20.03.2003'],
          [.4, (g, u) => silFrame(g, u, 'China', true, null, '2003'), '20.03.2003'],
          [.4, (g, u) => silFrame(g, u, 'Iraq', false, null, '2003'), '20.03.2003'],
          [2.2, (g, u) => { globe(g, 20, Math.min(1, u / 1.2), 1, RED_PAL); }, '--.--.----'],
          [2.6, (g, u) => warEnd(g, u), '--.--.----']
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
      // the land joined to the capital (so all of China, without far colonies), plus islands near it
      const keep = new Set([n.cap]), queue = [n.cap];
      while (queue.length) { const i = queue.pop(); for (const j of data.provinces[i].nb || []) if (!keep.has(j) && data.provinces[j].o === ni) { keep.add(j); queue.push(j); } }
      data.provinces.forEach((p, i) => { if (p.o === ni && !keep.has(i) && !(p.nb || []).some(j => data.provinces[j].o >= 0) && Math.hypot(geo.provs[i].lx - cap.lx, geo.provs[i].ly - cap.ly) < 250) keep.add(i); });
      for (const i of keep) {
        const q = geo.provs[i];
        path.addPath(q.path); inner.addPath(q.path); any = true;
        x0 = Math.min(x0, q.box[0]); y0 = Math.min(y0, q.box[1]); x1 = Math.max(x1, q.box[2]); y1 = Math.max(y1, q.box[3]);
      }
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
      const src = cfg.fromAt ? [geo.X(cfg.fromAt[0]), geo.Y(cfg.fromAt[1])] : [ac.lx, ac.ly];
      if (owner[i] === def && (!cfg.near || Math.hypot(p.lx - to[0], p.ly - to[1]) < cfg.near)) defList.push([Math.hypot(p.lx - src[0], p.ly - src[1]), p.path, [p.lx, p.ly]]);
    });
    defList.sort((a, b) => a[0] - b[0]);
    const defPts = defList.map(x => x[2]);
    for (const k of geo.arcsIn(box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)) {
      const u = geo.users[k], a = geo.arcs[k], target = u.length < 2 || owner[u[0]] !== owner[u[1]] ? border : prov;
      target.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) target.lineTo(a[i], a[i + 1]);
    }
    const pats = {};
    const hatch = (g, rgb) => { if (pats[rgb]) return pats[rgb]; const t = document.createElement('canvas'); t.width = t.height = 12; const x = t.getContext('2d'); x.strokeStyle = `rgba(${rgb},.95)`; x.lineWidth = 3; x.beginPath(); x.moveTo(-3, 15); x.lineTo(15, -3); x.moveTo(-3, 3); x.lineTo(3, -3); x.moveTo(9, 15); x.lineTo(15, 9); x.stroke(); const pt = g.createPattern(t, 'repeat'); pt.setTransform && pt.setTransform(new DOMMatrix().scale(.06)); return (pats[rgb] = pt); };
    const from = cfg.fromAt ? [geo.X(cfg.fromAt[0]), geo.Y(cfg.fromAt[1])] : [ac.lx, ac.ly];
    // armies for the march: from the attacker's side of the front to provinces spread through the defender
    const units = [];
    const picks = defList.filter((x, i) => i % Math.max(1, Math.floor(defList.length / 7)) === 0).slice(0, 7);
    picks.forEach((x, i) => { const pr = defPts[defList.indexOf(x)]; const dx = pr[0] - from[0], dy = pr[1] - from[1], l = Math.hypot(dx, dy) || 1; const back = Math.min(l * .5, 90); units.push([pr[0] - dx / l * (back + 40), pr[1] - dy / l * (back + 40), pr[0], pr[1], i % 3 === 0 ? 'armor' : 'inf']); });
    return { box, land, ger: attP, pol: defList.map(x => x[1]), prov, border, from, to, fromName: cfg.from, toName: cfg.to, hatch, units };
  }

  root.Intro = { play, seen() { try { return sessionStorage.getItem('imperium-intro') === '1'; } catch (e) { return false; } }, mark() { try { sessionStorage.setItem('imperium-intro', '1'); } catch (e) { /* storage unavailable */ } } };
})(window);
