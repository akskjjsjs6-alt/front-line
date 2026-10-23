/* Front Line world simulation: nations, provinces, armies, wars. No DOM. */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ periods
  const PERIODS = {
    '1900': {
      id: '1900', file: 'data/world-1900.json', start: [1900, 1], title: 'The Age of Empires', speed: 2, recruitCost: 6,
      blurb: 'Queen Victoria still reigns. Europe\'s empires cover the globe, the Boer War rages and China simmers. Fourteen years of peace remain, unless someone breaks it sooner.',
      units: { inf: 0.7, recon: 0.2, art: 0.1 },
      wars: [['United Kingdom', 'Transvaal'], ['United Kingdom', 'Orange Free State']],
      alliances: [['France', 'Russia'], ['Germany', 'Austria-Hungary'], ['Germany', 'Italy'], ['Austria-Hungary', 'Italy'], ['Transvaal', 'Orange Free State']],
      hostile: [['France', 'Germany', -45], ['Russia', 'Japan', -40], ['United Kingdom', 'Russia', -25], ['Austria-Hungary', 'Serbia', -30], ['Russia', 'Ottoman Empire', -35], ['United Kingdom', 'France', -15]]
    },
    '1939': {
      id: '1939', file: 'data/world-1938.json', start: [1939, 3], title: 'The Gathering Storm', speed: 3, recruitCost: 8,
      blurb: 'Germany has swallowed Austria and eyes Poland. Japan is at war in China. Britain and France promise to defend Poland. The world holds its breath.',
      units: { inf: 0.55, mech: 0.15, armor: 0.12, recon: 0.06, art: 0.1, ad: 0.02 },
      wars: [['Japan', 'China']],
      alliances: [['Germany', 'Italy'], ['Germany', 'Japan'], ['United Kingdom', 'France'], ['France', 'Poland'], ['United Kingdom', 'Poland'], ['USSR', 'Mongolia']],
      hostile: [['Germany', 'Poland', -50], ['Germany', 'France', -40], ['Germany', 'United Kingdom', -25], ['USSR', 'Germany', -35], ['Japan', 'USSR', -45], ['Japan', 'United States', -30], ['Italy', 'France', -25], ['Hungary', 'Romania', -35], ['Germany', 'Czechoslovakia', -60]]
    },
    '2003': {
      id: '2003', file: 'data/world-2000.json', start: [2003, 1], title: 'The New Century', speed: 4, recruitCost: 14,
      blurb: 'The only superpower prepares to invade Iraq. Russia rebuilds under Putin, China rises fast, and old feuds smoulder from Kashmir to Korea.',
      units: { inf: 0.3, mech: 0.25, armor: 0.2, recon: 0.07, art: 0.08, mlrs: 0.04, ad: 0.02, heli: 0.03, uas: 0.01 },
      wars: [],
      alliances: [
        ...pairs(['United States', 'United Kingdom', 'France', 'Germany', 'Italy', 'Canada', 'Turkey', 'Spain', 'Poland', 'Netherlands', 'Belgium', 'Norway', 'Denmark', 'Portugal', 'Greece', 'Hungary', 'Czech Republic', 'Iceland', 'Luxembourg']),
        ['United States', 'Japan'], ['United States', 'South Korea'], ['United States', 'Australia'], ['United States', 'Israel'],
        ['Russia', 'Belarus'], ['Russia', 'Kazakhstan'], ['Russia', 'Armenia'], ['Russia', 'Tajikistan'], ['Russia', 'Kyrgyzstan'], ['China', 'North Korea']
      ],
      hostile: [['United States', 'Iraq', -90], ['United States', 'Iran', -70], ['United States', 'North Korea', -80], ['Israel', 'Iran', -80], ['Israel', 'Syria', -70],
        ['India', 'Pakistan', -70], ['North Korea', 'South Korea', -60], ['China', 'Taiwan', -70], ['Russia', 'Georgia', -40], ['Armenia', 'Azerbaijan', -70],
        ['Iraq', 'Kuwait', -60], ['Iraq', 'Iran', -50], ['United States', 'Cuba', -60], ['Ethiopia', 'Eritrea', -60]]
    }
  };
  function pairs(list) { const out = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]); return out; }

  // name -> [divisions, tech, economy, government, leader]
  const PROFILES = {
    '1900': {
      'United Kingdom': [30, 1.1, 100, 'Constitutional monarchy', 'Queen Victoria (PM Lord Salisbury)'],
      'Germany': [50, 1.2, 90, 'Imperial monarchy', 'Kaiser Wilhelm II'],
      'France': [45, 1.1, 80, 'Republic', 'President Émile Loubet'],
      'Russia': [70, 0.85, 55, 'Autocracy', 'Tsar Nicholas II'],
      'Austria-Hungary': [40, 0.95, 60, 'Dual monarchy', 'Emperor Franz Joseph I'],
      'United States': [15, 1.0, 100, 'Republic', 'President William McKinley'],
      'Japan': [25, 1.0, 50, 'Imperial monarchy', 'Emperor Meiji'],
      'Italy': [25, 0.9, 50, 'Constitutional monarchy', 'King Umberto I'],
      'Ottoman Empire': [30, 0.75, 35, 'Sultanate', 'Sultan Abdul Hamid II'],
      'Qing China': [40, 0.6, 40, 'Imperial dynasty', 'Empress Dowager Cixi'],
      'Spain': [12, 0.8, 40, 'Constitutional monarchy', 'Queen Regent Maria Christina'],
      'Portugal': [6, 0.8, 30, 'Constitutional monarchy', 'King Carlos I'],
      'Netherlands': [6, 0.9, 55, 'Constitutional monarchy', 'Queen Wilhelmina'],
      'Belgium': [5, 0.9, 60, 'Constitutional monarchy', 'King Leopold II'],
      'Persia': [8, 0.55, 25, 'Monarchy', 'Mozaffar ad-Din Shah'],
      'Brazil': [8, 0.7, 35, 'Republic', 'President Campos Sales'],
      'Ethiopia': [10, 0.65, 20, 'Empire', 'Emperor Menelik II'],
      'Siam': [5, 0.6, 25, 'Monarchy', 'King Chulalongkorn'],
      'Korea': [4, 0.55, 20, 'Empire', 'Emperor Gojong'],
      'Mexico': [8, 0.7, 35, 'Republic (dictatorship)', 'President Porfirio Díaz'],
      'Transvaal': [5, 1.05, 30, 'Boer republic', 'President Paul Kruger'],
      'Orange Free State': [3, 1.0, 20, 'Boer republic', 'President Martinus Steyn'],
      'Afghanistan': [5, 0.6, 15, 'Emirate', 'Emir Abdur Rahman Khan'],
      'Sweden-Norway': [8, 0.95, 55, 'Union of crowns', 'King Oscar II'],
      'Denmark': [4, 0.9, 55, 'Constitutional monarchy', 'King Christian IX'],
      'Argentina': [8, 0.75, 45, 'Republic', 'President Julio Roca'],
      'Egypt': [5, 0.6, 30, 'Khedivate (British influence)', 'Khedive Abbas II'],
      'Morocco': [5, 0.55, 20, 'Sultanate', 'Sultan Abdelaziz'],
      'Greece': [5, 0.8, 30, 'Constitutional monarchy', 'King George I'],
      'Romania': [8, 0.8, 35, 'Constitutional monarchy', 'King Carol I'],
      'Serbia': [5, 0.8, 25, 'Monarchy', 'King Alexander I'],
      'Bulgaria': [6, 0.8, 25, 'Principality', 'Prince Ferdinand'],
      'Chile': [6, 0.8, 40, 'Republic', 'President Federico Errázuriz'],
      'Switzerland': [4, 0.95, 65, 'Federal republic', 'Federal Council']
    },
    '1939': {
      'Germany': [100, 1.3, 90, 'Nazi dictatorship', 'Führer Adolf Hitler'],
      'France': [90, 1.05, 75, 'Republic', 'Premier Édouard Daladier'],
      'United Kingdom': [30, 1.1, 100, 'Constitutional monarchy', 'Prime Minister Neville Chamberlain'],
      'USSR': [150, 0.95, 70, 'Communist dictatorship', 'General Secretary Joseph Stalin'],
      'United States': [15, 1.05, 130, 'Republic', 'President Franklin D. Roosevelt'],
      'Japan': [60, 1.0, 60, 'Imperial militarist government', 'PM Hiranuma Kiichirō (Emperor Hirohito)'],
      'Italy': [60, 0.85, 55, 'Fascist dictatorship', 'Duce Benito Mussolini'],
      'China': [80, 0.6, 35, 'Nationalist republic', 'Generalissimo Chiang Kai-shek'],
      'Poland': [40, 0.85, 45, 'Republic (Sanation regime)', 'Marshal Edward Rydz-Śmigły'],
      'Czechoslovakia': [30, 1.0, 50, 'Republic', 'President Emil Hácha'],
      'Spain': [20, 0.8, 30, 'Nationalist dictatorship', 'Generalísimo Francisco Franco'],
      'Turkey': [25, 0.8, 35, 'Republic', 'President İsmet İnönü'],
      'Hungary': [10, 0.85, 40, 'Regency', 'Regent Miklós Horthy'],
      'Romania': [20, 0.75, 40, 'Royal dictatorship', 'King Carol II'],
      'Yugoslavia': [25, 0.75, 35, 'Monarchy', 'Prince Regent Paul'],
      'Netherlands': [8, 0.9, 65, 'Constitutional monarchy', 'Queen Wilhelmina'],
      'Belgium': [18, 0.95, 65, 'Constitutional monarchy', 'King Leopold III'],
      'Sweden': [8, 0.95, 65, 'Constitutional monarchy', 'PM Per Albin Hansson'],
      'Finland': [9, 1.0, 45, 'Republic', 'President Kyösti Kallio'],
      'Canada': [6, 1.0, 70, 'Dominion', 'PM William Lyon Mackenzie King'],
      'Australia': [5, 1.0, 60, 'Dominion', 'PM Joseph Lyons'],
      'South Africa': [4, 0.95, 45, 'Dominion', 'PM J. B. M. Hertzog'],
      'Brazil': [10, 0.7, 40, 'Estado Novo dictatorship', 'President Getúlio Vargas'],
      'Argentina': [8, 0.75, 50, 'Republic', 'President Roberto Ortiz'],
      'Mexico': [8, 0.7, 35, 'Republic', 'President Lázaro Cárdenas'],
      'Portugal': [6, 0.75, 30, 'Estado Novo dictatorship', 'PM António de Oliveira Salazar'],
      'Greece': [10, 0.8, 30, 'Metaxas dictatorship', 'PM Ioannis Metaxas'],
      'Iran': [8, 0.6, 30, 'Monarchy', 'Reza Shah Pahlavi'],
      'Saudi Arabia': [3, 0.6, 20, 'Absolute monarchy', 'King Ibn Saud'],
      'Mongolia': [4, 0.7, 15, 'Communist republic', 'Marshal Khorloogiin Choibalsan'],
      'Siam': [6, 0.65, 25, 'Military-led monarchy', 'PM Plaek Phibunsongkhram'],
      'Egypt': [4, 0.65, 30, 'Monarchy', 'King Farouk'],
      'Ireland': [3, 0.8, 40, 'Republic', 'Taoiseach Éamon de Valera'],
      'Norway': [4, 0.85, 55, 'Constitutional monarchy', 'PM Johan Nygaardsvold'],
      'Denmark': [3, 0.85, 60, 'Constitutional monarchy', 'PM Thorvald Stauning'],
      'Switzerland': [8, 1.0, 70, 'Federal republic', 'Federal Council'],
      'Bulgaria': [8, 0.8, 30, 'Monarchy', 'Tsar Boris III'],
      'Albania': [2, 0.6, 15, 'Monarchy', 'King Zog I'],
      'Lithuania': [3, 0.8, 35, 'Authoritarian republic', 'President Antanas Smetona'],
      'Latvia': [3, 0.8, 35, 'Authoritarian republic', 'President Kārlis Ulmanis'],
      'Estonia': [2, 0.8, 35, 'Authoritarian republic', 'President Konstantin Päts'],
      'Iraq': [4, 0.6, 25, 'Monarchy', 'King Ghazi'],
      'Afghanistan': [4, 0.55, 15, 'Monarchy', 'King Zahir Shah']
    },
    '2003': {
      'United States': [60, 1.6, 160, 'Federal republic', 'President George W. Bush'],
      'Russia': [50, 1.1, 60, 'Federal republic', 'President Vladimir Putin'],
      'China': [80, 1.0, 90, 'Communist one-party state', 'President Jiang Zemin (Hu Jintao rising)'],
      'United Kingdom': [15, 1.4, 100, 'Constitutional monarchy', 'Prime Minister Tony Blair'],
      'France': [15, 1.35, 95, 'Republic', 'President Jacques Chirac'],
      'Germany': [15, 1.3, 100, 'Federal republic', 'Chancellor Gerhard Schröder'],
      'Japan': [12, 1.3, 110, 'Constitutional monarchy', 'PM Junichiro Koizumi'],
      'India': [40, 0.95, 60, 'Federal republic', 'PM Atal Bihari Vajpayee'],
      'Iraq': [23, 0.6, 25, 'Baathist dictatorship', 'President Saddam Hussein'],
      'Iran': [25, 0.8, 40, 'Islamic republic', 'Supreme Leader Ali Khamenei (President Khatami)'],
      'Israel': [15, 1.4, 60, 'Parliamentary republic', 'PM Ariel Sharon'],
      'Turkey': [30, 1.0, 50, 'Parliamentary republic', 'PM Abdullah Gül'],
      'Pakistan': [25, 0.85, 30, 'Military-led republic', 'President Pervez Musharraf'],
      'North Korea': [40, 0.7, 10, 'Communist dictatorship', 'Kim Jong-il'],
      'South Korea': [25, 1.2, 80, 'Republic', 'President Kim Dae-jung'],
      'Saudi Arabia': [10, 1.0, 60, 'Absolute monarchy', 'King Fahd (Crown Prince Abdullah)'],
      'Ukraine': [20, 0.85, 30, 'Republic', 'President Leonid Kuchma'],
      'Poland': [12, 1.0, 50, 'Republic', 'President Aleksander Kwaśniewski'],
      'Egypt': [25, 0.8, 35, 'Republic (authoritarian)', 'President Hosni Mubarak'],
      'Brazil': [20, 0.9, 60, 'Federal republic', 'President Luiz Inácio Lula da Silva'],
      'Italy': [12, 1.2, 90, 'Republic', 'PM Silvio Berlusconi'],
      'Syria': [12, 0.7, 20, 'Baathist dictatorship', 'President Bashar al-Assad'],
      'Libya': [5, 0.6, 30, 'Jamahiriya dictatorship', 'Colonel Muammar Gaddafi'],
      'Afghanistan': [3, 0.5, 5, 'Transitional government', 'President Hamid Karzai'],
      'Canada': [5, 1.3, 90, 'Federal parliamentary monarchy', 'PM Jean Chrétien'],
      'Australia': [5, 1.3, 85, 'Federal parliamentary monarchy', 'PM John Howard'],
      'Spain': [8, 1.2, 80, 'Constitutional monarchy', 'PM José María Aznar'],
      'Mexico': [10, 0.85, 55, 'Federal republic', 'President Vicente Fox'],
      'Venezuela': [6, 0.75, 35, 'Federal republic', 'President Hugo Chávez'],
      'Cuba': [6, 0.7, 15, 'Communist one-party state', 'President Fidel Castro'],
      'Belarus': [6, 0.8, 25, 'Authoritarian republic', 'President Alexander Lukashenko'],
      'Kazakhstan': [6, 0.8, 35, 'Authoritarian republic', 'President Nursultan Nazarbayev'],
      'Indonesia': [15, 0.8, 40, 'Republic', 'President Megawati Sukarnoputri'],
      'Nigeria': [8, 0.7, 30, 'Federal republic', 'President Olusegun Obasanjo'],
      'South Africa': [6, 1.0, 50, 'Republic', 'President Thabo Mbeki'],
      'Argentina': [6, 0.85, 35, 'Federal republic', 'President Eduardo Duhalde'],
      'Taiwan': [12, 1.2, 70, 'Republic', 'President Chen Shui-bian'],
      'Vietnam': [20, 0.8, 30, 'Communist one-party state', 'General Secretary Nông Đức Mạnh'],
      'Greece': [8, 1.1, 60, 'Republic', 'PM Costas Simitis'],
      'Georgia': [2, 0.8, 15, 'Republic', 'President Eduard Shevardnadze'],
      'Serbia': [6, 0.85, 20, 'Federal republic', 'President Milan Milutinović'],
      'Ethiopia': [12, 0.65, 15, 'Federal republic', 'PM Meles Zenawi'],
      'Eritrea': [6, 0.65, 10, 'One-party state', 'President Isaias Afwerki'],
      'Kuwait': [2, 1.0, 50, 'Emirate', 'Emir Jaber Al-Ahmad Al-Sabah'],
      'Jordan': [4, 1.0, 30, 'Monarchy', 'King Abdullah II'],
      'Zimbabwe': [3, 0.6, 10, 'Republic (authoritarian)', 'President Robert Mugabe']
    }
  };

  const COLORS = {
    'United Kingdom': '#c9474f', 'France': '#3d6fd1', 'Germany': '#6f6f6f', 'Russia': '#3f8a4f', 'USSR': '#a8322d', 'United States': '#2f4f9a',
    'Austria-Hungary': '#d6c25a', 'Italy': '#5aa86b', 'Japan': '#e8e2d0', 'Ottoman Empire': '#5f9c8c', 'Qing China': '#d9a441', 'China': '#d9a441',
    'Spain': '#e0b84f', 'Portugal': '#3a8a6a', 'Netherlands': '#e08a3c', 'Belgium': '#c79a2f', 'Poland': '#d97a90', 'Brazil': '#4caf6e',
    'Canada': '#b8545d', 'Australia': '#3f7fb5', 'India': '#e39a4c', 'Iraq': '#7b9e52', 'Iran': '#4f9a83', 'Turkey': '#9e4b5b', 'Sweden': '#4f86c4',
    'Sweden-Norway': '#4f86c4', 'Persia': '#4f9a83', 'Mexico': '#6b9a49', 'Argentina': '#8cb7dd', 'Czechoslovakia': '#5d86b6', 'Hungary': '#a87c4f',
    'Romania': '#c8b04a', 'Yugoslavia': '#7a6cb0', 'Finland': '#cfd8e8', 'Egypt': '#c4a868', 'Saudi Arabia': '#4e8a43', 'Israel': '#7ea6d8',
    'South Korea': '#6d8fc9', 'North Korea': '#a54a4a', 'Pakistan': '#3f7f4f', 'Ukraine': '#e0c64a', 'Mongolia': '#8a6b4f', 'Ethiopia': '#8fa84a'
  };

  // ------------------------------------------------------------------ helpers
  function hashColor(name) {
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
    const hue = ((h >>> 0) % 360), s = 35 + ((h >>> 9) % 25), l = 48 + ((h >>> 17) % 16);
    return hsl(hue, s, l);
  }
  function hsl(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const rnd = (g) => { g.seed = (g.seed * 1664525 + 1013904223) >>> 0; return g.seed / 4294967296; };

  function decodeGrid(data) {
    const grid = new Int32Array(data.w * data.h); let k = 0;
    const r = data.rle;
    for (let i = 0; i < r.length; i += 2) { grid.fill(r[i], k, k + r[i + 1]); k += r[i + 1]; }
    return grid;
  }

  // ------------------------------------------------------------------ setup
  function newGame(data, periodId, playerName) {
    const P = PERIODS[periodId], prof = PROFILES[periodId] || {};
    const g = {
      v: 1, period: periodId, year: P.start[0], month: P.start[1], turn: 1, seed: 12345,
      player: -1, nations: [], owner: [], ctrl: [], armies: [], nextArmy: 1,
      news: [], pending: [], chats: {}, orders: '', history: [], over: null
    };
    data.nations.forEach((n, i) => {
      const p = prof[n.name];
      const area = n.area;
      const div = p ? p[0] : Math.max(1, Math.min(14, Math.round(1 + Math.sqrt(area) / (n.great ? 2 : 4.5))));
      const baseTech = periodId === '1900' ? 0.7 : periodId === '1939' ? 0.7 : 0.75;
      g.nations.push({
        name: n.name, color: COLORS[n.name] || hashColor(n.name), cap: n.cap, great: !!n.great || !!(p && p[0] >= 25),
        tech: p ? p[1] : baseTech, eco: p ? p[2] : Math.round(15 + Math.min(40, Math.sqrt(area))), stab: 60, mil: 50,
        gov: p ? p[3] : '', leader: p ? p[4] : '', money: 0, alive: true,
        rel: {}, allies: [], wars: [], startDiv: div
      });
    });
    g.owner = data.provinces.map(p => p.o);
    g.ctrl = g.owner.slice();
    const idx = name => g.nations.findIndex(n => n.name === name);
    for (const [a, b] of P.alliances) { const i = idx(a), j = idx(b); if (i >= 0 && j >= 0) ally(g, i, j); }
    for (const [a, b] of P.wars) { const i = idx(a), j = idx(b); if (i >= 0 && j >= 0) setWar(g, i, j, true); }
    for (const [a, b, v] of P.hostile) { const i = idx(a), j = idx(b); if (i >= 0 && j >= 0) { setRel(g, i, j, v); setRel(g, j, i, v); } }
    for (const a of g.armies) a.div = 0;
    // starting armies: the capital plus the most contested borders
    g.nations.forEach((n, i) => {
      const borders = borderProvinces(data, g, i);
      let left = n.startDiv;
      const capShare = borders.length ? Math.max(1, Math.round(left * 0.35)) : left;
      addArmy(g, i, n.cap, capShare); left -= capShare;
      const scored = borders.map(p => {
        let s = 0;
        for (const q of data.provinces[p].nb) { const o = g.owner[q]; if (o >= 0 && o !== i) s += (g.nations[o].great ? 3 : 1) + Math.max(0, -rel(g, i, o)) / 10 + (atWar(g, i, o) ? 20 : 0); }
        return [p, s];
      }).sort((a, b) => b[1] - a[1]);
      const groups = Math.min(scored.length, Math.max(1, Math.min(6, Math.round(left / 6))));
      for (let k = 0; k < groups && left > 0.5; k++) {
        const d = k === groups - 1 ? left : Math.max(1, Math.round(left / (groups - k)));
        addArmy(g, i, scored[k][0], d); left -= d;
      }
      if (left > 0.5) addArmy(g, i, n.cap, left);
    });
    mergeArmies(g);
    g.player = idx(playerName);
    for (const n of g.nations) n.money = Math.round(income(data, g, g.nations.indexOf(n)) * 3);
    return g;
  }

  function addArmy(g, n, p, div) {
    const a = { id: g.nextArmy++, n, p, div: Math.max(0.5, div), org: 100, path: [], moved: false };
    g.armies.push(a); return a;
  }
  function mergeArmies(g) {
    const seen = new Map();
    for (const a of g.armies) {
      const k = a.n + ':' + a.p;
      const b = seen.get(k);
      if (b && !a.path.length && !b.path.length) { b.org = (b.org * b.div + a.org * a.div) / (b.div + a.div); b.div += a.div; a.div = 0; }
      else if (!b) seen.set(k, a);
    }
    g.armies = g.armies.filter(a => a.div > 0.05);
  }

  // ------------------------------------------------------------------ diplomacy
  const key = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  function rel(g, a, b) { return g.nations[a].rel[b] || 0; }
  function setRel(g, a, b, v) { g.nations[a].rel[b] = Math.max(-100, Math.min(100, Math.round(v))); }
  function addRel(g, a, b, d) { setRel(g, a, b, rel(g, a, b) + d); }
  function atWar(g, a, b) { return g.nations[a].wars.includes(b); }
  function allied(g, a, b) { return g.nations[a].allies.includes(b); }
  function ally(g, a, b) {
    if (a === b || allied(g, a, b)) return;
    g.nations[a].allies.push(b); g.nations[b].allies.push(a);
    setRel(g, a, b, Math.max(rel(g, a, b), 50)); setRel(g, b, a, Math.max(rel(g, b, a), 50));
  }
  function unally(g, a, b) {
    g.nations[a].allies = g.nations[a].allies.filter(x => x !== b);
    g.nations[b].allies = g.nations[b].allies.filter(x => x !== a);
  }
  function setWar(g, a, b, on) {
    if (a === b || a < 0 || b < 0) return;
    const A = g.nations[a], B = g.nations[b];
    if (on) {
      if (!A.wars.includes(b)) A.wars.push(b);
      if (!B.wars.includes(a)) B.wars.push(a);
      unally(g, a, b);
      setRel(g, a, b, Math.min(rel(g, a, b), -60)); setRel(g, b, a, Math.min(rel(g, b, a), -80));
    } else {
      A.wars = A.wars.filter(x => x !== b); B.wars = B.wars.filter(x => x !== a);
      // occupied land goes back unless a treaty moved it
      for (let p = 0; p < g.owner.length; p++) {
        if ((g.owner[p] === a && g.ctrl[p] === b) || (g.owner[p] === b && g.ctrl[p] === a)) g.ctrl[p] = g.owner[p];
      }
      // armies standing in the other's land go home
      for (const army of g.armies) {
        const o = g.owner[army.p];
        if ((army.n === a && o === b) || (army.n === b && o === a)) { army.p = g.nations[army.n].cap; army.path = []; }
      }
    }
  }
  // Declaring war pulls in the defender's allies.
  function declareWar(g, a, b) {
    const out = [];
    if (atWar(g, a, b)) return out;
    setWar(g, a, b, true); out.push([a, b]);
    g.starter = g.starter || {}; g.starter[key(a, b)] = a;
    for (const c of g.nations[b].allies.slice()) {
      if (c === a || atWar(g, a, c) || !g.nations[c].alive) continue;
      if (allied(g, a, c)) { unally(g, a, c); continue; }   // torn between two allies: stays out
      setWar(g, a, c, true); out.push([a, c]);
    }
    for (const c of g.nations) {
      const ci = g.nations.indexOf(c);
      if (ci !== a && ci !== b) { addRel(g, ci, a, g.nations[b].great ? -5 : -10); }
    }
    return out;
  }
  function makePeace(g, a, b) { setWar(g, a, b, false); setRel(g, a, b, Math.max(rel(g, a, b), -30)); setRel(g, b, a, Math.max(rel(g, b, a), -40)); }

  function transfer(g, data, p, to) {
    g.owner[p] = to; g.ctrl[p] = to;
    for (const army of g.armies) if (army.p === p && army.n !== to && !atWar(g, army.n, to) && !allied(g, army.n, to)) {
      const home = g.nations[army.n].cap;
      army.p = g.owner[home] === army.n ? home : nearestOwned(data, g, army.n, p);
      army.path = [];
    }
    for (const n of g.nations) if (n.cap === p && g.nations.indexOf(n) !== to) {
      const ni = g.nations.indexOf(n), mine = provincesOf(g, ni);
      if (mine.length) n.cap = mine.sort((x, y) => data.provinces[y].a - data.provinces[x].a)[0];
    }
    checkAlive(g);
  }
  function checkAlive(g) {
    g.nations.forEach((n, i) => {
      if (!n.alive) return;
      if (!g.owner.some(o => o === i)) {
        n.alive = false;
        for (const w of n.wars.slice()) setWar(g, i, w, false);
        for (const al of n.allies.slice()) unally(g, i, al);
        g.armies = g.armies.filter(a => a.n !== i);
      }
    });
  }
  function provincesOf(g, n) { const out = []; g.owner.forEach((o, i) => { if (o === n) out.push(i); }); return out; }
  function nearestOwned(data, g, n, from) {
    const seen = new Set([from]), q = [from];
    while (q.length) {
      const p = q.shift();
      if (g.owner[p] === n && g.ctrl[p] === n) return p;
      for (const x of neighbours(data, p)) if (!seen.has(x)) { seen.add(x); q.push(x); }
    }
    return g.nations[n].cap;
  }
  function neighbours(data, p) { const pr = data.provinces[p]; return pr.sea ? pr.nb.concat(pr.sea) : pr.nb; }
  function borderProvinces(data, g, n) {
    const out = [];
    data.provinces.forEach((p, i) => { if (g.owner[i] === n && p.nb.some(q => g.owner[q] >= 0 && g.owner[q] !== n)) out.push(i); });
    return out;
  }

  // ------------------------------------------------------------------ economy
  function provValue(data, p) { return Math.min(4, 0.6 + data.provinces[p].a / 250); }
  // Income comes mostly from the national economy (scaled by how much of the country you still control), plus land.
  function income(data, g, n) {
    let land = 0, own = 0, held = 0;
    for (let p = 0; p < g.owner.length; p++) {
      if (g.owner[p] !== n) continue;
      const a = data.provinces[p].a + 20;
      own += a;
      if (g.ctrl[p] === n) { held += a; land += provValue(data, p); }
    }
    const N = g.nations[n];
    return 2 + (N.eco * 0.22 * (own ? held / own : 0) + land * 0.4) * (0.6 + N.stab / 250);
  }
  function divisions(g, n) { return g.armies.reduce((s, a) => s + (a.n === n ? a.div : 0), 0); }
  function upkeep(g, n) { return divisions(g, n) * 0.12; }
  function recruit(data, g, n, count, where) {
    const P = PERIODS[g.period], N = g.nations[n];
    const cost = P.recruitCost * count;
    if (N.money < cost) return false;
    const p = where != null && g.owner[where] === n && g.ctrl[where] === n ? where : N.cap;
    if (g.ctrl[p] !== n) return false;
    N.money -= cost;
    const a = addArmy(g, n, p, count); a.org = 60;
    mergeArmies(g);
    return true;
  }

  // ------------------------------------------------------------------ movement
  function canEnter(g, n, p) {
    const o = g.ctrl[p];
    if (o < 0) return true;                       // unclaimed land
    if (o === n || allied(g, n, o)) return true;
    if ((g.nations[o].access || []).includes(n)) return true;     // military access granted
    if (atWar(g, n, o) || atWar(g, n, g.owner[p])) return true;
    return false;
  }
  // Provinces an army can reach this turn: map province -> path
  // A coastal province you control works as a port: armies there can ship to any coast they may enter (takes the whole turn).
  function isPort(data, g, n, p) { return data.provinces[p].c && (g.ctrl[p] === n || (g.ctrl[p] >= 0 && allied(g, n, g.ctrl[p]))); }
  function seaTargets(data, g, n, from) {
    const out = [];
    if (!isPort(data, g, n, from)) return out;
    for (let p = 0; p < data.provinces.length; p++) if (p !== from && data.provinces[p].c && canEnter(g, n, p)) out.push(p);
    return out;
  }
  function reachable(data, g, army) {
    const steps = PERIODS[g.period].speed, out = new Map([[army.p, []]]), q = [[army.p, []]];
    while (q.length) {
      const [p, path] = q.shift();
      if (path.length >= steps) continue;
      if (path.length && hostileHere(g, army.n, p)) continue;   // stop when entering enemy ground
      for (const x of neighbours(data, p)) {
        if (out.has(x) || !canEnter(g, army.n, x)) continue;
        const np = path.concat([x]);
        out.set(x, np); q.push([x, np]);
      }
    }
    // overseas: coasts not reachable on foot this turn
    for (const p of seaTargets(data, g, army.n, army.p)) if (!out.has(p)) { const sp = [p]; sp.sea = true; out.set(p, sp); }
    return out;
  }
  function hostileHere(g, n, p) {
    const c = g.ctrl[p];
    if (c >= 0 && atWar(g, n, c)) return true;
    return g.armies.some(a => a.p === p && atWar(g, n, a.n));
  }
  // Shortest path ignoring the per-turn limit (for AI planning)
  function pathTo(data, g, n, from, test, maxLen) {
    const prev = new Map([[from, -1]]), q = [from];
    while (q.length) {
      const p = q.shift();
      if (p !== from && test(p)) { const path = []; for (let c = p; c !== from; c = prev.get(c)) path.unshift(c); return path; }
      if (maxLen && pathLen(prev, p) >= maxLen) continue;
      for (const x of neighbours(data, p)) if (!prev.has(x) && canEnter(g, n, x)) { prev.set(x, p); q.push(x); }
    }
    return null;
  }
  function pathLen(prev, p) { let n = 0; for (let c = p; prev.get(c) !== -1 && prev.has(c); c = prev.get(c)) n++; return n; }

  function moveArmies(data, g, which) {
    const steps = PERIODS[g.period].speed;
    for (const a of g.armies) {
      if (!which(a) || !a.path.length) continue;
      let n = 0;
      while (a.path.length && n < steps) {
        const nx = a.path[0];
        if (!canEnter(g, a.n, nx)) { a.path = []; break; }
        const bySea = !neighbours(data, a.p).includes(nx);
        if (bySea && n > 0) break;                 // embarking takes the whole turn
        a.p = nx; a.path.shift(); n++; a.moved = true;
        if (bySea) { a.org = Math.max(10, a.org - 20); break; }
        if (hostileHere(g, a.n, nx)) break;
      }
    }
  }

  // ------------------------------------------------------------------ battles
  function sidePower(g, armies) {
    return armies.reduce((s, a) => s + a.div * g.nations[a.n].tech * (0.45 + a.org / 180) * (0.85 + g.nations[a.n].mil / 330), 0);
  }
  // All battles: provinces where armies of nations at war meet.
  function findBattles(g) {
    const byProv = new Map();
    for (const a of g.armies) { if (!byProv.has(a.p)) byProv.set(a.p, []); byProv.get(a.p).push(a); }
    const out = [];
    for (const [p, list] of byProv) {
      if (list.length < 2) continue;
      // split into two coalitions around the first hostile pair
      let A = null, B = null;
      for (const x of list) for (const y of list) if (!A && atWar(g, x.n, y.n)) { A = x.n; B = y.n; }
      if (A == null) continue;
      const side = n => (n === A || (allied(g, n, A) && !atWar(g, n, A)) || atWar(g, n, B) && !atWar(g, n, A)) ? 1 : (n === B || atWar(g, n, A)) ? 2 : 0;
      const s1 = list.filter(a => side(a.n) === 1), s2 = list.filter(a => side(a.n) === 2);
      if (!s1.length || !s2.length) continue;
      // the defender is whoever controls the province (or didn't move in)
      const ctrl = g.ctrl[p];
      const s1Defends = s1.some(a => a.n === ctrl || allied(g, a.n, ctrl)) || (!s2.some(a => a.n === ctrl) && s1.every(a => !a.moved));
      out.push({ p, attackers: s1Defends ? s2 : s1, defenders: s1Defends ? s1 : s2 });
    }
    return out;
  }
  function battleOdds(g, b) {
    const capital = g.nations.some(n => n.cap === b.p);
    const a = sidePower(g, b.attackers), d = sidePower(g, b.defenders) * 1.25 * (capital ? 1.15 : 1) * (b.defenders.every(x => !x.moved) ? 1.1 : 1);
    return { a, d, chance: a / (a + d) };
  }
  // Fast statistical resolution.
  function autoResolve(g, b) {
    const { chance } = battleOdds(g, b);
    const roll = chance + (rnd(g) - 0.5) * 0.16;
    const attackerWins = roll > 0.5;
    const lossA = 0.07 + 0.28 * (1 - chance), lossD = 0.07 + 0.28 * chance;
    return finishBattle(g, b, attackerWins, lossA, lossD, 'auto');
  }
  // Apply a result (from auto-resolve or a fought battle). lossX are fractions of strength lost.
  function finishBattle(g, b, attackerWins, lossA, lossD, how) {
    const totA = b.attackers.reduce((s, a) => s + a.div, 0), totD = b.defenders.reduce((s, a) => s + a.div, 0);
    for (const a of b.attackers) { a.div *= 1 - lossA; a.org = Math.max(10, a.org - (attackerWins ? 15 : 35)); a.path = attackerWins ? a.path : []; }
    for (const a of b.defenders) { a.div *= 1 - lossD; a.org = Math.max(10, a.org - (attackerWins ? 35 : 15)); }
    const losers = attackerWins ? b.defenders : b.attackers;
    const retreats = [];
    for (const a of losers) {
      const r = retreatTarget(g, a, b.p);
      if (r == null || a.div < 0.4) { a.div = 0; retreats.push([a, null]); } else { a.p = r; a.path = []; retreats.push([a, r]); }
    }
    g.armies = g.armies.filter(a => a.div > 0.05);
    const result = {
      p: b.p, attackerWins, how,
      att: [...new Set(b.attackers.map(a => a.n))], def: [...new Set(b.defenders.map(a => a.n))],
      lostA: +(totA * lossA).toFixed(1), lostD: +(totD * lossD).toFixed(1), destroyed: retreats.filter(r => r[1] == null).length
    };
    return result;
  }
  function retreatTarget(g, army, from) {
    if (!root.WorldData) return null;
    const data = root.WorldData;
    let best = null, bs = -Infinity;
    for (const x of neighbours(data, from)) {
      const c = g.ctrl[x];
      if (!(c === army.n || (c >= 0 && allied(g, army.n, c)))) continue;
      if (g.armies.some(a => a.p === x && atWar(g, army.n, a.n))) continue;
      const s = (c === army.n ? 2 : 1) + (g.owner[x] === army.n ? 1 : 0);
      if (s > bs) { bs = s; best = x; }
    }
    return best;
  }

  // Occupation and capitulation after battles.
  function occupy(data, g) {
    const events = [];
    for (const a of g.armies) {
      const c = g.ctrl[a.p];
      if (c >= 0 && c !== a.n && atWar(g, a.n, c) && !g.armies.some(b => b.p === a.p && (b.n === c || allied(g, b.n, c)) && !atWar(g, b.n, a.n))) {
        // liberate an ally's land, else take control ourselves
        const owner = g.owner[a.p];
        g.ctrl[a.p] = (owner === a.n || allied(g, a.n, owner)) ? owner : a.n;
        events.push({ p: a.p, by: g.ctrl[a.p], from: c });
      } else if (c < 0 && g.owner[a.p] < 0) {
        // unclaimed land: claim it
        g.owner[a.p] = a.n; g.ctrl[a.p] = a.n;
      }
    }
    return events;
  }
  function capitulations(data, g) {
    const out = [];
    g.nations.forEach((n, i) => {
      if (!n.alive || !n.wars.length) return;
      let total = 0, lost = 0;
      for (let p = 0; p < g.owner.length; p++) if (g.owner[p] === i) { total += data.provinces[p].a + 30; if (g.ctrl[p] !== i) lost += data.provinces[p].a + 30; }
      const capLost = g.ctrl[n.cap] !== i;
      const armyLeft = divisions(g, i);
      const enemyDiv = n.wars.reduce((s, w) => s + divisions(g, w), 0);
      const beaten = armyLeft < 0.35 * enemyDiv;
      if (total && ((capLost && lost / total > 0.5 && beaten) || lost / total > 0.85 || (armyLeft < 0.5 && lost / total > 0.2))) out.push(i);
    });
    for (const i of out) {
      const enemies = g.nations[i].wars.slice();
      const all = g.owner.every((o, p) => o !== i || (g.ctrl[p] !== i));
      for (let p = 0; p < g.owner.length; p++) {
        if (g.owner[p] === i && g.ctrl[p] !== i && g.ctrl[p] >= 0 && enemies.includes(g.ctrl[p])) transfer(g, data, p, g.ctrl[p]);
      }
      for (const e of enemies) makePeace(g, i, e);
      g.nations[i].stab = Math.max(10, g.nations[i].stab - 25);
      out.annexed = out.annexed || [];
      if (all) out.annexed.push(i);
    }
    checkAlive(g);
    return out;
  }

  // ------------------------------------------------------------------ AI military
  function aiMilitary(data, g) {
    g.nations.forEach((n, i) => {
      if (i === g.player || !n.alive) return;
      // recruit
      const wantMore = n.wars.length ? 1.6 : 1.0;
      const target = n.startDiv * wantMore * (0.6 + n.mil / 125);
      const have = divisions(g, i);
      if (have < target) {
        const cost = PERIODS[g.period].recruitCost;
        const can = Math.floor(Math.max(0, n.money - 10) / cost);
        const add = Math.min(can, Math.ceil((target - have) / 2), 10);
        if (add >= 1) recruit(data, g, i, add);
      }
    });
    // orders, nation by nation: hold the front first, then attack with what is left
    g.nations.forEach((n, i) => {
      if (i === g.player || !n.alive) return;
      const mine = g.armies.filter(a => a.n === i);
      if (!n.wars.length) { for (const a of mine) if (!a.path.length && g.ctrl[a.p] !== i && !allied(g, i, g.ctrl[a.p])) a.path = pathTo(data, g, i, a.p, p => g.ctrl[p] === i, 20) || []; return; }
      const bold = n.wars.some(w => (g.starter || {})[key(i, w)] === i);
      const enemyAt = p => g.armies.filter(e => e.p === p && atWar(g, i, e.n));
      const isEnemyLand = p => { const c = g.ctrl[p]; return c >= 0 && atWar(g, i, c); };
      // front provinces we hold, with the enemy power next to them
      const front = [];
      for (let p = 0; p < g.ctrl.length; p++) {
        if (g.ctrl[p] !== i) continue;
        let threat = 0, touches = false;
        for (const q of data.provinces[p].nb) {
          if (isEnemyLand(q)) touches = true;
          const e = enemyAt(q); if (e.length) { threat += sidePower(g, e); touches = true; }
        }
        if (touches) front.push({ p, threat: threat + (p === n.cap ? 2 : 0.5) });
      }
      front.sort((a, b) => b.threat - a.threat);
      const free = new Set(mine.filter(a => a.org > 25 || g.ctrl[a.p] === i));
      for (const a of mine) a.path = [];
      // 1. defence: put enough strength on each threatened front province (defenders fight at x1.25)
      for (const f of front) {
        let have = mine.filter(a => a.p === f.p).reduce((s, a) => s + sidePower(g, [a]), 0);
        for (const a of mine) if (a.p === f.p) free.delete(a);
        const need = f.threat / 1.25 * (bold ? 0.7 : 1);
        while (have < need && free.size) {
          let best = null, bd = 99;
          for (const a of free) { const d = dist(data, a.p, f.p); if (d < bd) { bd = d; best = a; } }
          if (!best || bd > 5) break;
          free.delete(best);
          const pth = pathTo(data, g, i, best.p, p => p === f.p, 8);
          if (pth) { best.path = pth; have += sidePower(g, [best]); }
        }
        // surplus on a quiet sector is released for the attack
        const here = mine.filter(a => a.p === f.p);
        if (here.length && have > need * 1.6 + 2 && bold) {
          const big = here.sort((a, b) => b.div - a.div)[0];
          const keep = Math.max(0.3, need * 1.2 / sidePower(g, [big]));
          if (keep < 0.8 && big.div > 1.5) { const split = addArmy(g, i, f.p, big.div * (1 - keep)); split.org = big.org; big.div *= keep; free.add(split); }
        }
      }
      // 2. attack with free armies
      const odds0 = bold ? 1.1 : 1.6;
      for (const a of free) {
        if (a.path.length) continue;
        const myPower = sidePower(g, [a]);
        let best = null, bs = -Infinity;
        for (const [p, path] of reachable(data, g, a)) {
          if (!path.length || (!isEnemyLand(p) && !enemyAt(p).length)) continue;
          const ep = sidePower(g, enemyAt(p)) * 1.25;
          const friends = mine.filter(f => f !== a && f.path.length && f.path[f.path.length - 1] === p);
          const odds = (myPower + sidePower(g, friends)) / (ep + 0.01);
          if (ep > 0 && odds < odds0) continue;
          const isCap = g.nations.some(nn => nn.cap === p);
          const sc = (isCap ? 8 : 0) + data.provinces[p].a / 300 + Math.min(odds, 3) - path.length * 0.5 + (ep > 0 ? 1 : 2) - (path.sea ? 2 : 0);
          if (sc > bs) { bs = sc; best = path; }
        }
        if (best) { a.path = best; continue; }
        if (!bold && front.length) { // defenders move up to the front and wait
          const f = front[0]; if (a.p !== f.p) a.path = pathTo(data, g, i, a.p, p => p === f.p, 10) || [];
          continue;
        }
        const pth = pathTo(data, g, i, a.p, isEnemyLand, 25);
        if (pth) { a.path = pth; continue; }
        // no land route: ship troops from a port to the weakest enemy coast
        if (n.great || n.tech >= 1) {
          if (!isPort(data, g, i, a.p)) { a.path = pathTo(data, g, i, a.p, p => isPort(data, g, i, p), 12) || []; continue; }
          let target = null, ts = -Infinity;
          for (const p of seaTargets(data, g, i, a.p)) {
            if (!isEnemyLand(p)) continue;
            const sc = -sidePower(g, enemyAt(p)) * 2 + data.provinces[p].a / 200 - Math.hypot(data.provinces[p].x - data.provinces[a.p].x, data.provinces[p].y - data.provinces[a.p].y) / 200;
            if (sc > ts) { ts = sc; target = p; }
          }
          if (target != null) a.path = [target];
        }
      }
    });
  }
  function dist(data, a, b) {
    if (a === b) return 0;
    const seen = new Set([a]); let frontier = [a];
    for (let d = 1; d <= 6; d++) {
      const nxt = [];
      for (const p of frontier) for (const x of neighbours(data, p)) { if (x === b) return d; if (!seen.has(x)) { seen.add(x); nxt.push(x); } }
      frontier = nxt;
    }
    return 99;
  }

  // ------------------------------------------------------------------ turn
  // Phase 1: move everything and find battles. The UI resolves battles, then calls endTurnFinish.
  function endTurnMove(data, g) {
    for (const a of g.armies) a.moved = false;
    aiMilitary(data, g);
    moveArmies(data, g, a => a.n === g.player);
    moveArmies(data, g, a => a.n !== g.player);
    return findBattles(g);
  }
  function endTurnFinish(data, g) {
    const occ = occupy(data, g);
    const caps = capitulations(data, g);
    mergeArmies(g);
    // economy and recovery
    g.nations.forEach((n, i) => {
      if (!n.alive) return;
      n.money += income(data, g, i) - upkeep(g, i);
      if (n.money < 0) { n.stab = Math.max(5, n.stab - 3); n.money = 0; }
      if (n.wars.length) n.stab = Math.max(5, n.stab - 0.5); else n.stab = Math.min(90, n.stab + 0.5);
    });
    for (const a of g.armies) {
      const home = g.ctrl[a.p] === a.n || allied(g, a.n, g.ctrl[a.p]);
      a.org = Math.min(100, a.org + (home ? 20 : 8));
    }
    // calendar
    g.month++; if (g.month > 12) { g.month = 1; g.year++; }
    g.turn++;
    return { occ, caps };
  }

  function dateLabel(g) { return `${MONTHS[g.month - 1]} ${g.year}`; }

  // ------------------------------------------------------------------ applying AI changes
  function findNation(g, name) {
    if (!name) return -1;
    const n = String(name).trim().toLowerCase();
    let i = g.nations.findIndex(x => x.name.toLowerCase() === n && x.alive);
    if (i < 0) i = g.nations.findIndex(x => x.name.toLowerCase() === n);
    if (i < 0) i = g.nations.findIndex(x => x.alive && (x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase())) && n.length > 3);
    return i;
  }
  function findProvince(data, name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return -1;
    let i = data.provinces.findIndex(p => p.n.toLowerCase() === n);
    if (i < 0) i = data.provinces.findIndex(p => p.n.toLowerCase().startsWith(n) || n.startsWith(p.n.toLowerCase()));
    return i;
  }
  function applyChange(data, g, ch) {
    const a = findNation(g, ch.a), b = findNation(g, ch.b), v = Number(ch.value) || 0;
    const provs = (ch.provinces || []).map(x => findProvince(data, x)).filter(x => x >= 0);
    switch (ch.kind) {
      case 'declare_war': if (a >= 0 && b >= 0 && a !== b) { declareWar(g, a, b); return `${g.nations[a].name} declares war on ${g.nations[b].name}`; } break;
      case 'make_peace': if (a >= 0 && b >= 0 && atWar(g, a, b)) { makePeace(g, a, b); for (const p of provs) if (g.owner[p] === b) transfer(g, data, p, a); return `Peace between ${g.nations[a].name} and ${g.nations[b].name}`; } break;
      case 'alliance': if (a >= 0 && b >= 0 && a !== b && !atWar(g, a, b)) { ally(g, a, b); return `${g.nations[a].name} and ${g.nations[b].name} form an alliance`; } break;
      case 'end_alliance': if (a >= 0 && b >= 0) { unally(g, a, b); addRel(g, a, b, -15); addRel(g, b, a, -15); return `Alliance between ${g.nations[a].name} and ${g.nations[b].name} ends`; } break;
      case 'transfer_provinces': if (a >= 0 && b >= 0) { let k = 0; for (const p of provs) if (g.owner[p] === b) { transfer(g, data, p, a); k++; } if (k) return `${k} province(s) pass from ${g.nations[b].name} to ${g.nations[a].name}`; } break;
      case 'annex': if (a >= 0 && b >= 0 && a !== b) { for (let p = 0; p < g.owner.length; p++) if (g.owner[p] === b) transfer(g, data, p, a); return `${g.nations[a].name} annexes ${g.nations[b].name}`; } break;
      case 'relation': if (a >= 0 && b >= 0) { addRel(g, a, b, Math.max(-40, Math.min(40, v))); return null; } break;
      case 'stat': if (a >= 0) { const f = { economy: 'eco', military: 'mil', stability: 'stab' }[String(ch.text).toLowerCase()]; if (f) { const N = g.nations[a]; N[f] = Math.max(1, Math.min(f === 'eco' ? 250 : 100, N[f] + Math.max(-15, Math.min(15, v)))); } return null; } break;
      case 'leader': if (a >= 0 && ch.text) { g.nations[a].leader = String(ch.text).slice(0, 80); return `New leader in ${g.nations[a].name}: ${g.nations[a].leader}`; } break;
      case 'government': if (a >= 0 && ch.text) { g.nations[a].gov = String(ch.text).slice(0, 60); return `${g.nations[a].name} becomes: ${g.nations[a].gov}`; } break;
      case 'rename': if (a >= 0 && ch.text && !g.nations.some(x => x.name === ch.text)) { const old = g.nations[a].name; g.nations[a].name = String(ch.text).slice(0, 40); return `${old} is now called ${g.nations[a].name}`; } break;
      case 'independence': if (b >= 0 && ch.a && provs.length) {
        let i = findNation(g, ch.a);
        if (i < 0 || g.nations[i].alive) { if (i >= 0 && g.nations[i].alive && i !== b) { /* existing nation: treat as transfer */ } else {
          g.nations.push({ name: String(ch.a).slice(0, 40), color: hashColor(ch.a), cap: provs[0], great: false, tech: g.nations[b].tech * 0.9, eco: 25, stab: 50, mil: 50, gov: 'Provisional government', leader: '', money: 20, alive: true, rel: {}, allies: [], wars: [], startDiv: 2 });
          i = g.nations.length - 1;
        } }
        if (i < 0) break;
        g.nations[i].alive = true;
        for (const p of provs) if (g.owner[p] === b) transfer(g, data, p, i);
        g.nations[i].cap = provs.find(p => g.owner[p] === i) ?? provs[0];
        if (g.owner.some(o => o === i)) { addArmy(g, i, g.nations[i].cap, Math.max(1, provs.length)); setRel(g, b, i, -50); return `${g.nations[i].name} declares independence from ${g.nations[b].name}`; }
      } break;
      case 'recruit': if (a >= 0 && a !== g.player) { const d = Math.max(1, Math.min(20, Math.round(v))); addArmy(g, a, g.nations[a].cap, d).org = 60; mergeArmies(g); return null; } break;
    }
    return null;
  }

  // ------------------------------------------------------------------ save
  function serialize(g) { return JSON.stringify(g); }
  function deserialize(s) { return JSON.parse(s); }

  root.World = {
    PERIODS, MONTHS, decodeGrid, newGame, dateLabel, rel, setRel, addRel, atWar, allied, ally, unally, declareWar, makePeace, setWar,
    transfer, provincesOf, income, upkeep, divisions, recruit, reachable, canEnter, moveArmies, findBattles, battleOdds, autoResolve,
    finishBattle, endTurnMove, endTurnFinish, applyChange, findNation, findProvince, neighbours, borderProvinces, sidePower,
    serialize, deserialize, hashColor, seaTargets, isPort, checkAlive, mergeArmies, addArmy, pathTo, dist
  };
})(typeof window !== 'undefined' ? window : globalThis);
