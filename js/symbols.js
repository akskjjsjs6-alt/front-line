/* NATO (APP-6 / MIL-STD-2525) style unit symbols drawn on a canvas.
   Friendly units: blue rectangle. Hostile units: red diamond. Always from the viewer's side. */
(function (root) {
  const FRIEND = '#80e0ff', HOSTILE = '#ff8080', NEUTRAL = '#aaffaa', INK = '#0b0f14';

  // Echelon marks drawn above the frame.
  const ECHELON = { 'II': 'Battalion', 'III': 'Regiment', 'X': 'Brigade', 'XX': 'Division', 'XXX': 'Corps / Army' };

  function drawEchelon(ctx, ech, cx, topY, s) {
    if (!ech) return;
    ctx.save();
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = Math.max(1, s * 0.07); ctx.lineCap = 'round';
    const h = s * 0.26, y1 = topY - s * 0.08, y0 = y1 - h;
    if (ech[0] === 'I') {
      const n = ech.length, gap = s * 0.14, x0 = cx - gap * (n - 1) / 2;
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * gap, y0); ctx.lineTo(x0 + i * gap, y1); ctx.stroke(); }
    } else {
      const n = ech.length, w = h * 0.8, gap = w * 1.25, x0 = cx - gap * (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * gap;
        ctx.beginPath(); ctx.moveTo(x - w / 2, y0); ctx.lineTo(x + w / 2, y1); ctx.moveTo(x + w / 2, y0); ctx.lineTo(x - w / 2, y1); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Icon inside a box (bx,by,bw,bh); clip region is the frame.
  function drawIcon(ctx, type, bx, by, bw, bh, lw) {
    const cx = bx + bw / 2, cy = by + bh / 2;
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.fillStyle = INK;
    const oval = () => {
      const ow = bw * 0.62, oh = bh * 0.46, r = oh / 2;
      ctx.beginPath();
      ctx.moveTo(cx - ow / 2 + r, cy - oh / 2); ctx.lineTo(cx + ow / 2 - r, cy - oh / 2);
      ctx.arc(cx + ow / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(cx - ow / 2 + r, cy + oh / 2);
      ctx.arc(cx - ow / 2 + r, cy, r, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath(); ctx.stroke();
    };
    const cross = () => { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by + bh); ctx.moveTo(bx + bw, by); ctx.lineTo(bx, by + bh); ctx.stroke(); };
    switch (type) {
      case 'inf': cross(); break;
      case 'mech': cross(); oval(); break;
      case 'armor': oval(); break;
      case 'recon': ctx.beginPath(); ctx.moveTo(bx, by + bh); ctx.lineTo(bx + bw, by); ctx.stroke(); break;
      case 'art': ctx.beginPath(); ctx.arc(cx, cy, Math.min(bw, bh) * 0.13, 0, Math.PI * 2); ctx.fill(); break;
      case 'mlrs': {
        ctx.beginPath(); ctx.arc(cx, cy + bh * 0.12, Math.min(bw, bh) * 0.12, 0, Math.PI * 2); ctx.fill();
        const w = bw * 0.16, h = bh * 0.14;
        for (let i = 0; i < 2; i++) {
          const y = cy - bh * 0.08 - i * h * 1.1;
          ctx.beginPath(); ctx.moveTo(cx - w, y); ctx.lineTo(cx, y - h); ctx.lineTo(cx + w, y); ctx.stroke();
        }
        break;
      }
      case 'ad': ctx.beginPath(); ctx.ellipse(cx, by + bh, bw * 0.36, bh * 0.62, 0, Math.PI, Math.PI * 2); ctx.stroke(); break;
      case 'heli': {
        const w = bw * 0.3, h = bh * 0.32;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - w, cy - h); ctx.lineTo(cx - w, cy + h); ctx.closePath();
        ctx.moveTo(cx, cy); ctx.lineTo(cx + w, cy - h); ctx.lineTo(cx + w, cy + h); ctx.closePath(); ctx.fill();
        break;
      }
      case 'uas': {
        const w = bw * 0.32, h = bh * 0.34;
        ctx.beginPath(); ctx.moveTo(cx - w, cy - h * 0.6); ctx.lineTo(cx, cy + h * 0.25); ctx.lineTo(cx + w, cy - h * 0.6);
        ctx.lineTo(cx + w, cy - h * 0.15); ctx.lineTo(cx, cy + h * 0.75); ctx.lineTo(cx - w, cy - h * 0.15); ctx.closePath(); ctx.fill();
        break;
      }
      case 'hq': {
        ctx.font = `800 ${Math.round(bh * 0.5)}px "Barlow Condensed", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HQ', cx, cy + bh * 0.03);
        break;
      }
    }
  }

  /* Draw a unit symbol centred at (cx,cy). s = frame height for friendly.
     opts: { friendly, ech, str (0..100), selected, dim } */
  function drawUnit(ctx, cx, cy, s, type, opts) {
    const affil = opts.affil || (opts.friendly === false ? 'hostile' : 'friend');
    const friendly = affil === 'friend';
    const lw = Math.max(1, s * 0.075);
    ctx.save();
    if (opts.dim) ctx.globalAlpha = 0.55;
    let top, bottom, box;
    ctx.beginPath();
    if (friendly) {
      const w = s * 1.5, h = s;
      ctx.rect(cx - w / 2, cy - h / 2, w, h);
      top = cy - h / 2; bottom = cy + h / 2;
      box = [cx - w / 2, cy - h / 2, w, h];
    } else if (affil === 'neutral') {
      const h = s * 1.1;
      ctx.rect(cx - h / 2, cy - h / 2, h, h);
      top = cy - h / 2; bottom = cy + h / 2;
      box = [cx - h / 2, cy - h / 2, h, h];
    } else {
      const d = s * 0.82;
      ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath();
      top = cy - d; bottom = cy + d;
      const q = d; box = [cx - q / 2, cy - q / 2, q, q];
    }
    if (opts.selected) { ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = s * 0.6; ctx.lineWidth = lw * 3; ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = friendly ? FRIEND : affil === 'neutral' ? NEUTRAL : HOSTILE; ctx.fill();
    ctx.save(); ctx.clip();
    drawIcon(ctx, type, box[0], box[1], box[2], box[3], lw);
    ctx.restore();
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
    if (type === 'hq') { // HQ staff
      const x = friendly ? cx - s * 0.75 : affil === 'neutral' ? cx - s * 0.55 : cx - s * 0.82;
      const y = friendly || affil === 'neutral' ? bottom : cy;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * 0.7); ctx.stroke();
    }
    drawEchelon(ctx, opts.ech, cx, top, s);
    if (opts.str != null) {
      const bw = s * 1.5, bh = Math.max(2, s * 0.16), by = bottom + s * 0.14;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(cx - bw / 2 - 1, by - 1, bw + 2, bh + 2);
      const f = Math.max(0, Math.min(1, opts.str / 100));
      ctx.fillStyle = f > 0.6 ? '#5ee07a' : f > 0.3 ? '#f2c94c' : '#ff5a4f';
      ctx.fillRect(cx - bw / 2, by, bw * f, bh);
    }
    ctx.restore();
    return { top, bottom };
  }

  root.NatoSymbols = { drawUnit, ECHELON, FRIEND, HOSTILE, NEUTRAL };
})(typeof window !== 'undefined' ? window : globalThis);
