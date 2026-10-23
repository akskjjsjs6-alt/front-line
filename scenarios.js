/* Scenarios. Positions are fractions of the map (u = left→right, v = top→bottom).
   Side 1 and side 2; `attacker` must capture `target` victory points of the defender's starting cities.
   Capturing an enemy capital ('cap') wins at once. */
(function (root) {
  // terrain codes
  const WATER = 0, CLEAR = 1, FOREST = 2, HILLS = 3, MOUNTAIN = 4, MARSH = 5, DESERT = 6;
  const ell = (u, v, cu, cv, ru, rv) => ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2 < 1;
  const zone = (u, v, u0, u1, v0, v1) => u >= u0 && u <= u1 && v >= v0 && v <= v1;
  const near = (u, v, cu, cv, r) => ((u - cu) * 1.6) ** 2 + (v - cv) ** 2 < r * r;
  // distance from (u,v) to a polyline, in map-height units
  function polyDist(u, v, line) {
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const ax = line[i][0] * 1.6, ay = line[i][1], bx = line[i + 1][0] * 1.6, by = line[i + 1][1], px = u * 1.6, py = v;
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t));
    }
    return best;
  }

  // ---------- 1900 ----------
  const BOER_RIVERS = [
    [[0, 0.69], [0.2, 0.7], [0.4, 0.73], [0.58, 0.75], [0.7, 0.7]],      // Orange
    [[0.18, 0.6], [0.3, 0.6], [0.42, 0.55], [0.5, 0.5]],                 // Modder
    [[0.15, 0.26], [0.35, 0.22], [0.5, 0.2], [0.72, 0.24]],              // Vaal
    [[0.7, 0.46], [0.82, 0.5], [0.92, 0.52], [1, 0.58]]                  // Tugela
  ];
  const boerOwner = (u, v) => {
    if (near(u, v, 0.3, 0.58, 0.06) || near(u, v, 0.78, 0.42, 0.05) || near(u, v, 0.12, 0.12, 0.05)) return 1; // besieged towns
    if (u > 0.74 && v > 0.48) return 1;                                                                        // Natal
    return v < 0.66 ? 2 : 1;
  };

  // ---------- 1939 ----------
  const POL_RIVERS = [
    [[0.45, 1], [0.55, 0.75], [0.62, 0.46], [0.55, 0.3], [0.42, 0.2], [0.43, 0.05]],   // Vistula
    [[0.95, 0.82], [0.88, 0.5], [0.76, 0.36], [0.6, 0.36]],                           // Bug
    [[0.42, 0.72], [0.32, 0.46], [0.2, 0.41], [0, 0.4]],                              // Warta
    [[0.86, 0.22], [0.72, 0.28], [0.6, 0.35]]                                         // Narew
  ];
  const polOwner = (u, v) => {
    if (u < (v < 0.36 ? 0.26 : v < 0.62 ? 0.2 : 0.31) + 0.015 * Math.sin(v * 20)) return 1;   // Germany
    if (v < 0.17 && u > 0.47) return 1;                        // East Prussia
    if (v > 0.91 && u > 0.38 && u < 0.8) return 1;             // Slovakia (German ally)
    return 2;
  };

  // ---------- 2003 ----------
  const EUPHRATES = [[0.18, 0.12], [0.35, 0.3], [0.45, 0.5], [0.58, 0.62], [0.75, 0.7], [0.86, 0.73]];
  const TIGRIS = [[0.48, 0], [0.5, 0.12], [0.66, 0.35], [0.8, 0.48], [0.84, 0.66], [0.87, 0.74]];
  const iraqOwner = (u, v) => (v < (u > 0.86 ? 0.88 : 0.86) ? 2 : 1);

  const SCENARIOS = [
    {
      id: 'boer', year: 1900, title: 'Road to Pretoria', tag: 'Second Boer War',
      startDate: '1900-02-11T06:00', hoursPerSec: 4, duration: 620,
      blurb: 'Lord Roberts\' army gathers on the Orange River. Kimberley, Ladysmith and Mafeking are under siege. Break the Boer lines, relieve the towns and march on Pretoria. The Boers are few, but they are mounted, sharp-shooting and hard to pin down.',
      seed: 3, attacker: 1, target: 7,
      sides: {
        1: { name: 'British Empire', long: 'Field Force under Lord Roberts', qual: 0.9, airRate: 0, airMax: 0, home: 'S' },
        2: { name: 'Boer Republics', long: 'Transvaal & Orange Free State commandos', qual: 1.3, airRate: 0, airMax: 0, home: 'N' }
      },
      buy: ['inf', 'recon', 'art'],
      names: { recon: 'Cavalry / Mounted Rifles', art: 'Field Artillery', inf: 'Infantry' },
      owner: boerOwner,
      terrain(u, v, N) {
        const n = N(u, v, 0.08, 1), m = N(u, v, 0.13, 2);
        if (zone(u, v, 0.66, 0.8, 0.3, 0.85) && m > 0.45) return m > 0.62 ? MOUNTAIN : HILLS;   // Drakensberg
        if (u > 0.8 && v > 0.45 && n > 0.5) return FOREST;                                     // Natal bush
        if (m > 0.72) return HILLS;                                                            // kopjes
        if (v > 0.76 && u < 0.6 && n < 0.55) return DESERT;                                     // Karoo
        if (n > 0.74) return FOREST;
        return CLEAR;
      },
      rivers: BOER_RIVERS,
      cities: [
        ['Pretoria', 0.62, 0.06, 3, 'cap'], ['Johannesburg', 0.58, 0.13, 3, 'sup'], ['Bloemfontein', 0.45, 0.5, 3, 'sup'], ['Kroonstad', 0.5, 0.32, 1],
        ['Winburg', 0.52, 0.42, 1], ['Bethlehem', 0.62, 0.38, 1], ['Harrismith', 0.7, 0.4, 1], ['Klerksdorp', 0.4, 0.17, 1], ['Standerton', 0.74, 0.2, 1],
        ['Vryheid', 0.88, 0.28, 1],
        ['Kimberley', 0.3, 0.58, 2, 'sup'], ['Ladysmith', 0.78, 0.42, 2, 'sup'], ['Mafeking', 0.12, 0.12, 1, 'sup'],
        ['De Aar', 0.34, 0.93, 2, 'cap'], ['Orange River Stn', 0.28, 0.75, 1], ['Colesberg', 0.46, 0.8, 1], ['Stormberg', 0.6, 0.86, 1],
        ['Pietermaritzburg', 0.86, 0.74, 2, 'sup'], ['Durban', 0.95, 0.9, 2, 'sup']
      ],
      units: [
        [1, 'inf', 'XX', '1st Div (Methuen)', 0.26, 0.71], [1, 'inf', 'XX', '6th Div (Kelly-Kenny)', 0.37, 0.72], [1, 'inf', 'XX', '7th Div (Tucker)', 0.44, 0.74],
        [1, 'inf', 'XX', '9th Div (Colvile)', 0.32, 0.76], [1, 'recon', 'XX', 'Cavalry Div (French)', 0.36, 0.78], [1, 'recon', 'X', 'Mounted Infantry Bde', 0.48, 0.77],
        [1, 'art', 'X', 'Royal Artillery', 0.34, 0.82], [1, 'hq', 'XXX', 'Roberts\' HQ', 0.36, 0.86], [1, 'inf', 'X', '3rd Div (Gatacre)', 0.6, 0.83],
        [1, 'inf', 'XX', '2nd Div (Clery)', 0.8, 0.56], [1, 'inf', 'XX', '5th Div (Warren)', 0.87, 0.58], [1, 'recon', 'X', 'Natal Carbineers', 0.76, 0.6],
        [1, 'art', 'X', 'Naval Guns', 0.84, 0.63],
        [1, 'inf', 'X', 'Kimberley Garrison', 0.3, 0.58, 1], [1, 'inf', 'XX', 'Ladysmith Garrison', 0.78, 0.42, 1], [1, 'inf', 'II', 'Mafeking Garrison', 0.12, 0.12, 1],
        [2, 'inf', 'X', 'Cronjé\'s Laager', 0.28, 0.63, 1], [2, 'recon', 'X', 'Kimberley Siege Cmdo', 0.35, 0.55], [2, 'recon', 'X', 'De Wet\'s Commando', 0.45, 0.6],
        [2, 'recon', 'X', 'Free State Cmdo', 0.52, 0.63], [2, 'recon', 'X', 'Transvaal Cmdo', 0.4, 0.63],
        [2, 'inf', 'X', 'Botha at Colenso', 0.8, 0.46, 1], [2, 'recon', 'X', 'Ladysmith Siege Cmdo', 0.73, 0.43], [2, 'recon', 'X', 'Natal Cmdo', 0.84, 0.4],
        [2, 'art', 'II', 'Staatsartillerie', 0.74, 0.36], [2, 'art', 'II', 'Free State Artillery', 0.37, 0.52], [2, 'recon', 'II', 'Mafeking Siege Cmdo', 0.16, 0.16],
        [2, 'hq', 'XX', 'Kommandant-General', 0.55, 0.26], [2, 'inf', 'X', 'ZARP Police', 0.58, 0.14]
      ],
      reinf: [
        [120, 1, 'inf', 'XX', '8th Div (Rundle)', 0.4, 0.98],
        [200, 2, 'recon', 'X', 'Foreign Volunteers', 0.5, 0.03],
        [240, 1, 'recon', 'X', 'Imperial Yeomanry', 0.3, 0.98],
        [360, 1, 'inf', 'XX', '10th Div (Hunter)', 0.9, 0.95]
      ]
    },
    {
      id: 'poland', year: 1939, title: 'Fall Weiss', tag: 'Invasion of Poland',
      startDate: '1939-09-01T04:45', hoursPerSec: 1, duration: 620,
      blurb: 'Germany strikes Poland from three sides: Pomerania, East Prussia and Silesia, with Slovakia in the south. Panzers and Stukas against a brave army spread thin along a huge border. Can Poland hold Warsaw?',
      seed: 11, attacker: 1, target: 10,
      sides: {
        1: { name: 'Germany', long: 'Heeresgruppe Nord & Süd', qual: 1.2, airRate: 1 / 14, airMax: 6, home: 'W' },
        2: { name: 'Poland', long: 'Polish Army (Wojsko Polskie)', qual: 0.85, airRate: 1 / 60, airMax: 2, home: 'E' }
      },
      buy: ['inf', 'mech', 'armor', 'recon', 'art', 'ad'],
      names: { recon: 'Cavalry', mech: 'Motorized Infantry', armor: 'Panzer / Tanks', ad: 'Flak / AA' },
      owner: polOwner,
      terrain(u, v, N) {
        if (v < 0.045 + 0.02 * Math.sin(u * 11)) return WATER;
        if (ell(u, v, 0.45, 0.07, 0.05, 0.035)) return WATER;
        const n = N(u, v, 0.08, 3), m = N(u, v, 0.14, 4);
        if (v > 0.9 && m > 0.38) return m > 0.6 ? MOUNTAIN : HILLS;        // Carpathians / Tatra
        if (u > 0.82 && v > 0.38 && v < 0.75 && m > 0.45) return MARSH;     // Polesie
        if (zone(u, v, 0.5, 0.8, 0.12, 0.3) && m > 0.6) return MARSH;      // Masurian lakes edge
        if (n > 0.6) return FOREST;
        if (m > 0.8) return HILLS;
        return CLEAR;
      },
      rivers: POL_RIVERS,
      cities: [
        ['Breslau', 0.13, 0.68, 2, 'cap'], ['Stettin', 0.06, 0.15, 1, 'sup'], ['Königsberg', 0.66, 0.07, 2, 'sup'], ['Danzig', 0.5, 0.11, 1], ['Poprad', 0.55, 0.96, 1, 'sup'],
        ['Warsaw', 0.62, 0.42, 4, 'cap'], ['Łódź', 0.48, 0.55, 2], ['Kraków', 0.45, 0.86, 2, 'sup'], ['Poznań', 0.28, 0.4, 2], ['Bydgoszcz', 0.35, 0.22, 1],
        ['Gdynia', 0.41, 0.08, 1], ['Toruń', 0.41, 0.26, 1], ['Modlin', 0.57, 0.36, 1], ['Radom', 0.63, 0.61, 1], ['Lublin', 0.8, 0.6, 2, 'sup'],
        ['Lwów', 0.9, 0.86, 2, 'sup'], ['Brest', 0.92, 0.38, 1], ['Białystok', 0.86, 0.25, 1], ['Częstochowa', 0.42, 0.7, 1], ['Katowice', 0.34, 0.8, 1]
      ],
      units: [
        [1, 'mech', 'XX', '2nd Motorized Div', 0.22, 0.15], [1, 'armor', 'XX', '3rd Panzer Div', 0.24, 0.23], [1, 'inf', 'XX', 'II Corps', 0.2, 0.3],
        [1, 'inf', 'XX', 'I Corps', 0.56, 0.14], [1, 'inf', 'XX', 'XXI Corps', 0.72, 0.13], [1, 'armor', 'XX', 'Panzer Div Kempf', 0.62, 0.15], [1, 'recon', 'X', '1st Cavalry Bde', 0.82, 0.14],
        [1, 'inf', 'XX', 'X Corps', 0.15, 0.52], [1, 'inf', 'XX', 'XIII Corps', 0.15, 0.6],
        [1, 'armor', 'XX', '1st Panzer Div', 0.18, 0.72], [1, 'armor', 'XX', '4th Panzer Div', 0.18, 0.65], [1, 'mech', 'XX', '13th Motorized Div', 0.2, 0.78],
        [1, 'armor', 'XX', '1st Light Div', 0.25, 0.83], [1, 'inf', 'XX', 'VIII Corps', 0.28, 0.88],
        [1, 'armor', 'XX', '2nd Panzer Div', 0.46, 0.95], [1, 'mech', 'XX', '4th Light Div', 0.56, 0.94],
        [1, 'art', 'X', 'Heavy Artillery', 0.1, 0.62], [1, 'art', 'X', 'Corps Artillery', 0.12, 0.3], [1, 'ad', 'X', 'Flak Regt', 0.09, 0.7], [1, 'hq', 'XXX', 'OKH HQ', 0.07, 0.56],
        [2, 'inf', 'XX', 'Armia Pomorze 9 DP', 0.35, 0.2], [2, 'inf', 'XX', 'Armia Pomorze 15 DP', 0.4, 0.3],
        [2, 'inf', 'XX', 'Armia Poznań 14 DP', 0.27, 0.37], [2, 'inf', 'XX', 'Armia Poznań 25 DP', 0.3, 0.47], [2, 'recon', 'X', 'Wielkopolska Cav Bde', 0.23, 0.43],
        [2, 'inf', 'XX', 'Armia Łódź 10 DP', 0.37, 0.56], [2, 'inf', 'XX', 'Armia Łódź 28 DP', 0.4, 0.63], [2, 'recon', 'X', 'Wołyńska Cav Bde', 0.36, 0.67],
        [2, 'inf', 'XX', 'Armia Kraków 7 DP', 0.37, 0.77], [2, 'inf', 'XX', 'Armia Kraków 6 DP', 0.4, 0.84], [2, 'mech', 'X', '10th Motorized Cav Bde', 0.47, 0.82],
        [2, 'inf', 'XX', 'Armia Modlin 8 DP', 0.58, 0.24], [2, 'inf', 'XX', 'Armia Modlin 20 DP', 0.66, 0.22], [2, 'recon', 'X', 'Mazowiecka Cav Bde', 0.52, 0.22],
        [2, 'inf', 'XX', 'Armia Prusy 13 DP', 0.58, 0.55], [2, 'inf', 'XX', 'Armia Prusy 19 DP', 0.55, 0.61], [2, 'armor', 'II', '1st Tank Bn (7TP)', 0.61, 0.5],
        [2, 'recon', 'X', 'Podlaska Cav Bde', 0.82, 0.24], [2, 'inf', 'X', 'Warsaw Garrison', 0.62, 0.42], [2, 'art', 'X', 'Artillery Reserve', 0.6, 0.46],
        [2, 'ad', 'II', 'Warsaw AA', 0.64, 0.4], [2, 'hq', 'XXX', 'Naczelny Wódz HQ', 0.66, 0.44]
      ],
      reinf: [
        [120, 1, 'armor', 'XX', '5th Panzer Div', 0.04, 0.6],
        [150, 2, 'inf', 'XX', 'Armia Odwodowa', 0.75, 0.5],
        [260, 1, 'mech', 'XX', '20th Motorized Div', 0.04, 0.3],
        [300, 2, 'inf', 'XX', 'Armia Lublin', 0.85, 0.7]
      ]
    },
    {
      id: 'iraq', year: 2003, title: 'Thunder Run', tag: 'Invasion of Iraq',
      startDate: '2003-03-20T05:30', hoursPerSec: 1, duration: 580,
      blurb: 'The Coalition crosses the Kuwait border and races 500 km to Baghdad. Fedayeen hold the river towns, the Republican Guard waits at the Karbala Gap. Speed is everything: take Baghdad and the war is won.',
      seed: 23, attacker: 1, target: 12,
      sides: {
        1: { name: 'Coalition', long: 'US V Corps, I MEF & UK 1st Armoured Div', qual: 1.4, airRate: 1 / 12, airMax: 7, home: 'S' },
        2: { name: 'Iraq', long: 'Iraqi Army, Republican Guard & Fedayeen', qual: 0.72, airRate: 0, airMax: 0, home: 'N' }
      },
      buy: ['inf', 'mech', 'armor', 'recon', 'art', 'mlrs', 'ad', 'heli', 'uas'],
      owner: iraqOwner,
      terrain(u, v, N) {
        if (u > 0.9 && v > 0.8 + (u - 0.9)) return WATER;
        const n = N(u, v, 0.09, 5), m = N(u, v, 0.15, 6);
        const dr = Math.min(polyDist(u, v, EUPHRATES), polyDist(u, v, TIGRIS));
        if (zone(u, v, 0.6, 0.84, 0.52, 0.7) && dr > 0.03 && m > 0.35) return MARSH;   // Mesopotamian marshes
        if (dr < 0.035) return n > 0.62 ? FOREST : CLEAR;                              // palm groves & farmland
        if (dr < 0.07 && n > 0.5) return CLEAR;
        if (m > 0.82) return HILLS;
        return DESERT;
      },
      rivers: [EUPHRATES, TIGRIS],
      cities: [
        ['Baghdad', 0.5, 0.12, 5, 'cap'], ['Basra', 0.83, 0.72, 3, 'sup'], ['Nasiriyah', 0.58, 0.6, 2], ['Samawah', 0.45, 0.51, 1],
        ['Najaf', 0.32, 0.4, 2], ['Karbala', 0.32, 0.27, 2], ['Hillah', 0.42, 0.27, 1], ['Kut', 0.66, 0.35, 1], ['Diwaniyah', 0.47, 0.39, 1],
        ['Amarah', 0.8, 0.48, 1], ['Umm Qasr', 0.89, 0.84, 1], ['Fallujah', 0.4, 0.1, 1], ['Baqubah', 0.58, 0.04, 1, 'sup'],
        ['Kuwait City', 0.86, 0.96, 3, 'cap'], ['Camp Udairi', 0.6, 0.93, 1, 'sup'], ['Ali Al Salem', 0.74, 0.95, 1, 'sup']
      ],
      units: [
        [1, 'mech', 'XX', '3rd Inf Div (M)', 0.42, 0.9], [1, 'recon', 'III', '3-7 Cavalry', 0.37, 0.88], [1, 'heli', 'XX', '101st Abn (AASLT)', 0.35, 0.95],
        [1, 'inf', 'X', '82nd Abn 2nd BCT', 0.3, 0.93], [1, 'heli', 'X', '11th Attack Helo Rgt', 0.46, 0.96], [1, 'mlrs', 'II', 'MLRS Bn', 0.49, 0.92],
        [1, 'art', 'X', 'V Corps Artillery', 0.4, 0.94], [1, 'ad', 'II', 'Patriot Bn', 0.62, 0.96], [1, 'hq', 'XXX', 'V Corps HQ', 0.52, 0.96],
        [1, 'uas', 'II', 'Predator Flight', 0.56, 0.93],
        [1, 'mech', 'XX', '1st Marine Div', 0.7, 0.9], [1, 'mech', 'X', 'Task Force Tarawa', 0.63, 0.89], [1, 'heli', 'X', '3rd MAW Cobras', 0.7, 0.95],
        [1, 'armor', 'XX', '1st (UK) Armd Div', 0.81, 0.9], [1, 'inf', 'X', '3 Commando Bde', 0.88, 0.9],
        [2, 'inf', 'XX', '11th Inf Div', 0.58, 0.6, 1], [2, 'mech', 'XX', '51st Mech Div', 0.8, 0.75, 1], [2, 'armor', 'XX', '6th Armd Div', 0.82, 0.67],
        [2, 'armor', 'XX', '10th Armd Div', 0.78, 0.5], [2, 'inf', 'XX', '14th Inf Div', 0.86, 0.8, 1],
        [2, 'armor', 'XX', 'RG Medina', 0.36, 0.22], [2, 'armor', 'XX', 'RG Hammurabi', 0.44, 0.06], [2, 'mech', 'XX', 'RG Nebuchadnezzar', 0.48, 0.24],
        [2, 'armor', 'XX', 'RG Baghdad Div', 0.63, 0.31], [2, 'inf', 'XX', 'RG Al Nida', 0.55, 0.13, 1], [2, 'inf', 'X', 'Special Republican Guard', 0.5, 0.12, 1],
        [2, 'inf', 'X', 'Fedayeen Samawah', 0.45, 0.51, 1], [2, 'inf', 'X', 'Fedayeen Najaf', 0.32, 0.4, 1], [2, 'inf', 'X', 'Fedayeen Diwaniyah', 0.47, 0.39, 1],
        [2, 'art', 'X', 'RG Artillery', 0.4, 0.2], [2, 'art', 'X', 'Corps Artillery', 0.65, 0.39], [2, 'ad', 'X', 'Baghdad SAM Belt', 0.5, 0.16],
        [2, 'hq', 'XXX', 'RG Command', 0.51, 0.09]
      ],
      reinf: [
        [140, 1, 'mech', 'XX', '4th Inf Div (M)', 0.5, 0.99],
        [220, 2, 'inf', 'XX', 'RG Adnan', 0.52, 0.01],
        [300, 1, 'armor', 'X', '2nd Armored Cav Rgt', 0.6, 0.99]
      ]
    }
  ];

  root.SCENARIOS = SCENARIOS;
  root.TERRAIN_CODES = { WATER, CLEAR, FOREST, HILLS, MOUNTAIN, MARSH, DESERT };
})(typeof window !== 'undefined' ? window : globalThis);
