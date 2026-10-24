/* Front Line: screens, panels and the turn flow. */
(function () {
  'use strict';
  const W = World, $ = id => document.getElementById(id);
  const SAVE = 'frontline-world-v2', HELP = 'frontline-help-v1';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cache = {};
  let data = null, g = null, map = null, pickMap = null, pickState = null, pickSel = -1, period = null;
  let sel = { army: null, prov: -1 }, reach = null, diploLog = [], busy = false, markers = [], aiState = 'unknown';
  let pickGen = null, pickProv = null, frontCache = { v: -1, list: [] };

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
    $('ai-status').textContent = aiState === 'on' ? 'AI game master: online. Other nations are played by Claude.' : 'AI game master: offline right now. You can still play; nations follow simple built-in rules until it is back.';
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
    else toast(`You lead ${g.nations[g.player].name}. Write your orders, move your armies, then end the turn.`, 'info', 6000);
  }
  async function continueGame() {
    const s = readSave(); if (!s) return;
    data = await loadData(s.period); period = s.period; g = s.g; diploLog = s.diploLog || [];
    enterGame();
    toast(`Welcome back. ${W.dateLabel(g)}.`, 'info');
  }
  function readSave() { try { const s = JSON.parse(store.get(SAVE)); return s && s.g ? s : null; } catch (e) { return null; } }
  function saveGame() { if (g) store.set(SAVE, JSON.stringify({ period: g.period, g, diploLog })); }

  function enterGame() {
    window.WorldData = data;
    show('game');
    sel = { army: null, prov: -1 }; reach = null; markers = [];
    if (map) { const old = $('map'), n = cloneCanvas(old); old.replaceWith(n); }
    map = new WorldMap($('map'), data, {
      state: () => g, onClick, onHover, highlights, armies: armyViews, battles: () => markers, fronts
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
    $('btn-end').onclick = endTurn;
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
    if (g.period === '1900') return t >= 1.0 ? 'inf' : 'inf';
    if (g.period === '1939') return t >= 1.2 ? 'armor' : t >= 1.0 ? 'mech' : 'inf';
    return t >= 1.3 ? 'armor' : t >= 0.95 ? 'mech' : 'inf';
  }
  function affil(n) { return n === g.player || W.allied(g, n, g.player) ? 'friend' : W.atWar(g, n, g.player) ? 'hostile' : 'neutral'; }
  function armyViews() {
    return g.armies.map(a => ({
      ...a, ref: a, type: armyType(g.nations[a.n]), affil: affil(a.n),
      ech: a.div >= 20 ? 'XXX' : a.div >= 5 ? 'XX' : a.div >= 1 ? 'X' : 'III',
      selected: sel.army === a || (pickGen && pickGen.armies.includes(a.id)), showPath: a.n === g.player, always: a.n === g.player || W.atWar(g, a.n, g.player) || W.allied(g, a.n, g.player),
      genColor: a.n === g.player ? (W.generalOf(g, a) || {}).color : null,
      pathColor: a.path.length && hostileTarget(a) ? '#ff8a80' : '#ffffff'
    }));
  }
  function hostileTarget(a) { const p = a.path[a.path.length - 1], c = g.ctrl[p]; return c >= 0 && W.atWar(g, a.n, c); }
  function highlights() {
    const out = [];
    if (sel.army && reach) {
      for (const [p, path] of reach) {
        if (p === sel.army.p) continue;
        const c = g.ctrl[p], enemy = (c >= 0 && W.atWar(g, g.player, c)) || g.armies.some(e => e.p === p && W.atWar(g, g.player, e.n));
        out.push({ p, fill: enemy ? 'rgba(255,90,82,.42)' : path.sea ? 'rgba(130,200,255,.22)' : 'rgba(255,255,255,.28)' });
      }
      out.push({ p: sel.army.p, outline: 'rgba(255,255,255,.55)', fill: 'rgba(0,0,0,0)' });
    } else if (sel.prov >= 0) out.push({ p: sel.prov, outline: 'rgba(255,255,255,.45)', fill: 'rgba(0,0,0,0)' });
    for (const gen of g.generals || []) if (gen.n === g.player && gen.order && gen.order.prov != null && gen.armies.length) out.push({ p: gen.order.prov, outline: gen.color });
    return out;
  }
  function onHover(p, pt, view) {
    const tip = $('tooltip');
    if (view) {
      const n = g.nations[view.n];
      tip.innerHTML = `<b>${esc(n.name)} army</b><br>${view.div.toFixed(1)} divisions · morale ${Math.round(view.org)}%<br><span class="dim">${esc(data.provinces[view.p].n)}${view.path && view.path.length && view.n === g.player ? ' → ' + esc(data.provinces[view.path[view.path.length - 1]].n) : ''}</span>`;
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
    if (army && army.n === g.player && sel.army !== army) { selectArmy(army); return; }
    if (sel.army) {
      const a = sel.army;
      if (p < 0) { clearSel(); return; }
      if (p === a.p || (army && army === a)) { if (a.path.length) { a.path = []; toast('Orders cancelled.', 'info', 2000); } clearSel(); renderOrders(); return; }
      const path = reach.get(p);
      if (path) {
        a.path = path.slice();
        const gen = W.generalOf(g, a);
        if (gen) { a.manual = true; toast(`This month the army follows your order instead of ${gen.name}'s.`, 'info', 2500); }
        const c = g.ctrl[p], enemy = (c >= 0 && W.atWar(g, g.player, c)) || g.armies.some(e => e.p === p && W.atWar(g, g.player, e.n));
        toast(path.sea ? `Shipping troops to ${data.provinces[p].n}. They land next turn.` : enemy ? `Attack ordered on ${data.provinces[p].n}.` : `Marching to ${data.provinces[p].n}.`, enemy ? 'bad' : 'good', 2500);
        clearSel(); renderOrders(); return;
      }
      const o = g.ctrl[p];
      if (o >= 0 && o !== g.player && !W.atWar(g, g.player, o) && !W.allied(g, g.player, o)) { toast(`You are not at war with ${g.nations[o].name}. Declare war in Diplomacy first.`, 'bad'); return; }
      const lp = W.pathTo(data, g, g.player, a.p, q => q === p, 60);
      if (lp) { a.path = lp; toast(`Marching to ${data.provinces[p].n}. It will take about ${Math.max(1, Math.ceil(lp.reduce((t, q, k) => t + W.km(data, k ? lp[k - 1] : a.p, q), 0) / W.PERIODS[g.period].km))} month(s).`, 'good'); clearSel(); renderOrders(); return; }
      toast('Your army cannot reach that province from here. Move it to one of your ports to ship it overseas.', 'bad'); return;
    }
    if (army) { selectProvince(army.p); return; }
    if (p >= 0) selectProvince(p); else clearSel();
  }
  function selectArmy(a) {
    sel = { army: a, prov: -1 }; reach = W.reachable(data, g, a);
    const card = $('sel-card'), n = g.nations[a.n];
    const dest = a.path.length ? data.provinces[a.path[a.path.length - 1]].n : null;
    card.innerHTML = `<button class="x" aria-label="Close">×</button><h3><i class="swatch" style="background:${n.color}"></i>Army in ${esc(data.provinces[a.p].n)}</h3>
      <div class="rows"><span>Divisions</span><span>${a.div.toFixed(1)}</span><span>Morale</span><span>${Math.round(a.org)}%</span><span>Orders</span><span>${dest ? 'Moving to ' + esc(dest) : 'Holding'}</span></div>
      <p class="meta">Tap a highlighted province to move. <b style="color:#ff8a80">Red</b> means attack. Blue-tinted coasts can be reached by sea from a port.</p>
      <div class="acts">${a.div >= 2 ? '<button class="btn small" id="a-split">Split in half</button>' : ''}${a.path.length ? '<button class="btn small" id="a-stop">Cancel orders</button>' : ''}<button class="btn small" id="a-done">Done</button></div>`;
    card.hidden = false;
    card.querySelector('.x').onclick = clearSel; $('a-done').onclick = clearSel;
    if ($('a-split')) $('a-split').onclick = () => { const b = W.addArmy(g, a.n, a.p, a.div / 2); b.org = a.org; a.div /= 2; selectArmy(a); toast('Army split. Tap the other half to give it orders.', 'info', 2500); };
    if ($('a-stop')) $('a-stop').onclick = () => { a.path = []; selectArmy(a); renderOrders(); };
  }
  function selectProvince(p) {
    sel = { army: null, prov: p }; reach = null;
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
    card.querySelectorAll('[data-army]').forEach(b => b.onclick = () => selectArmy(g.armies.find(a => a.id === +b.dataset.army)));
    if ($('p-recruit')) $('p-recruit').onclick = () => { if (W.recruit(data, g, g.player, 1, p)) { toast('1 division raised.', 'good', 2000); selectProvince(p); renderAll(); } };
    if ($('p-talk')) $('p-talk').onclick = () => openChat(o);
    if ($('p-peace')) $('p-peace').onclick = () => openChat(o, 'We propose an end to this war. What terms would you accept?');
    if ($('p-war')) $('p-war').onclick = () => confirmWar(o);
  }
  function clearSel() { sel = { army: null, prov: -1 }; reach = null; $('sel-card').hidden = true; }

  // ================================================================ panels
  function renderAll() { renderHud(); renderOrders(); renderArmy(); renderDiplo(); renderNews(); $('end-date').textContent = W.dateLabel(g); }
  function renderHud() {
    const n = g.nations[g.player];
    $('hud-color').style.background = n.color; $('hud-name').textContent = n.name;
    $('hud-date').textContent = W.dateLabel(g) + (n.leader ? ' · ' + n.leader : '');
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
    const moving = g.armies.filter(a => a.n === g.player && a.path.length);
    const focused = document.activeElement && document.activeElement.id === 'orders-text';
    if (focused) { renderQueue(); return; }
    t.innerHTML = `<h4>Your government's orders</h4>
      <p class="help">Write in plain words what your nation does this month: laws, deals, spending, threats, anything. The AI decides how it turns out.</p>
      <textarea class="orders" id="orders-text" placeholder="e.g. ${esc(SUGGEST[g.period][0])}. Send an envoy to …" maxlength="2500">${esc(g.orders || '')}</textarea>
      <div class="chips">${SUGGEST[g.period].map(s => `<button class="chip" data-s="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>
      <h4>Raise troops</h4>
      <p class="help">New divisions appear in your capital. Each costs ${cost}, plus a little upkeep every month.</p>
      <div class="recruit"><button class="btn small" id="r1" ${n.money < cost ? 'disabled' : ''}>+1 division</button><button class="btn small" id="r5" ${n.money < cost * 5 ? 'disabled' : ''}>+5 divisions</button><span class="cost">Treasury: ${Math.floor(n.money)}</span></div>
      <h4>Military</h4>
      <p class="help">Tap one of your armies (blue NATO symbol) on the map, then tap where it should go. Armies march about ${W.PERIODS[g.period].km} km a month. Or hand them to a general in the <b>Army</b> tab.</p>
      <div id="queue"></div>`;
    $('orders-text').oninput = e => { g.orders = e.target.value; };
    t.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const ta = $('orders-text'); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + b.dataset.s + '.'; g.orders = ta.value; });
    $('r1').onclick = () => { if (W.recruit(data, g, g.player, 1)) { toast('1 division raised in your capital.', 'good', 2000); renderAll(); } };
    $('r5').onclick = () => { if (W.recruit(data, g, g.player, 5)) { toast('5 divisions raised in your capital.', 'good', 2000); renderAll(); } };
    renderQueue();
  }
  function renderQueue() {
    const q = $('queue'); if (!q) return;
    const moving = g.armies.filter(a => a.n === g.player && a.path.length);
    const items = moving.map(a => `${a.div.toFixed(1)} div: ${esc(data.provinces[a.p].n)} → ${esc(data.provinces[a.path[a.path.length - 1]].n)}${hostileTarget(a) ? ' <b style="color:#ff8a80">(attack)</b>' : ''}`).concat(diploLog.map(esc));
    q.innerHTML = items.length ? `<h4>This month</h4><ul class="queue">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
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
    if (!g.news.length) { t.innerHTML = '<p class="help">News from around the world appears here after each turn.</p>'; return; }
    t.innerHTML = g.news.slice().reverse().map(n => `<div class="newsitem"><div class="d">${esc(n.date)}</div><b>${esc(n.headline)}</b><p>${esc(n.summary)}</p>${(n.events || []).map(e => `<p><b style="font-size:13.5px;display:inline">${esc(e.title)}.</b> ${esc(e.body)}</p>`).join('')}</div>`).join('');
  }

  // ================================================================ generals
  function fronts() {
    if (!g || !map) return [];
    const key = map.version + ':' + JSON.stringify((g.generals || []).map(x => [x.order, x.armies.length]));
    if (frontCache.v === key) return frontCache.list;
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
          const geo = map.geo, cx = mine.reduce((t, a) => t + geo.provs[a.p].lx, 0) / mine.length, cy = mine.reduce((t, a) => t + geo.provs[a.p].ly, 0) / mine.length;
          let best = null, bd = Infinity;
          g.ctrl.forEach((c, i) => { if (c === o.target) { const d = (geo.provs[i].lx - cx) ** 2 + (geo.provs[i].ly - cy) ** 2; if (d < bd) { bd = d; best = i; } } });
          if (best != null) { const t = geo.provs[best]; f.arrow = [[cx + (t.lx - cx) * 0.35, cy + (t.ly - cy) * 0.35], [t.lx + (t.lx - cx) * 0.15, t.ly + (t.ly - cy) * 0.15]]; }
        }
        list.push(f);
      }
    }
    frontCache = { v: key, list };
    return list;
  }
  function orderText(gen) {
    const o = gen.order || { kind: 'hold' }, tn = o.target != null ? g.nations[o.target].name : '', pn = o.prov != null ? data.provinces[o.prov].n : '';
    return { hold: 'Holding position', front: `Holding the border with ${tn}`, attack: `Attacking ${tn}`, seize: `Taking ${pn}`, defend: `Defending ${pn}` }[o.kind] || 'Holding position';
  }
  function renderArmy() {
    const t = $('tab-army'); if (!t) return;
    const gens = (g.generals || []).filter(x => x.n === g.player);
    const free = g.armies.filter(a => a.n === g.player && !W.generalOf(g, a));
    t.innerHTML = `<p class="help">Generals command groups of armies on their own. Give each one an order and they move their troops every turn, like in Hearts of Iron.</p>
      ${gens.map(gen => {
        const arms = g.armies.filter(a => gen.armies.includes(a.id)), div = arms.reduce((s2, a) => s2 + a.div, 0);
        return `<div class="gen" style="border-left-color:${gen.color}">
          <div class="gen-top"><b>${esc(gen.name)}</b><span>${arms.length} arm${arms.length === 1 ? 'y' : 'ies'} · ${div.toFixed(0)} div</span></div>
          <div class="gen-order">${esc(orderText(gen))}</div>
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
      if (b.dataset.a === 'find') { const a = g.armies.find(x => gen.armies.includes(x.id)); if (a) map.focus(a.p, Math.max(map.cam.z, 2.6)); }
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
      <p>Pick what this general should do with his armies. He re-plans every turn on his own.</p>
      <h3>Hold a front</h3><p>Spread out along the border with a nation and stop them getting through.</p>
      <div class="row-sel"><select id="o-front">${targets.map(opt).join('')}</select><button class="btn small primary" id="o-front-go">Hold border</button></div>
      <h3>Attack a nation</h3><p>Push into their land, picking fights he can win. Needs a war.</p>
      <div class="row-sel"><select id="o-attack">${targets.map(opt).join('')}</select><button class="btn small danger" id="o-attack-go">Attack</button></div>
      <h3>A single place</h3>
      <div class="acts"><button class="btn small" id="o-seize">Take a province…</button><button class="btn small" id="o-defend">Defend a province…</button><button class="btn small" id="o-hold">Stand still</button></div>
      <div class="acts"><button class="btn ghost" id="o-x">Cancel</button></div>`);
    const set = (o, msg) => { gen.order = o; closeSheet(); renderArmy(); toast(`${gen.name}: ${msg}`, 'good', 3000); saveGame(); };
    if (!targets.length) { $('o-front-go').disabled = true; $('o-attack-go').disabled = true; }
    $('o-front-go').onclick = () => { const t = +$('o-front').value; set({ kind: 'front', target: t }, `holding the border with ${g.nations[t].name}.`); };
    $('o-attack-go').onclick = () => {
      const t = +$('o-attack').value;
      set({ kind: 'attack', target: t }, W.atWar(g, me, t) ? `attacking ${g.nations[t].name}.` : `we are not at war with ${g.nations[t].name}, so he will hold the border until war comes.`);
    };
    $('o-hold').onclick = () => set({ kind: 'hold' }, 'standing still.');
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
      if (sel.army) reach = W.reachable(data, g, sel.army);
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

  // ================================================================ end turn
  async function endTurn() {
    if (busy) return;
    busy = true; clearSel(); $('btn-end').disabled = true;
    const month = W.dateLabel(g), orders = (g.orders || '').trim(), diplo = diploLog.slice();
    try {
      sheet(waiting('Armies on the move', 'Every nation moves its troops…'));
      await sleep(250);
      const battles = W.endTurnMove(data, g);
      const results = [];
      let autoAll = false;
      for (const b of battles) {
        if (!b.attackers.length || !b.defenders.length || !g.armies.includes(b.attackers[0]) && !b.attackers.some(a => g.armies.includes(a))) continue;
        b.attackers = b.attackers.filter(a => g.armies.includes(a)); b.defenders = b.defenders.filter(a => g.armies.includes(a));
        if (!b.attackers.length || !b.defenders.length) continue;
        const mine = b.attackers.concat(b.defenders).some(a => a.n === g.player);
        let r = null;
        if (mine && !autoAll) {
          map.focus(b.p, Math.max(map.cam.z, 3)); markers = [b];
          const choice = await battleChoice(b, battles.filter(x => x !== b && x.attackers.concat(x.defenders).some(a => a.n === g.player)).length);
          if (choice === 'all') autoAll = true;
          if (choice === 'command' && window.Battle) {
            closeSheet();
            r = await Battle.fight({ data, g, battle: b, period: g.period, playerNation: g.player });
            show('game'); map.resize();
          }
        }
        if (!r) r = W.autoResolve(g, b);
        r.mine = mine;
        results.push(r);
      }
      markers = results.map(r => ({ p: r.p }));
      const fin = W.endTurnFinish(data, g);
      map.paint();
      const battleText = results.map(r => battleLine(r));
      const facts = [];
      for (const o of fin.occ) if (o.by === g.player || o.from === g.player) facts.push(`${g.nations[o.by].name} occupies ${data.provinces[o.p].n}.`);
      for (const c of fin.caps) facts.push(`${g.nations[c].name} capitulates${(fin.caps.annexed || []).includes(c) ? ' and is annexed' : ''}.`);
      facts.push(...(g.generalNotes || []));
      sheet(waiting('The world reacts', aiState === 'off' ? 'Simple rules are running the other nations.' : 'Every capital is deciding what to do. This can take up to a minute.'));
      const { online, res, error } = await GM.runTurn(data, g, { orders, diplomacy: diplo, battles: battleText.concat(facts) });
      aiState = online ? 'on' : 'off'; updateBadge();
      if (!online) console.warn('AI offline:', error);
      const notes = GM.applyTurn(data, g, res);
      W.checkAlive(g);
      map.paint();
      const entry = { date: month, headline: res.headline, summary: res.summary, events: res.events || [] };
      g.news.push(entry); if (g.news.length > 40) g.news.shift();
      g.orders = ''; diploLog = [];
      renderAll(); $('news-dot').hidden = false;
      if ((res.messages_to_player || []).length) toast(`${res.messages_to_player.length} message${res.messages_to_player.length > 1 ? 's' : ''} from foreign leaders. See Diplomacy.`, 'info', 5000);
      saveGame();
      if (!g.nations[g.player].alive) return gameOver();
      await report(month, res, results, facts, notes, online, error);
    } catch (e) {
      console.error(e);
      sheet(`<h2>Something went wrong</h2><p>${esc(e.message)}</p><div class="acts"><button class="btn primary" id="e-ok">Close</button></div>`);
      $('e-ok').onclick = closeSheet;
    } finally {
      busy = false; $('btn-end').disabled = false;
    }
  }
  function battleLine(r) {
    const nm = l => l.map(i => g.nations[i].name).join(' & ');
    return `Battle of ${data.provinces[r.p].n}: ${nm(r.att)} attacked ${nm(r.def)} and ${r.attackerWins ? 'won' : 'was repulsed'} (losses ${r.lostA} vs ${r.lostD} divisions${r.how === 'fought' ? '; commanded in person' : ''}).`;
  }
  function battleChoice(b, others) {
    return new Promise(resolve => {
      const { chance } = W.battleOdds(g, b), pr = data.provinces[b.p];
      const side = list => { const ns = [...new Set(list.map(a => a.n))]; return `<b>${ns.map(n => esc(g.nations[n].name)).join(' & ')}</b><span>${list.reduce((s, a) => s + a.div, 0).toFixed(1)} divisions</span>`; };
      const meAttack = b.attackers.some(a => a.n === g.player || W.allied(g, a.n, g.player));
      const myChance = meAttack ? chance : 1 - chance;
      sheet(`<div class="kicker">${esc(W.dateLabel(g))}</div><h2>Battle of ${esc(pr.n)}</h2>
        <p>${meAttack ? 'Your forces are attacking.' : 'Your forces are under attack.'} Fight it yourself on the battlefield, or let your generals handle it.</p>
        <div class="versus"><div class="side">${side(b.attackers)}<span class="dim">attacking</span></div><div class="vs">VS</div><div class="side">${side(b.defenders)}<span class="dim">defending</span></div></div>
        <div class="dim" style="font-size:12px">Your generals' estimate of victory: ${Math.round(myChance * 100)}%</div>
        <div class="oddsbar"><i style="width:${myChance * 100}%"></i></div>
        <div class="acts" style="flex-direction:column">
          <button class="btn primary" id="bc-cmd">⚔ Command the battle</button>
          <button class="btn" id="bc-auto">Auto-resolve</button>
          ${others ? `<button class="btn ghost" id="bc-all">Auto-resolve this and ${others} more</button>` : ''}
        </div>`);
      $('bc-cmd').onclick = () => resolve('command');
      $('bc-auto').onclick = () => { closeSheet(); resolve('auto'); };
      if ($('bc-all')) $('bc-all').onclick = () => { closeSheet(); resolve('all'); };
    });
  }
  function report(month, res, results, facts, notes, online, error) {
    return new Promise(resolve => {
      const paper = { '1900': 'The Imperial Courier', '1939': 'The Evening Dispatch', '2003': 'The Global Times' }[g.period];
      const mine = results.filter(r => r.mine).map(battleLine);
      sheet(`<div class="mast"><div class="np">${paper}</div><div class="dt">${esc(month)} · ${esc(g.nations[g.player].name)} edition</div></div>
        <div class="hl">${esc(res.headline)}</div>
        <p class="lede">${esc(res.summary)}</p>
        <div class="cols">${(res.events || []).map(e => `<div class="ev"><b>${esc(e.title)}</b><p>${esc(e.body)}</p></div>`).join('')}</div>
        ${(res.player_results || []).length ? `<h3>Your orders</h3>${res.player_results.map(r => `<p class="res ${r.success ? 'ok' : 'no'}"><i>${r.success ? '✔' : '✘'} ${esc(r.order)}</i><br>${esc(r.outcome)}</p>`).join('')}` : ''}
        ${mine.length || facts.length || notes.length ? `<h3>Dispatches</h3><ul class="facts">${mine.concat(facts, notes).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(res.messages_to_player || []).length ? `<h3>Messages for you</h3>${res.messages_to_player.map((m, k) => `<p class="res"><i>${esc(m.from)}:</i> ${esc(m.text)} <button class="btn small primary" data-reply="${esc(m.from)}">Reply</button></p>`).join('')}` : ''}
        ${online ? '' : `<p class="offline">The AI game master could not be reached${error ? ` (${esc(error)})` : ''}. Simple built-in rules ran this month.</p>`}
        <div class="acts"><button class="btn primary" id="rp-ok">Continue to ${esc(W.dateLabel(g))}</button></div>`, 'paper');
      $('rp-ok').onclick = () => { closeSheet(); resolve(); };
      $('sheet').querySelectorAll('[data-reply]').forEach(b => b.onclick = () => { const i = W.findNation(g, b.dataset.reply); resolve(); if (i >= 0) replyTo(i); });
    });
  }
  function gameOver() {
    store.del(SAVE);
    sheet(`<h2>${esc(g.nations[g.player].name)} has fallen</h2><p>Your nation no longer holds any land. History will remember its last stand in ${esc(W.dateLabel(g))}.</p>
      <div class="acts"><button class="btn primary" id="go-new">New game</button></div>`);
    $('go-new').onclick = () => { closeSheet(); show('start'); $('continue-wrap').hidden = true; };
  }

  // ================================================================ menus and help
  function showMenu() {
    sheet(`<h2>Menu</h2><p>${esc(g.nations[g.player].name)}, ${esc(W.dateLabel(g))}. Your game saves automatically after every turn.</p>
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
      if (a === 'quit') { saveGame(); closeSheet(); show('start'); const s = readSave(); if (s) { $('continue-wrap').hidden = false; $('btn-continue').textContent = `Continue: ${s.g.nations[s.g.player].name}, ${W.dateLabel(s.g)}`; } }
    });
  }
  function showHelp() {
    sheet(`<h2>How to play</h2>
      <p>Each turn is one month. Nothing happens until you press <b>End turn</b>, so take your time.</p>
      <h3>1. Give orders</h3><ul>
        <li><b>Orders tab:</b> write anything your government does, in plain words. The AI judges if it works.</li>
        <li><b>Raise troops</b> with your treasury. Money comes in every month.</li></ul>
      <h3>2. Move armies</h3><ul>
        <li>Your armies are <b style="color:#80e0ff">blue rectangles</b>. Enemies are <b style="color:#ff8080">red diamonds</b>, neutrals <b style="color:#aaffaa">green squares</b>. The number is divisions.</li>
        <li>Tap your army, then tap a highlighted province. <b>Red</b> = attack. Coastal provinces you hold are ports: ship troops overseas from there.</li>
        <li>Drag to move the map, scroll or pinch to zoom.</li></ul>
      <h3>3. Talk and fight</h3><ul>
        <li><b>Diplomacy tab:</b> talk to any leader in your own words, propose alliances, offer peace or declare war.</li>
        <li>When your armies meet the enemy, choose <b>Command the battle</b> to fight it yourself, or <b>Auto-resolve</b>.</li>
        <li>Occupy enough of an enemy, including its capital, and it surrenders and hands over the land you hold.</li></ul>
      <h3>4. Read the news</h3><ul><li>After each turn, the newspaper tells you what the world did.</li></ul>
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
    if (e.key === 'Enter' && $('overlay').hidden) endTurn();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!$('game').hidden && map) map.draw(now);
    else if (!$('pick').hidden && pickMap) pickMap.draw(now);
  }
  window.FrontLine = { get state() { return g; }, get data() { return data; }, get map() { return map; } };  // handy for debugging in the console
  window.App = { toast, show };
  boot();
})();
