/* The game master: asks the AI server to simulate the world each month and to play foreign leaders.
   Falls back to simple built-in rules when the server can't be reached. */
(function (root) {
  'use strict';
  const AI_URL = 'https://spvwcsaytriytosozzou.supabase.co/functions/v1/ai';
  const W = () => root.World;

  async function call(body, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 150000);
    try {
      const res = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      const out = await res.json().catch(() => ({ error: 'Bad reply from the AI server' }));
      if (!res.ok || out.error) throw new Error(out.error || `AI server error ${res.status}`);
      return out;
    } finally { clearTimeout(t); }
  }

  // ---------------------------------------------------------------- world summary for the AI
  function nationInfo(data, g, i, withProvinces) {
    const n = g.nations[i], Wd = W();
    const o = {
      name: n.name, leader: n.leader || undefined, government: n.gov || undefined,
      power: n.great ? 'great power' : Wd.divisions(g, i) > 15 ? 'regional power' : 'minor',
      divisions: Math.round(Wd.divisions(g, i)), economy: Math.round(n.eco), stability: Math.round(n.stab),
      at_war_with: n.wars.map(w => g.nations[w].name), allies: n.allies.map(a => g.nations[a].name)
    };
    if (i !== g.player && g.player >= 0) o.opinion_of_player = Wd.rel(g, i, g.player);
    const occ = []; g.owner.forEach((ow, p) => { if (ow === i && g.ctrl[p] !== i && g.ctrl[p] >= 0) occ.push(`${data.provinces[p].n} (held by ${g.nations[g.ctrl[p]].name})`); });
    if (occ.length) o.occupied_provinces = occ.slice(0, 30);
    if (withProvinces) o.provinces = Wd.provincesOf(g, i).map(p => data.provinces[p].n).slice(0, 60);
    return o;
  }
  function worldSummary(data, g) {
    const Wd = W(), pl = g.player, me = g.nations[pl];
    const neighbours = new Set();
    Wd.provincesOf(g, pl).forEach(p => data.provinces[p].nb.forEach(q => { const o = g.owner[q]; if (o >= 0 && o !== pl) neighbours.add(o); }));
    const important = new Set([...neighbours, ...me.wars, ...me.allies]);
    g.nations.forEach((n, i) => { if (n.alive && (n.great || n.wars.length)) important.add(i); });
    important.delete(pl);
    const detailed = [...important].filter(i => g.nations[i].alive)
      .map(i => nationInfo(data, g, i, neighbours.has(i) || me.wars.includes(i)));
    const others = g.nations.filter((n, i) => n.alive && i !== pl && !important.has(i)).map(n => n.name);
    return { nations: detailed, other_nations: others };
  }

  // ---------------------------------------------------------------- turn
  async function runTurn(data, g, ctx) {
    const body = {
      mode: 'turn', date: W().dateLabel(g), period: g.period,
      player: Object.assign(nationInfo(data, g, g.player, true), { money: Math.round(g.nations[g.player].money) }),
      orders: ctx.orders || '', diplomacy: ctx.diplomacy || [], battles: ctx.battles || [],
      world: worldSummary(data, g), history: g.history.slice(-14)
    };
    try {
      const res = await call(body);
      return { online: true, res };
    } catch (e) {
      return { online: false, error: e.message, res: offlineTurn(data, g, ctx) };
    }
  }
  function applyTurn(data, g, res) {
    const notes = [];
    for (const ch of res.changes || []) {
      try { const n = W().applyChange(data, g, ch); if (n) notes.push(n); } catch (e) { console.warn('change failed', ch, e); }
    }
    g.history.push(`${W().dateLabel(g)}: ${res.headline}`);
    for (const ev of (res.events || []).slice(0, 4)) g.history.push(`${W().dateLabel(g)}: ${ev.title}`);
    if (g.history.length > 60) g.history.splice(0, g.history.length - 60);
    return notes;
  }

  // ---------------------------------------------------------------- offline fallback
  const OFFLINE_EVENTS = {
    '1900': ['Strikes spread through the industrial cities of {n}', 'A new railway line opens in {n}', 'Anarchists attempt to assassinate a minister in {n}', 'A bumper harvest lifts spirits in {n}', 'Naval building programme announced in {n}', 'Colonial unrest troubles {n}'],
    '1939': ['Rearmament accelerates in {n}', 'A propaganda campaign sweeps {n}', 'Strikes paralyse factories in {n}', 'New tank designs unveiled in {n}', 'Refugees flood into {n}', 'A government reshuffle in {n}'],
    '2003': ['Protests fill the streets of {n}', 'Oil prices jolt the economy of {n}', 'A terror plot is foiled in {n}', 'Elections shake up politics in {n}', 'A tech boom lifts {n}', 'A corruption scandal rocks {n}']
  };
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function offlineTurn(data, g, ctx) {
    const Wd = W(), events = [], changes = [];
    const alive = g.nations.map((n, i) => i).filter(i => g.nations[i].alive);
    for (let k = 0; k < 2; k++) {
      const i = pick(alive.filter(i => g.nations[i].great || Math.random() < 0.2)), n = g.nations[i];
      const t = pick(OFFLINE_EVENTS[g.period]).replace('{n}', n.name);
      const good = /boom|harvest|opens|lifts|unveiled|accelerates/.test(t);
      events.push({ title: t, body: '', nations: [n.name] });
      changes.push({ kind: 'stat', a: n.name, b: '', provinces: [], value: good ? 4 : -4, text: good ? 'economy' : 'stability' });
    }
    // wars of opportunity between hostile neighbours
    for (const i of alive) {
      if (i === g.player || Math.random() > 0.015) continue;
      const n = g.nations[i];
      const targets = new Set();
      Wd.provincesOf(g, i).forEach(p => data.provinces[p].nb.forEach(q => { const o = g.owner[q]; if (o >= 0 && o !== i) targets.add(o); }));
      for (const t of targets) {
        if (Wd.rel(g, i, t) < -45 && !Wd.atWar(g, i, t) && Wd.divisions(g, i) > Wd.divisions(g, t) * 1.6 && !Wd.allied(g, i, t)) {
          changes.push({ kind: 'declare_war', a: n.name, b: g.nations[t].name, provinces: [], value: 0, text: '' });
          events.push({ title: `${n.name} declares war on ${g.nations[t].name}`, body: 'Long-simmering hostility has boiled over.', nations: [n.name, g.nations[t].name] });
          break;
        }
      }
    }
    // tired wars end
    for (const i of alive) for (const j of g.nations[i].wars) {
      if (i > j || i === g.player || j === g.player || Math.random() > 0.06) continue;
      const taken = []; g.owner.forEach((o, p) => { if (o === j && g.ctrl[p] === i) taken.push(data.provinces[p].n); });
      changes.push({ kind: 'make_peace', a: g.nations[i].name, b: g.nations[j].name, provinces: taken, value: 0, text: '' });
      events.push({ title: `${g.nations[i].name} and ${g.nations[j].name} sign a peace`, body: '', nations: [g.nations[i].name, g.nations[j].name] });
    }
    const player_results = ctx.orders ? [{ order: ctx.orders.slice(0, 120), outcome: 'The AI game master is offline, so your orders were noted but not judged this month.', success: true }] : [];
    const war = (ctx.battles || []).length;
    return {
      headline: war ? 'The guns do not fall silent' : pick(['A quiet month in the chancelleries', 'Diplomats trade notes as the world turns', 'Markets steady, generals restless']),
      summary: war ? `${war} battle${war > 1 ? 's were' : ' was'} fought this month.` : 'No great power made a decisive move this month.',
      events, player_results, changes
    };
  }

  // ---------------------------------------------------------------- diplomacy chat
  async function chat(data, g, nationIdx, message) {
    const Wd = W(), n = g.nations[nationIdx], hist = (g.chats[nationIdx] = g.chats[nationIdx] || []);
    const body = {
      mode: 'chat', date: Wd.dateLabel(g), period: g.period,
      nation: Object.assign(nationInfo(data, g, nationIdx, true), { at_war_with_player: Wd.atWar(g, nationIdx, g.player), allied_with_player: Wd.allied(g, nationIdx, g.player) }),
      player: nationInfo(data, g, g.player, true),
      context: { recent_history: g.history.slice(-10) },
      history: hist.slice(-16), message
    };
    try {
      const res = await call(body, 90000);
      return { online: true, res };
    } catch (e) {
      return { online: false, error: e.message, res: offlineChat(g, nationIdx, message) };
    }
  }
  function offlineChat(g, i, message) {
    const r = W().rel(g, i, g.player), m = message.toLowerCase();
    let kind = 'none', reply;
    if (/peace/.test(m) && W().atWar(g, i, g.player)) {
      if (r > -70 || Math.random() < 0.3) { kind = 'peace'; reply = 'Our people are weary. We accept an end to hostilities on the present lines.'; }
      else reply = 'Peace? Not while your soldiers stand on our soil.';
    } else if (/allian|ally/.test(m)) {
      if (r > 40) { kind = 'alliance'; reply = 'Our interests align. Let us stand together.'; } else reply = 'An alliance requires trust we have not yet built.';
    } else reply = r > 30 ? 'We value our friendship and will consider your words carefully.' : r < -30 ? 'Your government\'s conduct gives us little reason to listen.' : 'We have noted your message.';
    return { reply: reply + ' (The AI is offline; this is a simple automatic reply.)', relation_change: 0, agreement: { kind, terms: '', provinces: [], provinces_go_to: 'none', target: '' } };
  }

  // Sign a deal agreed in chat.
  function applyAgreement(data, g, i, ag) {
    const Wd = W(), me = g.player, them = g.nations[i].name, mine = g.nations[me].name;
    const provs = (ag.provinces || []).map(x => Wd.findProvince(data, x)).filter(p => p >= 0);
    switch (ag.kind) {
      case 'peace': {
        Wd.makePeace(g, me, i);
        for (const p of provs) { if (ag.provinces_go_to === 'player' && g.owner[p] === i) Wd.transfer(g, data, p, me); if (ag.provinces_go_to === 'them' && g.owner[p] === me) Wd.transfer(g, data, p, i); }
        return `Peace signed with ${them}.`;
      }
      case 'alliance': Wd.ally(g, me, i); return `${mine} and ${them} are now allies.`;
      case 'end_alliance': Wd.unally(g, me, i); return `The alliance with ${them} is dissolved.`;
      case 'transfer_provinces': {
        let k = 0;
        for (const p of provs) { if (ag.provinces_go_to === 'player' && g.owner[p] === i) { Wd.transfer(g, data, p, me); k++; } if (ag.provinces_go_to === 'them' && g.owner[p] === me) { Wd.transfer(g, data, p, i); k++; } }
        return `${k} province${k === 1 ? '' : 's'} changed hands.`;
      }
      case 'war_together': {
        const t = Wd.findNation(g, ag.target);
        if (t >= 0 && t !== i) { Wd.declareWar(g, i, t); return `${them} declares war on ${g.nations[t].name}.`; }
        return 'They agreed, but the target was unclear.';
      }
      case 'declare_war': Wd.declareWar(g, i, me); return `${them} has declared war on ${mine}!`;
      case 'non_aggression': Wd.addRel(g, i, me, 20); Wd.addRel(g, me, i, 20); return `Non-aggression pact signed with ${them}.`;
      case 'military_access': (g.nations[i].access = g.nations[i].access || []).push(me); return `${them} grants your armies passage through its land.`;
      case 'trade': g.nations[me].eco += 3; g.nations[i].eco += 3; Wd.addRel(g, i, me, 10); return `Trade agreement signed with ${them}. Both economies grow.`;
    }
    return null;
  }

  root.GM = { runTurn, applyTurn, chat, applyAgreement, AI_URL };
})(window);
