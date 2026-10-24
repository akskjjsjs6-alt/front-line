/* Front Line: screens, panels and the real-time game loop. */
(function () {
  'use strict';
  const W = World, $ = id => document.getElementById(id);
  const SAVE = 'frontline-world-v3', HELP = 'frontline-help-v2';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cache = {};
  let data = null, g = null, map = null, pickMap = null, pickState = null, pickSel = -1, period = null;
  let sel = { armies: [], prov: -1 }, hoverProv = -1, diploLog = [], busy = false, aiState = 'unknown';
  let pickGen = null, pickProv = null, frontCache = { at: 0, key: '', list: [] };
  // the clock: speed 0 is paused; game days per real second for each speed
  const DAYS_PER_SEC = [0, 1, 3, 8];
  let speed = 0, lastSpeed = 1, acc = 0, lastFrame = 0, gmBusy = false, battleNotes = new Map(), lastSave = 0, captureToast = 0;

  async function loadData(pid) {
    if (!cache[pid]) cache[pid] = fetch(W.PERIODS[pid].file).then(r => { if (!r.ok) throw new Error('map ' + r.status); return r.json(); });
    return cache[pid];
  }

  // ================================================================ start screen
  function boot() {
    drawStartBg();
    const list = $('period-list');
    for (const pid of Object.keys(W.PERIODS)) {
      const P = W.PERIODS[pid], b = document.createElement('button');
      b.className = 'period';
      b.innerHTML = `<canvas width="720" height="300"></canvas><div class="body"><div class="yr">${pid}</div><div class="nm">${P.title}</div><p>${P.blurb}</p></div>`;
      b.onclick = () => openPick(pid);
      list.appendChild(b);
      loadData(pid).then(d => drawPreview(b.querySelector('canvas'), d, pid)).catch(() => {});
    }
    const saved = readSave();
    if (saved) { $('continue-wrap').hidden = false; $('btn-continue').textContent = `Continue: ${saved.g.nations[saved.g.player].name}, ${W.dateLabel(saved.g)}`; }
    $('btn-continue').onclick = continueGame;
    $('pick-back').onclick = () => show('start');
    $('pick-search').oninput = pickSearch;
    pingAI();
    addEventListener('resize', () => { if (map && !$('game').hidden) map.resize(); if (pickMap && !$('pick').hidden) pickMap.resize(); if (!$('start').hidden) drawStartBg(); });
    addEventListener('keydown', onKey);
    requestAnimationFrame(frame);
  }
  function show(id) { for (const s of ['start', 'pick', 'game', 'battle']) $(s).hidden = s !== id; }
  function drawStartBg() {
    const cv = $('start-bg'), c = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
    const gr = c.createRadialGradient(cv.width / 2, 0, 50, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height));
    gr.addColorStop(0, '#17222e'); gr.addColorStop(1, '#07090c'); c.fillStyle = gr; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(120,150,180,.06)';
    for (let x = 0; x < cv.width; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, cv.height); c.stroke(); }
    for (let y = 0; y < cv.height; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(cv.width, y); c.stroke(); }
  }
  function drawPreview(cv, d, pid) { WorldMap.renderPreview(cv, d, W.newGame(d, pid)); }
  async function pingAI() {
    try {
      const res = await fetch(GM.AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'ping' }) });
      const out = await res.json().catch(() => ({}));
      aiState = res.ok && out.ok ? 'on' : 'off';
    } catch (e) { aiState = 'off'; }
    $('ai-status').textContent = aiState === 'on' ? 'AI game master: online. Other nations are played by an AI.' : 'AI game master: offline right now. You can still play; nations follow simple built-in rules until it is back.';
    updateBadge();
  }
  function updateBadge() {
    const b = $('ai-badge'); if (!b) return;
    b.className = 'ai-badge ' + (aiState === 'on' ? 'on' : aiState === 'off' ? 'off' : '');
    b.textContent = aiState === 'on' ? '● AI online' : aiState === 'off' ? '● AI offline' : '● AI…';
  }

  // ================================================================ pick a nation
  async function openPick(pid) {
    period = pid;
    show('pick');
    $('pick-title').textContent = `${pid} · ${W.PERIODS[pid].title}`;
    $('pick-card').hidden = true; pickSel = -1; $('pick-search').value = ''; $('pick-results').hidden = true;
    data = await loadData(pid);
    pickState = W.newGame(data, pid);
    window.WorldData = data;
    if (pickMap) pickMap.cv.replaceWith(pickMap.cv = cloneCanvas(pickMap.cv));
    pickMap = new WorldMap($('pick-map'), data, {
      state: () => pickState,
      onClick: p => { if (p >= 0 && pickState.owner[p] >= 0) choosePick(pickState.owner[p]); },
      onHover: (p, pt) => {},
      highlights: () => pickSel < 0 ? [] : W.provincesOf(pickState, pickSel).map(p => ({ p, fill: 'rgba(255,255,255,.35)' })),
      armies: () => [], battles: () => []
    });
    pickMap.resize(); pickMap.paint(); pickMap.cam.z = pickMap.fitZ() * 2.2; pickMap.cam.x = pickMap.W * 0.42; pickMap.cam.y = pickMap.H * 0.12; pickMap.clamp();
    const q = $('pick-quick'); q.innerHTML = '';
    pickState.nations.map((n, i) => [n, i]).filter(([n]) => n.great).sort((a, b) => b[0].startDiv - a[0].startDiv).forEach(([n, i]) => {
      const c = document.createElement('button'); c.className = 'chip';
      c.innerHTML = `<i class="swatch" style="background:${n.color}"></i>${esc(n.name)}`;
      c.onclick = () => { choosePick(i); pickMap.focus(n.cap, 2.2); };
      q.appendChild(c);
    });
  }
  function cloneCanvas(cv) { const n = document.createElement('canvas'); n.id = cv.id; return n; }
  function choosePick(i) {
    pickSel = i;
    const n = pickState.nations[i], card = $('pick-card');
    const div = Math.round(W.divisions(pickState, i)), provs = W.provincesOf(pickState, i).length;
    card.innerHTML = `<button class="x" aria-label="Close">×</button><h3><i class="swatch" style="background:${n.color}"></i>${esc(n.name)}</h3>
      <div class="meta">${esc(n.leader || 'Leader unknown')}${n.gov ? ' · ' + esc(n.gov) : ''}</div>
      <div class="rows"><span>Power</span><span>${n.great ? 'Great power' : div > 15 ? 'Regional power' : 'Minor nation'}</span>
      <span>Army</span><span>${div} divisions</span><span>Provinces</span><span>${provs}</span><span>Economy</span><span>${n.eco}</span>
      ${n.wars.length ? `<span>At war with</span><span>${n.wars.map(w => esc(pickState.nations[w].name)).join(', ')}</span>` : ''}
      ${n.allies.length ? `<span>Allies</span><span>${n.allies.slice(0, 6).map(w => esc(pickState.nations[w].name)).join(', ')}${n.allies.length > 6 ? '…' : ''}</span>` : ''}</div>
      <div class="acts"><button class="btn primary" id="pick-go">Lead ${esc(n.name)}</button></div>`;
    card.hidden = false;
    card.querySelector('.x').onclick = () => { card.hidden = true; pickSel = -1; };
    $('pick-go').onclick = () => startGame(period, n.name);
  }
  function pickSearch() {
    const q = $('pick-search').value.trim().toLowerCase(), box = $('pick-results');
    if (!q) { box.hidden = true; return; }
    const hits = pickState.nations.map((n, i) => [n, i]).filter(([n]) => n.alive && n.name.toLowerCase().includes(q)).slice(0, 12);
    box.innerHTML = hits.length ? '' : '<button disabled>No match</button>';
    for (const [n, i] of hits) {
      const b = document.createElement('button'); b.innerHTML = `<i class="swatch" style="background:${n.color}"></i>${esc(n.name)}`;
      b.onclick = () => { box.hidden = true; $('pick-search').value = ''; choosePick(i); pickMap.focus(n.cap, 2.2); };
      box.appendChild(b);
    }
    box.hidden = false;
  }

  // ================================================================ game setup
  function startGame(pid, name) {
    g = W.newGame(data, pid, name);
    g.news = []; diploLog = [];
    enterGame();
    saveGame();
    if (!store.get(HELP)) { store.set(HELP, '1'); showHelp(); }
    else toast(`You lead ${g.nations[g.player].name}. The game is paused: press ▶ when you are ready.`, 'info', 6000);
  }
  async function continueGame() {
    const s = readSave(); if (!s) return;
    data = await loadData(s.period); period = s.period; g = s.g; diploLog = s.diploLog || [];
    enterGame();
    toast(`Welcome back. ${W.dateLabel(g)}.`, 'info');
  }
  function readSave() { try { const s = JSON.parse(store.get(SAVE)); return s && s.g && s.g.v === 3 ? s : null; } catch (e) { return null; } }
  function saveGame() { if (g) store.set(SAVE, JSON.stringify({ period: g.period, g, diploLog })); }

  function enterGame() {
    window.WorldData = data; W.attach(data);
    show('game');
    sel = { armies: [], prov: -1 }; battleNotes = new Map(); setSpeed(0); acc = 0;
    W.drainEvents(); W.drainChanged();
    if (map) { const old = $('map'), n = cloneCanvas(old); old.replaceWith(n); }
    map = new WorldMap($('map'), data, {
      state: () => g, onClick, onHover, highlights, armies: armyViews, battles: battleViews, fronts
    });
    map.resize(); map.paint();
    map.focus(g.nations[g.player].cap, 2.6);
    bindGameUi();
    renderAll();
    updateBadge();
  }

  let uiBound = false;
  function bindGameUi() {
    if (uiBound) return; uiBound = true;
    document.querySelectorAll('.tabs [data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    $('side-toggle').onclick = () => { $('side').classList.toggle('collapsed'); $('side-toggle').textContent = $('side').classList.contains('collapsed') ? '▴' : '▾'; };
    document.querySelectorAll('#clock [data-speed]').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
    $('btn-menu').onclick = showMenu;
  }
  function setTab(t) {
    document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    for (const k of ['orders', 'army', 'diplo', 'news']) $('tab-' + k).hidden = k !== t;
    $('side').classList.remove('collapsed'); $('side-toggle').textContent = '▾';
    if (t === 'news') $('news-dot').hidden = true;
  }

  // ================================================================ map callbacks
  function armyType(n) {
    const t = n.tech;
    if (g.period === '1900') return 'inf';
    if (g.period === '1939') return t >= 1.2 ? 'armor' : t >= 1.0 ? 'mech' : 'inf';
    return t >= 1.3 ? 'armor' : t >= 0.95 ? 'mech' : 'inf';
  }
  function affil(n) { return n === g.player || W.allied(g, n, g.player) ? 'friend' : W.atWar(g, n, g.player) ? 'hostile' : 'neutral'; }
  function armyViews() {
    return g.armies.map(a => ({
      ...a, ref: a, type: armyType(g.nations[a.n]), affil: affil(a.n),
      ech: a.div >= 20 ? 'XXX' : a.div >= 5 ? 'XX' : a.div >= 1 ? 'X' : 'III',
      selected: sel.armies.includes(a) || (pickGen && pickGen.armies.includes(a.id)), showPath: a.n === g.player,
      always: a.n === g.player || W.atWar(g, a.n, g.player) || W.allied(g, a.n, g.player),
      genColor: a.n === g.player ? (W.generalOf(g, a) || {}).color : null,
      pathColor: a.retreat ? '#ffcf5a' : hostileGoal(a) ? '#ff8a80' : '#ffffff'
    }));
  }
  function battleViews() {
    return g.battles.map(b => ({ x: b.x, y: b.y, mine: battleIsMine(b) }));
  }
  function battleIsMine(b) { return b.A.concat(b.D).some(id => { const a = g.armies.find(x => x.id === id); return a && (a.n === g.player || W.allied(g, a.n, g.player)); }); }
  function hostileGoal(a) { const c = a.goal >= 0 ? g.ctrl[a.goal] : -1; return c >= 0 && W.atWar(g, a.n, c); }
  function highlights() {
    const out = [];
    if (sel.armies.length && hoverProv >= 0) {
      const ok = W.canEnter(g, g.player, hoverProv), c = g.ctrl[hoverProv], enemy = c >= 0 && W.atWar(g, g.player, c);
      out.push({ p: hoverProv, fill: !ok ? 'rgba(0,0,0,.25)' : enemy ? 'rgba(255,90,82,.32)' : 'rgba(255,255,255,.18)' });
    } else if (sel.prov >= 0) out.push({ p: sel.prov, outline: 'rgba(255,255,255,.45)', fill: 'rgba(0,0,0,0)' });
    for (const gen of g.generals || []) if (gen.n === g.player && gen.order && gen.order.prov != null && gen.armies.length) out.push({ p: gen.order.prov, outline: gen.color });
    return out;
  }
  function onHover(p, pt, view) {
    const tip = $('tooltip');
    hoverProv = p;
    if (view) {
      const n = g.nations[view.n];
      const where = view.sea ? 'At sea' : view.p >= 0 ? data.provinces[view.p].n : '';
      tip.innerHTML = `<b>${esc(n.name)} army</b><br>${view.div.toFixed(1)} divisions · morale ${Math.round(view.org)}%<br><span class="dim">${esc(where)}${view.battle ? ' · fighting' : view.retreat ? ' · retreating' : view.route.length && view.n === g.player && view.goal >= 0 ? ' → ' + esc(data.provinces[view.goal].n) : ''}</span>`;
    } else if (p >= 0) {
      const o = g.owner[p], c = g.ctrl[p];
      tip.innerHTML = `<b>${esc(data.provinces[p].n)}</b><br>${o >= 0 ? esc(g.nations[o].name) : 'Unclaimed land'}${c !== o && c >= 0 ? `<br><span style="color:#ff9f6a">Occupied by ${esc(g.nations[c].name)}</span>` : ''}${o >= 0 && o !== g.player ? `<br><span class="dim">Relations ${W.rel(g, o, g.player)}${W.atWar(g, o, g.player) ? ' · AT WAR' : W.allied(g, o, g.player) ? ' · ally' : ''}</span>` : ''}`;
    } else { tip.hidden = true; return; }
    tip.hidden = false;
    const r = tip.getBoundingClientRect(), st = $('map').getBoundingClientRect();
    tip.style.left = Math.min(st.width - r.width - 8, pt.x + 14) + 'px'; tip.style.top = Math.min(st.height - r.height - 8, pt.y + 14) + 'px';
  }
  function onClick(p, ev) {
    if (busy) return;
    $('tooltip').hidden = true;
    if (ev.right) { clearSel(); endPicking(); return; }
    const view = ev.army, army = view && view.ref;
    if (pickGen) {
      if (army && army.n === g.player) {
        const has = pickGen.armies.includes(army.id);
        W.assignArmy(g, has ? null : pickGen, army);
        toast(has ? 'Army returned to your direct command.' : `Army placed under ${pickGen.name}.`, 'good', 1800);
        renderArmy();
      }
      return;
    }
    if (pickProv) {
      if (p >= 0) { const f = pickProv; endPicking(); f(p); }
      return;
    }
    // tap your own army: select it (shift or the "add" button keeps the others selected)
    if (army && army.n === g.player) {
      if (ev.shift || sel.adding) { if (!sel.armies.includes(army)) sel.armies.push(army); else sel.armies = sel.armies.filter(a => a !== army); }
      else if (sel.armies.length === 1 && sel.armies[0] === army) { clearSel(); return; }
      else sel.armies = [army];
      sel.prov = -1;
      if (sel.armies.length) armyCard(); else clearSel();
      return;
    }
    if (sel.armies.length) {
      // tap anywhere: the selected armies march there
      if (army) { p = army.p; ev.ll = [army.x, army.y]; }
      if (p < 0) { toast('That is sea. Tap a coast and armies ship there from a port.', 'info', 2500); return; }
      const o = g.ctrl[p];
      if (o >= 0 && o !== g.player && !W.canEnter(g, g.player, p)) { toast(`You are not at war with ${g.nations[o].name}. Declare war in Diplomacy first.`, 'bad'); return; }
      sendArmies(sel.armies, p, ev.ll);
      return;
    }
    if (army) { if (army.p >= 0) selectProvince(army.p); return; }
    if (p >= 0) selectProvince(p); else clearSel();
  }
  function sendArmies(list, p, ll) {
    let ok = 0, sea = 0, fail = 0;
    list.forEach((a, k) => {
      // fan several armies out a little around the spot
      const off = list.length > 1 ? [(k % 3 - 1) * 0.18, (Math.floor(k / 3) % 3 - 1) * 0.14] : [0, 0];
      let pt = ll ? [ll[0] + off[0], ll[1] + off[1]] : null;
      if (pt && W.locate(data, pt[0], pt[1], p) !== p) pt = ll;
      if (a.battle) { a.battle = 0; a.retreat = 1.5; a.org = Math.max(5, a.org - 10); }
      const r = W.orderTo(data, g, a, p, pt);
      if (r) { ok++; if (r === 'sea') sea++; const gen = W.generalOf(g, a); if (gen) a.manual = true; } else fail++;
    });
    const c = g.ctrl[p], enemy = c >= 0 && W.atWar(g, g.player, c), name = data.provinces[p].n;
    if (!ok) { toast('Your armies cannot reach that place from here.', 'bad'); return; }
    toast(sea ? `Shipping troops to ${name} from the nearest port.` : enemy ? `Attacking toward ${name}.` : `Marching to ${name}.`, enemy ? 'bad' : 'good', 2200);
    if (fail) toast(`${fail} arm${fail > 1 ? 'ies' : 'y'} could not find a way there.`, 'info', 2500);
    if (speed === 0) toast('The game is paused. Press ▶ to start the march.', 'info', 3000);
    armyCard(); renderQueue();
  }
  function armyCard() {
    sel.armies = sel.armies.filter(a => g.armies.includes(a));
    if (!sel.armies.length) { clearSel(); return; }
    const card = $('sel-card'), list = sel.armies, a = list[0], n = g.nations[a.n];
    const div = list.reduce((t, x) => t + x.div, 0), org = list.reduce((t, x) => t + x.org * x.div, 0) / div;
    const state = x => x.battle ? 'Fighting' : x.retreat ? 'Retreating' : x.sea ? 'At sea' : x.route.length ? 'Moving to ' + (x.goal >= 0 ? data.provinces[x.goal].n : 'a point') : 'Holding';
    const title = list.length > 1 ? `${list.length} armies selected` : `Army in ${a.p >= 0 ? data.provinces[a.p].n : 'transit'}`;
    card.innerHTML = `<button class="x" aria-label="Close">×</button><h3><i class="swatch" style="background:${n.color}"></i>${esc(title)}</h3>
      <div class="rows"><span>Divisions</span><span>${div.toFixed(1)}</span><span>Morale</span><span>${Math.round(org)}%</span><span>Orders</span><span>${esc(list.length > 1 ? [...new Set(list.map(state))].join(', ') : state(a))}</span></div>
      <p class="meta">Tap <b>anywhere</b> on the map to send ${list.length > 1 ? 'them' : 'it'} there. Enemy land is taken as you march through it. ${sel.adding ? '<b>Tap more armies to add them.</b>' : ''}</p>
      <div class="acts"><button class="btn small" id="a-add">${sel.adding ? 'Stop adding' : '+ Add armies'}</button>${list.length === 1 && a.div >= 2 ? '<button class="btn small" id="a-split">Split</button>' : ''}${list.length > 1 ? '<button class="btn small" id="a-merge">Merge</button>' : ''}${list.some(x => x.route.length) ? '<button class="btn small" id="a-stop">Stop</button>' : ''}<button class="btn small" id="a-done">Done</button></div>`;
    card.hidden = false;
    card.querySelector('.x').onclick = clearSel; $('a-done').onclick = clearSel;
    $('a-add').onclick = () => { sel.adding = !sel.adding; armyCard(); };
    if ($('a-split')) $('a-split').onclick = () => { const b = W.addArmy(g, a.n, a.p, a.div / 2, [a.x + 0.12, a.y]); b.org = a.org; b.p = a.p; a.div /= 2; sel.armies = [a, b]; armyCard(); toast('Army split in two. Both are selected.', 'info', 2500); };
    if ($('a-merge')) $('a-merge').onclick = () => {
      const keep = list.slice().sort((x, y) => y.div - x.div)[0], far = list.filter(x => x !== keep && W.kmLL(x.x, x.y, keep.x, keep.y) > 60);
      if (far.length) { toast('Armies must be next to each other to merge. Send them to the same spot first.', 'bad', 3500); return; }
      for (const x of list) if (x !== keep && !x.battle) { keep.org = (keep.org * keep.div + x.org * x.div) / (keep.div + x.div); keep.div += x.div; x.div = 0; }
      g.armies = g.armies.filter(x => x.div > 0); sel.armies = [keep]; armyCard(); toast('Armies merged.', 'good', 2000);
    };
    if ($('a-stop')) $('a-stop').onclick = () => { for (const x of list) if (!x.retreat) W.stop(x); armyCard(); renderQueue(); };
  }
  function selectProvince(p) {
    sel = { armies: [], prov: p };
    const pr = data.provinces[p], o = g.owner[p], c = g.ctrl[p], n = o >= 0 ? g.nations[o] : null, card = $('sel-card');
    const here = g.armies.filter(a => a.p === p);
    const cost = W.PERIODS[g.period].recruitCost;
    let acts = '';
    if (o === g.player && c === g.player) acts += `<button class="btn small" id="p-recruit" ${g.nations[g.player].money < cost ? 'disabled' : ''}>Raise 1 division here (${cost})</button>`;
    if (o >= 0 && o !== g.player) {
      acts += `<button class="btn small" id="p-talk">Talk to ${esc(n.name)}</button>`;
      acts += W.atWar(g, g.player, o) ? `<button class="btn small" id="p-peace">Offer peace</button>` : `<button class="btn small danger" id="p-war">Declare war</button>`;
    }
    card.innerHTML = `<button class="x" aria-label="Close">×</button><h3>${esc(pr.n)}</h3>
      <div class="meta">${n ? `<i class="swatch" style="background:${n.color}"></i> ${esc(n.name)}` : 'Unclaimed land'}${c !== o && c >= 0 ? ` · <span style="color:#ff9f6a">occupied by ${esc(g.nations[c].name)}</span>` : ''}${pr.c ? ' · coastal port' : ''}${g.nations.some(x => x.alive && x.cap === p) ? ' · capital' : ''}</div>
      ${here.length ? here.map(a => `<div class="army-row"><i class="swatch" style="background:${g.nations[a.n].color}"></i>${esc(g.nations[a.n].name)}: ${a.div.toFixed(1)} div${a.n === g.player ? `<button class="btn small" data-army="${a.id}">Select</button>` : ''}</div>`).join('') : '<div class="meta">No armies here.</div>'}
      <div class="acts" style="margin-top:10px">${acts}</div>`;
    card.hidden = false;
    card.querySelector('.x').onclick = clearSel;
    card.querySelectorAll('[data-army]').forEach(b => b.onclick = () => { sel = { armies: [g.armies.find(a => a.id === +b.dataset.army)], prov: -1 }; armyCard(); });
    if ($('p-recruit')) $('p-recruit').onclick = () => { if (W.recruit(data, g, g.player, 1, p)) { toast('1 division raised.', 'good', 2000); selectProvince(p); renderAll(); } };
    if ($('p-talk')) $('p-talk').onclick = () => openChat(o);
    if ($('p-peace')) $('p-peace').onclick = () => openChat(o, 'We propose an end to this war. What terms would you accept?');
    if ($('p-war')) $('p-war').onclick = () => confirmWar(o);
  }
  function clearSel() { sel = { armies: [], prov: -1 }; $('sel-card').hidden = true; }

  // ================================================================ panels
  function renderAll() { renderHud(); renderOrders(); renderArmy(); renderDiplo(); renderNews(); renderBattles(); }
  function renderHud() {
    const n = g.nations[g.player];
    $('hud-color').style.background = n.color; $('hud-name').textContent = n.name;
    $('hud-date').textContent = n.leader || '';
    $('clock-date').textContent = W.dayLabel(g);
    const net = W.income(data, g, g.player) - W.upkeep(g, g.player);
    $('hud-money').textContent = `${Math.floor(n.money)} (${net >= 0 ? '+' : ''}${net.toFixed(0)})`;
    $('hud-div').textContent = W.divisions(g, g.player).toFixed(0);
    $('hud-stab').textContent = Math.round(n.stab) + '%';
    $('hud-wars').textContent = n.wars.length ? n.wars.map(w => g.nations[w].name).join(', ') : 'None';
  }
  const SUGGEST = {
    '1900': ['Expand the navy', 'Build railways across the country', 'Seek a colonial treaty with Britain', 'Fund universities and science', 'Crack down on anarchists'],
    '1939': ['Rearm: double tank production', 'Propose a non-aggression pact with a neighbour', 'Mobilise the army', 'Invest in heavy industry', 'Launch a propaganda campaign'],
    '2003': ['Push a UN resolution', 'Impose sanctions on a rival', 'Invest in drones and cyber warfare', 'Cut taxes to boost growth', 'Hold a snap election']
  };
  function renderOrders() {
    const t = $('tab-orders'), n = g.nations[g.player], cost = W.PERIODS[g.period].recruitCost;
    const focused = document.activeElement && document.activeElement.id === 'orders-text';
    if (focused) { renderQueue(); return; }
    t.innerHTML = `<h4>Your government's orders</h4>
      <p class="help">Write in plain words what your nation does: laws, deals, spending, threats, anything. It goes to the world at the start of next month (in ${W.daysToMonth(g)} days) and the AI decides how it turns out.</p>
      <textarea class="orders" id="orders-text" placeholder="e.g. ${esc(SUGGEST[g.period][0])}. Send an envoy to …" maxlength="2500">${esc(g.orders || '')}</textarea>
      <div class="chips">${SUGGEST[g.period].map(s => `<button class="chip" data-s="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>
      <h4>Raise troops</h4>
      <p class="help">New divisions appear in your capital. Each costs ${cost}, plus a little upkeep every month.</p>
      <div class="recruit"><button class="btn small" id="r1" ${n.money < cost ? 'disabled' : ''}>+1 division</button><button class="btn small" id="r5" ${n.money < cost * 5 ? 'disabled' : ''}>+5 divisions</button><span class="cost">Treasury: ${Math.floor(n.money)}</span></div>
      <h4>Military</h4>
      <p class="help">Tap one of your armies (blue NATO symbol), then tap <b>anywhere</b> on the map. They march about ${W.PERIODS[g.period].speed} km a day and take enemy land they pass through. Or hand them to a general in the <b>Army</b> tab.</p>
      <div id="queue"></div>`;
    $('orders-text').oninput = e => { g.orders = e.target.value; };
    t.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const ta = $('orders-text'); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + b.dataset.s + '.'; g.orders = ta.value; });
    $('r1').onclick = () => { if (W.recruit(data, g, g.player, 1)) { toast('1 division raised in your capital.', 'good', 2000); renderAll(); } };
    $('r5').onclick = () => { if (W.recruit(data, g, g.player, 5)) { toast('5 divisions raised in your capital.', 'good', 2000); renderAll(); } };
    renderQueue();
  }
  function renderQueue() {
    const q = $('queue'); if (!q) return;
    const moving = g.armies.filter(a => a.n === g.player && a.route.length && a.goal >= 0);
    const items = moving.map(a => `${a.div.toFixed(1)} div → ${esc(data.provinces[a.goal].n)}${a.retreat ? ' (retreating)' : hostileGoal(a) ? ' <b style="color:#ff8a80">(attack)</b>' : ''}`).concat(diploLog.map(esc));
    q.innerHTML = items.length ? `<h4>Under way</h4><ul class="queue">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
  }
  function renderDiplo() {
    const t = $('tab-diplo'), me = g.player, prev = t.querySelector('.diplo-search');
    const q = prev ? prev.value.toLowerCase() : '';
    const neighbours = new Set();
    W.provincesOf(g, me).forEach(p => data.provinces[p].nb.forEach(x => { const o = g.owner[x]; if (o >= 0 && o !== me) neighbours.add(o); }));
    const rank = i => (W.atWar(g, me, i) ? 0 : W.allied(g, me, i) ? 1 : neighbours.has(i) ? 2 : g.nations[i].great ? 3 : 4);
    const list = g.nations.map((n, i) => i).filter(i => i !== me && g.nations[i].alive && (!q || g.nations[i].name.toLowerCase().includes(q)))
      .sort((a, b) => rank(a) - rank(b) || W.divisions(g, b) - W.divisions(g, a));
    const groups = ['At war', 'Allies', 'Neighbours', 'Great powers', 'Others'];
    const unread = (g.inbox || []).filter(m => !m.read);
    let html = unread.map((m, k) => `<div class="inbox"><b>${esc(g.nations[m.from].name)} writes (${esc(m.date)})</b><p>${esc(m.text)}</p><div class="acts"><button class="btn small primary" data-in="${g.inbox.indexOf(m)}">Reply</button><button class="btn small" data-dis="${g.inbox.indexOf(m)}">Dismiss</button></div></div>`).join('')
      + `<input class="diplo-search" placeholder="Search nations…" value="${esc(q)}">`, cur = -1;
    for (const i of list) {
      const r = rank(i);
      if (r !== cur) { html += `<h4>${groups[r]}</h4>`; cur = r; }
      const n = g.nations[i], rel = W.rel(g, i, me);
      html += `<button class="nrow" data-n="${i}"><i class="swatch" style="background:${n.color}"></i><span>${esc(n.name)}</span><span class="tags">${n.great ? '<i class="tag great">great</i>' : ''}${W.atWar(g, me, i) ? '<i class="tag war">war</i>' : ''}${W.allied(g, me, i) ? '<i class="tag ally">ally</i>' : ''}<span class="relnum" style="color:${rel > 20 ? 'var(--green)' : rel < -20 ? 'var(--red)' : 'var(--dim)'}">${rel > 0 ? '+' : ''}${rel}</span></span></button>`;
    }
    t.innerHTML = html;
    const inp = t.querySelector('.diplo-search');
    inp.oninput = () => { renderDiplo(); const i2 = $('tab-diplo').querySelector('.diplo-search'); i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); };
    t.querySelectorAll('[data-n]').forEach(b => b.onclick = () => showNation(+b.dataset.n));
    t.querySelectorAll('[data-in]').forEach(b => b.onclick = () => replyTo(g.inbox[+b.dataset.in].from));
    t.querySelectorAll('[data-dis]').forEach(b => b.onclick = () => { g.inbox[+b.dataset.dis].read = true; renderDiplo(); saveGame(); });
  }
  function renderNews() {
    const t = $('tab-news');
    if (!g.news.length) { t.innerHTML = '<p class="help">News from around the world appears here at the start of every month.</p>'; return; }
    t.innerHTML = g.news.slice().reverse().map(n => `<div class="newsitem"><div class="d">${esc(n.date)}</div><b>${esc(n.headline)}</b><p>${esc(n.summary)}</p>${(n.events || []).map(e => `<p><b style="font-size:13.5px;display:inline">${esc(e.title)}.</b> ${esc(e.body)}</p>`).join('')}</div>`).join('');
  }

  // ================================================================ generals
  function fronts() {
    if (!g || !map) return [];
    const key = JSON.stringify((g.generals || []).map(x => [x.order, x.armies.length]));
    const now = performance.now();
    if (frontCache.key === key && now - frontCache.at < 2000) return frontCache.list;
    const list = [];
    for (const gen of g.generals || []) {
      if (gen.n !== g.player || !gen.armies.length) continue;
      const o = gen.order || {};
      if ((o.kind === 'front' || o.kind === 'attack') && o.target != null && g.nations[o.target].alive) {
        const path = map.borderPath(g.player, o.target);
        if (!path) continue;
        const f = { path, color: gen.color, dash: o.kind === 'front' };
        if (o.kind === 'attack') {
          const mine = g.armies.filter(a => gen.armies.includes(a.id));
          const geo = map.geo, cx = mine.reduce((t, a) => t + geo.X(a.x), 0) / mine.length, cy = mine.reduce((t, a) => t + geo.Y(a.y), 0) / mine.length;
          let best = null, bd = Infinity;
          g.ctrl.forEach((c, i) => { if (c === o.target) { const d = (geo.provs[i].lx - cx) ** 2 + (geo.provs[i].ly - cy) ** 2; if (d < bd) { bd = d; best = i; } } });
          if (best != null) { const t = geo.provs[best]; f.arrow = [[cx + (t.lx - cx) * 0.35, cy + (t.ly - cy) * 0.35], [t.lx + (t.lx - cx) * 0.15, t.ly + (t.ly - cy) * 0.15]]; }
        }
        list.push(f);
      }
    }
    frontCache = { at: now, key, list };
    return list;
  }
  function orderText(gen) {
    const o = gen.order || { kind: 'hold' }, tn = o.target != null ? g.nations[o.target].name : '', pn = o.prov != null ? data.provinces[o.prov].n : '';
    return { auto: 'Defending against every enemy', hold: 'Holding position', front: `Holding the border with ${tn}`, attack: `Attacking ${tn}`, seize: `Taking ${pn}`, defend: `Defending ${pn}` }[o.kind] || 'Holding position';
  }
  function renderArmy() {
    const t = $('tab-army'); if (!t) return;
    const gens = (g.generals || []).filter(x => x.n === g.player);
    const free = g.armies.filter(a => a.n === g.player && !W.generalOf(g, a));
    t.innerHTML = `<p class="help">Generals command groups of armies on their own. Give each one an order and they keep moving their troops as the situation changes, like in Hearts of Iron.</p>
      ${gens.map(gen => {
        const arms = g.armies.filter(a => gen.armies.includes(a.id)), div = arms.reduce((s2, a) => s2 + a.div, 0);
        return `<div class="gen" style="border-left-color:${gen.color}">
          <div class="gen-top"><b>${esc(gen.name)}</b><span>${arms.length} arm${arms.length === 1 ? 'y' : 'ies'} · ${div.toFixed(0)} div</span></div>
          <div class="gen-order">${esc(orderText(gen))}${gen.note ? `<br><span class="dim">${esc(gen.note)}</span>` : ''}</div>
          <div class="acts"><button class="btn small primary" data-g="${gen.id}" data-a="order">Give order</button><button class="btn small" data-g="${gen.id}" data-a="assign">Choose armies</button>${arms.length ? `<button class="btn small" data-g="${gen.id}" data-a="find">Show</button>` : ''}</div>
        </div>`;
      }).join('')}
      <div class="acts" style="margin-top:8px"><button class="btn small" id="gen-new">+ New general</button></div>
      <h4>Under your direct command</h4>
      <p class="help">${free.length ? `${free.length} arm${free.length === 1 ? 'y' : 'ies'} (${free.reduce((s2, a) => s2 + a.div, 0).toFixed(0)} divisions) take orders only from you.` : 'Every army is under a general.'}</p>`;
    t.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const gen = g.generals.find(x => x.id === +b.dataset.g);
      if (b.dataset.a === 'order') generalOrderSheet(gen);
      if (b.dataset.a === 'assign') startAssign(gen);
      if (b.dataset.a === 'find') { const a = g.armies.find(x => gen.armies.includes(x.id)); if (a) map.focusAt(map.geo.X(a.x), map.geo.Y(a.y), Math.max(map.cam.z, 2.6)); }
    });
    $('gen-new').onclick = () => { const gen = W.addGeneral(g, g.player); renderArmy(); startAssign(gen); };
  }
  function startAssign(gen) {
    clearSel(); pickGen = gen; pickProv = null;
    showHint(`Tap your armies to put them under <b>${esc(gen.name)}</b> (tap again to take one away).`, () => endPicking());
  }
  function endPicking() {
    if (!pickGen && !pickProv) return;
    pickGen = null; pickProv = null; $('mode-hint').hidden = true; renderArmy(); saveGame();
  }
  function showHint(html, onDone) {
    const h = $('mode-hint'); h.innerHTML = html + ' <button>Done</button>'; h.hidden = false;
    h.querySelector('button').onclick = onDone;
  }
  function generalOrderSheet(gen) {
    const me = g.player, n = g.nations[me];
    const neighbours = new Set();
    W.provincesOf(g, me).forEach(p => data.provinces[p].nb.forEach(x => { const o = g.ctrl[x]; if (o >= 0 && o !== me) neighbours.add(o); }));
    const targets = [...new Set([...n.wars, ...neighbours])].filter(i => g.nations[i].alive)
      .sort((a, b) => (W.atWar(g, me, b) - W.atWar(g, me, a)) || g.nations[a].name.localeCompare(g.nations[b].name));
    const opt = i => `<option value="${i}">${esc(g.nations[i].name)}${W.atWar(g, me, i) ? ' (at war)' : ''}</option>`;
    sheet(`<h2>Orders for ${esc(gen.name)}</h2>
      <p>Pick what this general should do with his armies. He keeps re-planning on his own.</p>
      <h3>Hold a front</h3><p>Spread out along the border with a nation and stop them getting through.</p>
      <div class="row-sel"><select id="o-front">${targets.map(opt).join('')}</select><button class="btn small primary" id="o-front-go">Hold border</button></div>
      <h3>Attack a nation</h3><p>Push into their land, picking fights he can win. Needs a war.</p>
      <div class="row-sel"><select id="o-attack">${targets.map(opt).join('')}</select><button class="btn small danger" id="o-attack-go">Attack</button></div>
      <h3>A single place</h3>
      <div class="acts"><button class="btn small" id="o-seize">Take a province…</button><button class="btn small" id="o-defend">Defend a province…</button><button class="btn small" id="o-auto">Defend against all enemies</button><button class="btn small" id="o-hold">Stand still</button></div>
      <div class="acts"><button class="btn ghost" id="o-x">Cancel</button></div>`);
    const set = (o, msg) => { gen.order = o; closeSheet(); renderArmy(); toast(`${gen.name}: ${msg}`, 'good', 3000); saveGame(); };
    if (!targets.length) { $('o-front-go').disabled = true; $('o-attack-go').disabled = true; }
    $('o-front-go').onclick = () => { const t = +$('o-front').value; set({ kind: 'front', target: t }, `holding the border with ${g.nations[t].name}.`); };
    $('o-attack-go').onclick = () => {
      const t = +$('o-attack').value;
      set({ kind: 'attack', target: t }, W.atWar(g, me, t) ? `attacking ${g.nations[t].name}.` : `we are not at war with ${g.nations[t].name}, so he will hold the border until war comes.`);
    };
    $('o-hold').onclick = () => set({ kind: 'hold' }, 'standing still.');
    $('o-auto').onclick = () => set({ kind: 'auto' }, 'guarding every border with our enemies.');
    const pick = (kind, verb) => () => {
      closeSheet(); clearSel(); pickGen = null;
      pickProv = p => set({ kind, prov: p }, `${verb} ${data.provinces[p].n}.`);
      showHint(`Tap the province ${esc(gen.name)} should ${kind === 'seize' ? 'take' : 'defend'}.`, () => endPicking());
    };
    $('o-seize').onclick = pick('seize', 'moving to take');
    $('o-defend').onclick = pick('defend', 'defending');
    $('o-x').onclick = closeSheet;
  }

  // ================================================================ diplomacy actions
  function showNation(i) {
    const n = g.nations[i], me = g.player, rel = W.rel(g, i, me), war = W.atWar(g, me, i), al = W.allied(g, me, i);
    sheet(`<h2><i class="swatch" style="background:${n.color};width:18px;height:18px"></i> ${esc(n.name)}</h2>
      <p>${esc(n.leader || 'Leader unknown')}${n.gov ? ' · ' + esc(n.gov) : ''}</p>
      <p>${n.great ? 'Great power' : 'Nation'} · ${Math.round(W.divisions(g, i))} divisions · economy ${Math.round(n.eco)} · stability ${Math.round(n.stab)}%<br>
      Their opinion of you: <b style="color:${rel > 20 ? 'var(--green)' : rel < -20 ? 'var(--red)' : 'var(--text)'}">${rel > 0 ? '+' : ''}${rel}</b>
      ${n.wars.length ? `<br>At war with: ${n.wars.map(w => esc(g.nations[w].name)).join(', ')}` : ''}
      ${n.allies.length ? `<br>Allies: ${n.allies.map(w => esc(g.nations[w].name)).join(', ')}` : ''}</p>
      <div class="acts" style="flex-direction:column">
        <button class="btn primary" data-a="talk">Talk to ${esc(n.leader ? n.leader.split('(')[0].trim() : 'their leader')}</button>
        ${war ? '<button class="btn" data-a="peace">Offer peace</button>' : ''}
        ${!war && !al ? '<button class="btn" data-a="ally">Propose an alliance</button>' : ''}
        ${al ? '<button class="btn" data-a="unally">Break the alliance</button>' : ''}
        ${!war ? '<button class="btn danger" data-a="war">Declare war</button>' : ''}
        <button class="btn ghost" data-a="find">Show on map</button>
        <button class="btn ghost" data-a="close">Close</button>
      </div>`);
    $('sheet').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'talk') openChat(i);
      if (a === 'peace') openChat(i, 'We propose an end to this war. What terms would you accept?');
      if (a === 'ally') openChat(i, 'Our nations would be stronger together. We propose a formal alliance.');
      if (a === 'unally') { W.unally(g, me, i); W.addRel(g, i, me, -25); diploLog.push(`Broke the alliance with ${n.name}`); closeSheet(); renderAll(); toast(`Alliance with ${n.name} ended.`, 'info'); }
      if (a === 'war') confirmWar(i);
      if (a === 'find') { closeSheet(); map.focus(n.cap, 2.6); }
      if (a === 'close') closeSheet();
    });
  }
  function confirmWar(i) {
    const n = g.nations[i], joiners = n.allies.filter(a => a !== g.player && !W.atWar(g, g.player, a) && !W.allied(g, g.player, a) && g.nations[a].alive);
    sheet(`<h2>Declare war on ${esc(n.name)}?</h2>
      <p>${joiners.length ? `Their allies will join against you: <b>${joiners.map(a => esc(g.nations[a].name)).join(', ')}</b>.` : 'No allies are bound to defend them.'}</p>
      <p>Other nations will trust you less. Your armies can then attack their provinces.</p>
      <div class="acts"><button class="btn danger" id="w-yes">Declare war</button><button class="btn" id="w-no">Cancel</button></div>`);
    $('w-no').onclick = closeSheet;
    $('w-yes').onclick = () => {
      const pairs = W.declareWar(g, g.player, i);
      diploLog.push(`Declared war on ${n.name}${pairs.length > 1 ? ` (and their allies ${pairs.slice(1).map(p => g.nations[p[1]].name).join(', ')})` : ''}`);
      closeSheet(); renderAll(); map.paint(); saveGame();
      toast(`War declared on ${n.name}!`, 'bad', 4000);
    };
  }

  function replyTo(i) {
    const hist = (g.chats[i] = g.chats[i] || []);
    for (const m of g.inbox) if (m.from === i && !m.read) { hist.push({ role: 'leader', text: m.text }); m.read = true; }
    renderDiplo(); openChat(i);
  }
  // ================================================================ chat
  async function openChat(i, prefill) {
    const n = g.nations[i], hist = (g.chats[i] = g.chats[i] || []);
    let pending = null;
    sheet(`<div class="head"><i class="swatch" style="background:${n.color};width:16px;height:30px"></i><div class="who"><b>${esc(n.leader || n.name)}</b><span>${esc(n.name)} · opinion of you <span id="c-rel"></span></span></div><button class="icon-btn" id="c-x" aria-label="Close">×</button></div>
      <div class="log" id="c-log"></div>
      <div class="input"><div class="chips" id="c-chips"></div><div class="row"><textarea id="c-text" placeholder="Write to ${esc(n.leader || n.name)}…" maxlength="1500"></textarea><button class="btn primary" id="c-send">Send</button></div></div>`, 'chat');
    const log = $('c-log');
    const relSpan = () => { const r = W.rel(g, i, g.player); $('c-rel').textContent = (r > 0 ? '+' : '') + r; $('c-rel').style.color = r > 20 ? 'var(--green)' : r < -20 ? 'var(--red)' : 'var(--text)'; };
    const draw = () => {
      log.innerHTML = hist.length ? '' : `<div class="msg sys">You have opened a channel to ${esc(n.name)}. Say what you want: propose deals, threaten, flatter, negotiate.</div>`;
      for (const m of hist) log.insertAdjacentHTML('beforeend', `<div class="msg ${m.role === 'player' ? 'me' : m.role === 'sys' ? 'sys' : 'them'}">${esc(m.text)}</div>`);
      if (pending && pending.kind !== 'none') {
        log.insertAdjacentHTML('beforeend', `<div class="deal"><b>Proposed: ${esc(pending.kind.replace(/_/g, ' '))}</b><p>${esc(pending.terms || '')}${pending.provinces && pending.provinces.length ? `<br>Provinces: ${pending.provinces.map(esc).join(', ')} → ${pending.provinces_go_to === 'player' ? 'you' : 'them'}` : ''}${pending.target ? `<br>Target: ${esc(pending.target)}` : ''}</p><div class="acts"><button class="btn primary small" id="d-sign">Sign</button><button class="btn small" id="d-no">Decline</button></div></div>`);
        $('d-sign').onclick = () => { const msg = GM.applyAgreement(data, g, i, pending); hist.push({ role: 'sys', text: msg || 'Agreement signed.' }); diploLog.push(`${msg || 'Agreement'} (with ${n.name})`); pending = null; map.paint(); renderAll(); saveGame(); draw(); toast(msg || 'Agreement signed.', 'good'); };
        $('d-no').onclick = () => { hist.push({ role: 'sys', text: 'You declined the proposal.' }); pending = null; draw(); };
      }
      log.scrollTop = log.scrollHeight;
      relSpan();
    };
    const chips = [W.atWar(g, g.player, i) ? 'We propose peace. Name your terms.' : 'We propose an alliance.', 'What do you want from us?', 'Join us in war against our enemy.', 'We demand territory from you.', 'Let us sign a trade agreement.'];
    $('c-chips').innerHTML = chips.map(c => `<button class="chip">${esc(c)}</button>`).join('');
    $('c-chips').querySelectorAll('.chip').forEach(b => b.onclick = () => { $('c-text').value = b.textContent; $('c-text').focus(); });
    $('c-x').onclick = closeSheet;
    const send = async () => {
      const text = $('c-text').value.trim(); if (!text) return;
      $('c-text').value = ''; $('c-send').disabled = true;
      hist.push({ role: 'player', text }); pending = null; draw();
      log.insertAdjacentHTML('beforeend', `<div class="typing">${esc(n.leader || n.name)} is writing…</div>`); log.scrollTop = log.scrollHeight;
      const { res, online, error } = await GM.chat(data, g, i, text);
      if (!online) { aiState = 'off'; updateBadge(); if (error) console.warn(error); } else { aiState = 'on'; updateBadge(); }
      hist.push({ role: 'leader', text: res.reply });
      W.addRel(g, i, g.player, Math.max(-20, Math.min(20, Number(res.relation_change) || 0)));
      pending = res.agreement && res.agreement.kind !== 'none' ? res.agreement : null;
      if ($('c-send')) { $('c-send').disabled = false; draw(); }
      saveGame();
    };
    $('c-send').onclick = send;
    $('c-text').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    draw();
    if (prefill) $('c-text').value = prefill;
    setTimeout(() => $('c-text') && $('c-text').focus(), 50);
  }

  // ================================================================ the clock
  function setSpeed(v) {
    if (v > 0) lastSpeed = v;
    speed = v;
    document.querySelectorAll('#clock [data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === v));
    const c = $('clock'); if (c) c.classList.toggle('paused', v === 0);
  }
  // Advance the world. The game pauses itself while a window is open or a battle is being commanded.
  function tick(now) {
    const dtReal = Math.min(0.25, (now - (lastFrame || now)) / 1000); lastFrame = now;
    if (!g || busy || speed === 0 || !$('overlay').hidden) return;
    acc += dtReal * DAYS_PER_SEC[speed];
    let n = 0;
    while (acc >= W.STEP && n < 48) { W.step(data, g, W.STEP); acc -= W.STEP; n++; }
    if (n === 48) acc = 0;
  }
  function afterTick(now) {
    if (!g) return;
    const ch = W.drainChanged();
    if (ch.all) map.paint(); else if (ch.provs.length) map.invalidate([...new Set(ch.provs)]);
    for (const ev of W.drainEvents()) onEvent(ev);
    if (now - (afterTick.ui || 0) > 500) {
      afterTick.ui = now;
      renderHud(); renderBattles();
      if (sel.armies.length && !$('sel-card').hidden) armyCard();
      if (!$('tab-orders').hidden) renderQueue();
    }
    if (now - lastSave > 20000 && speed > 0) { lastSave = now; saveGame(); }
  }
  function onEvent(ev) {
    if (ev.type === 'month') return monthStarts(ev.label);
    if (ev.type === 'battle-start' && ev.mine) {
      const b = W.liveBattle(g, ev.id); if (!b) return;
      battleNotes.set(ev.id, { seen: performance.now() });
      toast(`Battle at ${placeName(b)}! Command it yourself from the battle list, or let it play out.`, 'bad', 3500);
    }
    if (ev.type === 'battle-end') {
      battleNotes.delete(ev.res.id);
      if (ev.res.mine) {
        const meAtt = ev.res.att.some(n => n === g.player || W.allied(g, n, g.player));
        const won = meAtt === ev.res.attackerWins;
        toast(`${won ? 'Victory' : 'Defeat'} at ${placeName(ev.res)}: you lost ${(meAtt ? ev.res.lostA : ev.res.lostD)} div, they lost ${(meAtt ? ev.res.lostD : ev.res.lostA)}.`, won ? 'good' : 'bad', 4000);
      }
    }
    if (ev.type === 'captured' && performance.now() - captureToast > 4000) {
      captureToast = performance.now();
      if (ev.by === g.player) toast(`Your troops take ${data.provinces[ev.p].n}.`, 'good', 1800);
      else if (ev.from === g.player) toast(`${g.nations[ev.by].name} takes ${data.provinces[ev.p].n}!`, 'bad', 2500);
    }
    if (ev.type === 'capitulation') {
      const n = g.nations[ev.n];
      if (ev.n === g.player) { toast('Your nation has capitulated!', 'bad', 6000); map.paint(); }
      else toast(`${n.name} capitulates${ev.annexed ? ' and is annexed' : ''}.`, ev.by.includes(g.player) ? 'good' : 'info', 5000);
      if (!g.nations[g.player].alive) return gameOver();
    }
  }
  function placeName(b) { return b.p >= 0 && data.provinces[b.p] ? data.provinces[b.p].n : 'the front'; }

  // ================================================================ the monthly world update (runs in the background)
  async function monthStarts(label) {
    saveGame();
    if (!g.nations[g.player].alive) return gameOver();
    if (gmBusy) return;                       // last month's news is still being written: skip, the world keeps going
    gmBusy = true;
    const orders = (g.orders || '').trim(), diplo = diploLog.slice(), facts = g.log.splice(0);
    g.orders = ''; diploLog = []; if (!$('tab-orders').hidden) renderOrders();
    $('news-status').hidden = false;
    try {
      const { online, res, error } = await GM.runTurn(data, g, { orders, diplomacy: diplo, battles: facts });
      aiState = online ? 'on' : 'off'; updateBadge();
      if (!online) console.warn('AI offline:', error);
      GM.applyTurn(data, g, res);
      W.checkAlive(g);
      map.paint();
      const entry = { date: label, headline: res.headline, summary: res.summary, events: res.events || [], res, facts, online, error };
      g.news.push(entry); if (g.news.length > 40) g.news.shift();
      renderAll(); $('news-dot').hidden = false;
      newsToast(entry);
      saveGame();
      if (!g.nations[g.player].alive) gameOver();
    } catch (e) {
      console.error(e);
    } finally {
      gmBusy = false; $('news-status').hidden = true;
    }
  }
  function newsToast(entry) {
    const box = $('toasts');
    const el = document.createElement('button'); el.className = 'toast news';
    const msgs = (entry.res.messages_to_player || []).length;
    el.innerHTML = `<b>📰 ${esc(entry.headline)}</b><span>${esc(entry.date)}${msgs ? ` · ${msgs} message${msgs > 1 ? 's' : ''} for you` : ''} · tap to read</span>`;
    el.onclick = () => { el.remove(); report(entry); };
    box.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 500); }, 9000);
  }

  // ================================================================ battles
  function renderBattles() {
    const box = $('battles'); if (!box || !g) return;
    const mine = g.battles.filter(battleIsMine);
    if (!mine.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = mine.slice(0, 4).map(b => {
      const lb = W.liveBattle(g, b.id), meAtt = lb.attackers.some(a => a.n === g.player || W.allied(g, a.n, g.player));
      const ch = W.battleOdds(g, lb).chance, my = meAtt ? ch : 1 - ch;
      const canCmd = lb.attackers.concat(lb.defenders).some(a => a.n === g.player);
      return `<div class="bt"><div class="bt-top"><b>⚔ ${esc(placeName(b))}</b><span>${meAtt ? 'attacking' : 'defending'} · day ${Math.floor(b.days) + 1}</span></div>
        <div class="oddsbar"><i style="width:${Math.round(my * 100)}%"></i></div>
        <div class="acts"><button class="btn small" data-show="${b.id}">Show</button>${canCmd && window.Battle ? `<button class="btn small primary" data-cmd="${b.id}">Command</button>` : ''}</div></div>`;
    }).join('') + (mine.length > 4 ? `<div class="dim">+${mine.length - 4} more battles</div>` : '');
    box.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { const t = g.battles.find(x => x.id === +b.dataset.show); if (t) map.focusAt(map.geo.X(t.x), map.geo.Y(t.y), Math.max(map.cam.z, 4)); });
    box.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => commandBattle(+b.dataset.cmd));
  }
  async function commandBattle(id) {
    const b = W.liveBattle(g, id); if (!b || busy) return;
    busy = true; clearSel();
    for (const a of b.attackers.concat(b.defenders)) a.moved = a.idle < 1;
    try {
      await Battle.fight({ data, g, battle: b, period: g.period, playerNation: g.player });
    } finally {
      show('game'); map.resize(); busy = false; lastFrame = 0;
      W.checkAlive(g); renderAll(); saveGame();
    }
  }
  function report(entry) {
    const res = entry.res, paper = { '1900': 'The Imperial Courier', '1939': 'The Evening Dispatch', '2003': 'The Global Times' }[g.period];
    sheet(`<div class="mast"><div class="np">${paper}</div><div class="dt">${esc(entry.date)} · ${esc(g.nations[g.player].name)} edition</div></div>
      <div class="hl">${esc(res.headline)}</div>
      <p class="lede">${esc(res.summary)}</p>
      <div class="cols">${(res.events || []).map(e => `<div class="ev"><b>${esc(e.title)}</b><p>${esc(e.body)}</p></div>`).join('')}</div>
      ${(res.player_results || []).length ? `<h3>Your orders</h3>${res.player_results.map(r => `<p class="res ${r.success ? 'ok' : 'no'}"><i>${r.success ? '✔' : '✘'} ${esc(r.order)}</i><br>${esc(r.outcome)}</p>`).join('')}` : ''}
      ${(entry.facts || []).length ? `<h3>Dispatches</h3><ul class="facts">${entry.facts.slice(-12).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(res.messages_to_player || []).length ? `<h3>Messages for you</h3>${res.messages_to_player.map(m => `<p class="res"><i>${esc(m.from)}:</i> ${esc(m.text)} <button class="btn small primary" data-reply="${esc(m.from)}">Reply</button></p>`).join('')}` : ''}
      ${entry.online ? '' : `<p class="offline">The AI game master could not be reached${entry.error ? ` (${esc(entry.error)})` : ''}. Simple built-in rules ran this month.</p>`}
      <div class="acts"><button class="btn primary" id="rp-ok">Back to the map</button></div>`, 'paper');
    $('rp-ok').onclick = closeSheet;
    $('sheet').querySelectorAll('[data-reply]').forEach(b => b.onclick = () => { const i = W.findNation(g, b.dataset.reply); closeSheet(); if (i >= 0) replyTo(i); });
  }
  function gameOver() {
    if (gameOver.shown) return; gameOver.shown = true; setSpeed(0);
    store.del(SAVE);
    sheet(`<h2>${esc(g.nations[g.player].name)} has fallen</h2><p>Your nation no longer holds any land. History will remember its last stand in ${esc(W.dateLabel(g))}.</p>
      <div class="acts"><button class="btn primary" id="go-new">New game</button></div>`);
    $('go-new').onclick = () => { closeSheet(); gameOver.shown = false; g = null; show('start'); $('continue-wrap').hidden = true; };
  }

  // ================================================================ menus and help
  function showMenu() {
    sheet(`<h2>Menu</h2><p>${esc(g.nations[g.player].name)}, ${esc(W.dayLabel(g))}. Your game saves automatically every month.</p>
      <div class="acts" style="flex-direction:column">
        <button class="btn primary" data-a="close">Resume</button>
        <button class="btn" data-a="help">How to play</button>
        <button class="btn" data-a="symbols">What the symbols mean</button>
        <button class="btn ghost" data-a="quit">Back to title screen</button>
      </div>`);
    $('sheet').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'close') closeSheet();
      if (a === 'help') showHelp();
      if (a === 'symbols') showSymbols();
      if (a === 'quit') { saveGame(); closeSheet(); setSpeed(0); g = null; show('start'); const s = readSave(); if (s) { $('continue-wrap').hidden = false; $('btn-continue').textContent = `Continue: ${s.g.nations[s.g.player].name}, ${W.dateLabel(s.g)}`; } }
    });
  }
  function showHelp() {
    sheet(`<h2>How to play</h2>
      <p>Time runs on its own, like Hearts of Iron. Use <b>❚❚ / ▶ / ▶▶ / ▶▶▶</b> at the bottom (or Space and 1, 2, 3). The game pauses while a window is open.</p>
      <h3>1. Move armies</h3><ul>
        <li>Your armies are <b style="color:#80e0ff">blue rectangles</b>. Enemies are <b style="color:#ff8080">red diamonds</b>, neutrals <b style="color:#aaffaa">green squares</b>. The number is divisions, the bar on top is morale.</li>
        <li>Tap your army, then tap <b>anywhere</b> on the map. It marches there and takes enemy land it passes through. Tap a far coast to ship troops from a port.</li>
        <li><b>+ Add armies</b> (or Shift-click) selects several at once. Drag to move the map, scroll or pinch to zoom.</li></ul>
      <h3>2. Fight</h3><ul>
        <li>When armies at war get close, a battle starts on its own. Your battles are listed at the bottom left: press <b>Command</b> to fight it yourself on the battlefield.</li>
        <li>Generals in the <b>Army</b> tab can hold a border or attack a nation for you.</li>
        <li>Take enough of an enemy, including its capital, and it surrenders.</li></ul>
      <h3>3. Govern and talk</h3><ul>
        <li><b>Orders tab:</b> write anything your government does. It goes to the world at the start of each month.</li>
        <li><b>Diplomacy tab:</b> talk to any leader, propose alliances, offer peace or declare war.</li>
        <li>Each month the newspaper pops up with what the world did. Tap it to read.</li></ul>
      <div class="acts"><button class="btn primary" id="h-ok">Got it</button></div>`);
    $('h-ok').onclick = closeSheet;
  }
  function showSymbols() {
    const types = [['inf', 'Infantry'], ['mech', 'Mechanized infantry'], ['armor', 'Armor'], ['recon', 'Cavalry / reconnaissance'], ['art', 'Artillery'], ['ad', 'Air defense'], ['heli', 'Helicopters'], ['uas', 'Drones'], ['hq', 'Headquarters']];
    sheet(`<h2>NATO map symbols</h2><p>Frame shape and color show <b>who</b> a unit belongs to; the picture inside shows <b>what</b> it is; the marks on top show its <b>size</b>.</p>
      <div id="sym-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px"></div>
      <div class="acts"><button class="btn primary" id="s-ok">Close</button></div>`);
    const grid = $('sym-grid');
    const add = (type, affilv, ech, label) => {
      const cv = document.createElement('canvas'); cv.width = 120; cv.height = 76; cv.style.width = '60px'; cv.style.height = '38px';
      const c = cv.getContext('2d'); c.scale(2, 2); NatoSymbols.drawUnit(c, 30, 21, 16, type, { affil: affilv, ech });
      const d = document.createElement('div'); d.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px'; d.appendChild(cv); d.insertAdjacentHTML('beforeend', `<span>${label}</span>`); grid.appendChild(d);
    };
    add('inf', 'friend', null, 'Yours or allied'); add('inf', 'hostile', null, 'Enemy (at war)'); add('inf', 'neutral', null, 'Neutral');
    for (const [t, l] of types) add(t, 'friend', null, l);
    for (const [e, l] of [['X', 'Brigade (under 5 divisions)'], ['XX', 'Division group (5+)'], ['XXX', 'Corps / army (20+)']]) add('inf', 'friend', e, l);
    $('s-ok').onclick = closeSheet;
  }

  // ================================================================ small helpers
  function sheet(html, cls) { const s = $('sheet'); s.className = 'sheet' + (cls ? ' ' + cls : ''); s.innerHTML = html; $('overlay').hidden = false; }
  function closeSheet() { $('overlay').hidden = true; }
  function waiting(title, text) { return `<div class="waiting"><div class="spinner"></div><b>${esc(title)}</b><p>${esc(text)}</p></div>`; }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function toast(text, kind, ms) {
    const box = $('toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = text; box.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 500); }, ms || 3800);
  }
  function onKey(e) {
    if ($('game').hidden || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') { if (!$('overlay').hidden && !busy) closeSheet(); else clearSel(); }
    if (busy || !$('overlay').hidden) return;
    if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : lastSpeed); }
    if (e.key === '1' || e.key === '2' || e.key === '3') setSpeed(+e.key);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!$('game').hidden && map && g) { tick(now); afterTick(now); map.draw(now); }
    else if (!$('pick').hidden && pickMap) pickMap.draw(now);
  }
  window.FrontLine = { get state() { return g; }, get data() { return data; }, get map() { return map; } };  // handy for debugging in the console
  window.App = { toast, show };
  boot();
})();
