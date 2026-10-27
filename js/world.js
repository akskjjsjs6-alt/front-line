/* Imperium world simulation: nations, provinces, armies, wars, in real time. No DOM. */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ periods
  // India's princely states: under British paramountcy, so allied to Britain from the start
  const PRINCELY = ['Hyderabad', 'Mysore', 'Travancore', 'Cochin', 'Jammu and Kashmir', 'Jodhpur', 'Bikaner', 'Jaisalmer', 'Jaipur',
    'Udaipur', 'Rajputana States', 'Gwalior', 'Indore', 'Bhopal', 'Rewa', 'Bundelkhand States', 'Baroda', 'Kathiawar States', 'Kutch',
    'Patiala', 'Punjab Hill States', 'Bahawalpur', 'Khairpur', 'Kalat', 'Bastar', 'Chhattisgarh States', 'Orissa States',
    'Swat, Dir & Chitral', 'Shan States', 'Sikkim', 'Manipur', 'Tripura'];
  const RAJ = PRINCELY.map(n => ['United Kingdom', n]);
  const PERIODS = {
    '1900': {
      id: '1900', file: 'data/world-1900.json?v=8', start: [1900, 1], title: 'The Age of Empires', speed: 14, recruitCost: 6,
      blurb: 'Queen Victoria still reigns. Europe\'s empires cover the globe, the Boer War rages and China simmers. Fourteen years of peace remain, unless someone breaks it sooner.',
      units: { inf: 0.7, recon: 0.2, art: 0.1 },
      wars: [['United Kingdom', 'Transvaal'], ['United Kingdom', 'Orange Free State']],
      alliances: [...RAJ, ['France', 'Russia'], ['Germany', 'Austria-Hungary'], ['Germany', 'Italy'], ['Austria-Hungary', 'Italy'], ['Transvaal', 'Orange Free State']],
      hostile: [['France', 'Germany', -45], ['Russia', 'Japan', -40], ['United Kingdom', 'Russia', -25], ['Austria-Hungary', 'Serbia', -30], ['Russia', 'Ottoman Empire', -35], ['United Kingdom', 'France', -15],
        ['Al Saud', 'Jabal Shammar', -70], ['Ottoman Empire', 'Jabal Shammar', 30], ['Kuwait', 'Jabal Shammar', -50], ['Kuwait', 'Al Saud', 40],
        ['United Kingdom', 'Kuwait', 40], ['Ottoman Empire', 'Kuwait', -20]]
    },
    '1939': {
      id: '1939', file: 'data/world-1939.json?v=7', start: [1939, 3], title: 'The Gathering Storm', speed: 22, recruitCost: 8,
      blurb: 'Germany has swallowed Austria and eyes Poland. Japan is at war in China. Britain and France promise to defend Poland. The world holds its breath.',
      units: { inf: 0.55, mech: 0.15, armor: 0.12, recon: 0.06, art: 0.1, ad: 0.02 },
      wars: [['Japan', 'China']],
      alliances: [...RAJ, ['Germany', 'Italy'], ['Germany', 'Japan'], ['Germany', 'Slovakia'], ['United Kingdom', 'France'], ['France', 'Poland'], ['United Kingdom', 'Poland'], ['USSR', 'Mongolia'], ['USSR', 'Tuva']],
      hostile: [['Germany', 'Poland', -50], ['Germany', 'France', -40], ['Germany', 'United Kingdom', -25], ['USSR', 'Germany', -35], ['Japan', 'USSR', -45], ['Japan', 'United States', -30], ['Italy', 'France', -25], ['Hungary', 'Romania', -35]]
    },
    '2003': {
      id: '2003', file: 'data/world-2003.json?v=7', start: [2003, 1], title: 'The New Century', speed: 32, recruitCost: 14,
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
      'Jabal Shammar': [4, 0.5, 15, 'Emirate (Ottoman-aligned)', 'Emir Abdulaziz bin Mutaib Al Rashid'],
      'Al Saud': [2, 0.5, 8, 'Emirate (in exile in Kuwait)', 'Imam Abdul Rahman bin Faisal (Ibn Saud)'],
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
      'Switzerland': [4, 0.95, 65, 'Federal republic', 'Federal Council'],
      'Hyderabad': [4, 0.7, 30, 'Princely state (British paramountcy)', 'Nizam Mir Mahbub Ali Khan'],
      'Mysore': [2, 0.75, 25, 'Princely state (British paramountcy)', 'Maharaja Krishnaraja Wadiyar IV'],
      'Jammu and Kashmir': [2, 0.65, 15, 'Princely state (British paramountcy)', 'Maharaja Pratap Singh'],
      'Travancore': [1, 0.75, 15, 'Princely state (British paramountcy)', 'Maharaja Moolam Thirunal'],
      'Baroda': [1, 0.75, 15, 'Princely state (British paramountcy)', 'Maharaja Sayajirao Gaekwad III'],
      'Gwalior': [2, 0.7, 15, 'Princely state (British paramountcy)', 'Maharaja Madho Rao Scindia'],
      'Indore': [1, 0.7, 12, 'Princely state (British paramountcy)', 'Maharaja Shivaji Rao Holkar'],
      'Bhopal': [1, 0.7, 10, 'Princely state (British paramountcy)', 'Begum Shah Jahan'],
      'Patiala': [1, 0.7, 12, 'Princely state (British paramountcy)', 'Maharaja Bhupinder Singh'],
      'Jodhpur': [1, 0.7, 10, 'Princely state (British paramountcy)', 'Maharaja Sardar Singh'],
      'Bikaner': [1, 0.7, 8, 'Princely state (British paramountcy)', 'Maharaja Ganga Singh'],
      'Jaipur': [1, 0.7, 10, 'Princely state (British paramountcy)', 'Maharaja Madho Singh II'],
      'Udaipur': [1, 0.7, 8, 'Princely state (British paramountcy)', 'Maharana Fateh Singh'],
      'Kalat': [1, 0.6, 5, 'Khanate (British paramountcy)', 'Khan Mir Mahmud Khan II'],
      'Bahawalpur': [1, 0.65, 8, 'Princely state (British paramountcy)', 'Nawab Muhammad Bahawal Khan V'],
      'Sikkim': [0.5, 0.6, 3, 'Protectorate', 'Chogyal Thutob Namgyal']
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
      'Slovakia': [3, 0.8, 20, 'One-party state (German protection)', 'President Jozef Tiso'],
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
      'Afghanistan': [4, 0.55, 15, 'Monarchy', 'King Zahir Shah'],
      'Hyderabad': [5, 0.75, 35, 'Princely state (British paramountcy)', 'Nizam Mir Osman Ali Khan'],
      'Mysore': [2, 0.8, 30, 'Princely state (British paramountcy)', 'Maharaja Krishnaraja Wadiyar IV'],
      'Jammu and Kashmir': [2, 0.7, 15, 'Princely state (British paramountcy)', 'Maharaja Hari Singh'],
      'Travancore': [1, 0.8, 18, 'Princely state (British paramountcy)', 'Maharaja Chithira Thirunal'],
      'Baroda': [1, 0.8, 18, 'Princely state (British paramountcy)', 'Maharaja Sayajirao Gaekwad III'],
      'Gwalior': [2, 0.75, 15, 'Princely state (British paramountcy)', 'Maharaja Jivajirao Scindia'],
      'Indore': [1, 0.75, 12, 'Princely state (British paramountcy)', 'Maharaja Yeshwant Rao Holkar II'],
      'Bhopal': [1, 0.75, 10, 'Princely state (British paramountcy)', 'Nawab Hamidullah Khan'],
      'Patiala': [1, 0.75, 12, 'Princely state (British paramountcy)', 'Maharaja Yadavindra Singh'],
      'Jodhpur': [1, 0.75, 10, 'Princely state (British paramountcy)', 'Maharaja Umaid Singh'],
      'Bikaner': [1, 0.75, 8, 'Princely state (British paramountcy)', 'Maharaja Ganga Singh'],
      'Jaipur': [1, 0.75, 10, 'Princely state (British paramountcy)', 'Maharaja Man Singh II'],
      'Udaipur': [1, 0.75, 8, 'Princely state (British paramountcy)', 'Maharana Bhupal Singh'],
      'Kalat': [1, 0.6, 5, 'Khanate (British paramountcy)', 'Khan Ahmad Yar Khan'],
      'Bahawalpur': [1, 0.7, 8, 'Princely state (British paramountcy)', 'Nawab Sadeq Muhammad Khan V'],
      'Sikkim': [0.5, 0.6, 3, 'Protectorate', 'Chogyal Tashi Namgyal']
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
      'Yugoslavia': [7, 0.85, 20, 'Federal republic (Serbia and Montenegro)', 'President Vojislav Koštunica'],
      'Ethiopia': [12, 0.65, 15, 'Federal republic', 'PM Meles Zenawi'],
      'Eritrea': [6, 0.65, 10, 'One-party state', 'President Isaias Afwerki'],
      'Kuwait': [2, 1.0, 50, 'Emirate', 'Emir Jaber Al-Ahmad Al-Sabah'],
      'Jordan': [4, 1.0, 30, 'Monarchy', 'King Abdullah II'],
      'Zimbabwe': [3, 0.6, 10, 'Republic (authoritarian)', 'President Robert Mugabe'],
      'Switzerland': [4, 1.3, 90, 'Federal republic', 'President Pascal Couchepin'],
      'Singapore': [3, 1.3, 70, 'Parliamentary republic', 'PM Goh Chok Tong'],
      'East Timor': [1, 0.6, 5, 'Republic', 'President Xanana Gusmão'],
      'Bahrain': [1, 1.0, 40, 'Constitutional monarchy', 'King Hamad bin Isa Al Khalifa']
    }
  };
  // name -> [government, leader] for nations without a full profile (their strength comes from their size)
  const PS = 'Princely state (British paramountcy)', PSS = 'Princely states (British paramountcy)';
  const LEADERS = {
    '1900': {
      'Bastar': [PS, 'Raja Rudra Pratap Deo'], 'Bundelkhand States': [PSS, 'Maharaja Pratap Singh of Orchha'],
      'Chhattisgarh States': [PSS, 'Chiefs of the Chhattisgarh Feudatory States'], 'Cochin': [PS, 'Raja Rama Varma XV'],
      'Jaisalmer': [PS, 'Maharawal Shalivahan Singh III'], 'Kathiawar States': [PSS, 'Chiefs of the Kathiawar Agency'],
      'Khairpur': [PS, 'Mir Faiz Muhammad Khan I'], 'Kutch': [PS, 'Maharao Khengarji III'], 'Manipur': [PS, 'Maharaja Churachand Singh'],
      'Orissa States': [PSS, 'Chiefs of the Orissa Tributary States'], 'Punjab Hill States': [PSS, 'Rajas of the Simla Hill States'],
      'Rajputana States': [PSS, 'Maharao Umed Singh II of Kota'], 'Rewa': [PS, 'Maharaja Venkat Raman Singh'],
      'Shan States': ['Shan states (British protection)', 'The Sawbwas of the Shan States'], 'Swat, Dir & Chitral': [PSS, 'Mehtar Shuja ul-Mulk of Chitral'],
      'Tripura': [PS, 'Maharaja Radha Kishore Manikya'], 'Bhutan': ['Dual theocracy', 'Trongsa Penlop Ugyen Wangchuck'],
      'Nepal': ['Rana autocracy', 'PM Bir Shumsher Rana (King Prithvi)'], 'Bukhara and Khiva': ['Emirates (Russian protectorates)', 'Emir Abdulahad Khan of Bukhara'],
      'Oman': ['Sultanate', 'Sultan Faisal bin Turki'], 'Qatar': ['Sheikhdom', 'Sheikh Jassim bin Mohammed Al Thani'],
      'Kuwait': ['Sheikhdom (British protection)', 'Sheikh Mubarak Al-Sabah'], 'Tonga': ['Constitutional monarchy', 'King George Tupou II'],
      'Montenegro': ['Principality', 'Prince Nicholas I'], 'Luxembourg': ['Grand duchy', 'Grand Duke Adolphe'],
      'Liechtenstein': ['Principality', 'Prince Johann II'], 'San Marino': ['Republic', 'The Captains Regent'],
      'Andorra': ['Co-principality', 'The Co-Princes (French President and Bishop of Urgell)'], 'Liberia': ['Republic', 'President William D. Coleman'],
      'Bolivia': ['Republic', 'President José Manuel Pando'], 'Colombia': ['Republic (Thousand Days\' War)', 'President Manuel Antonio Sanclemente'],
      'Costa Rica': ['Republic', 'President Rafael Yglesias Castro'], 'Dominican Republic': ['Republic', 'President Juan Isidro Jimenes'],
      'Ecuador': ['Republic', 'President Eloy Alfaro'], 'El Salvador': ['Republic', 'President Tomás Regalado'],
      'Guatemala': ['Republic (dictatorship)', 'President Manuel Estrada Cabrera'], 'Haiti': ['Republic', 'President Tirésias Simon Sam'],
      'Honduras': ['Republic', 'President Terencio Sierra'], 'Nicaragua': ['Republic (dictatorship)', 'President José Santos Zelaya'],
      'Paraguay': ['Republic', 'President Emilio Aceval'], 'Peru': ['Republic', 'President Eduardo López de Romaña'],
      'Uruguay': ['Republic', 'President Juan Lindolfo Cuestas'], 'Venezuela': ['Republic', 'President Cipriano Castro']
    },
    '1939': {
      'Bastar': [PS, 'Maharaja Pravir Chandra Bhanj Deo'], 'Bundelkhand States': [PSS, 'Maharaja Vir Singh II of Orchha'],
      'Chhattisgarh States': [PSS, 'Chiefs of the Chhattisgarh States'], 'Cochin': [PS, 'Raja Rama Varma XVII'],
      'Jaisalmer': [PS, 'Maharawal Jawahir Singh'], 'Kathiawar States': [PSS, 'Chiefs of the Western India States Agency'],
      'Khairpur': [PS, 'Mir Faiz Muhammad Khan II'], 'Kutch': [PS, 'Maharao Khengarji III'], 'Manipur': [PS, 'Maharaja Churachand Singh'],
      'Orissa States': [PSS, 'Chiefs of the Eastern States Agency'], 'Punjab Hill States': [PSS, 'Rajas of the Punjab Hill States'],
      'Rajputana States': [PSS, 'Maharao Umed Singh II of Kota'], 'Rewa': [PS, 'Maharaja Gulab Singh'],
      'Shan States': ['Federated Shan States (British Burma)', 'The Sawbwas of the Shan States'], 'Swat, Dir & Chitral': [PSS, 'Mehtar Muzaffar ul-Mulk of Chitral'],
      'Tripura': [PS, 'Maharaja Bir Bikram Kishore Manikya'], 'Bhutan': ['Monarchy', 'King Jigme Wangchuck'],
      'Nepal': ['Rana autocracy', 'PM Juddha Shumsher Rana (King Tribhuvan)'], 'Tibet': ['Theocracy', 'Regent Reting Rinpoche'],
      'Xinjiang': ['Warlord province (Soviet-backed)', 'Governor Sheng Shicai'], 'Yemen': ['Imamate', 'Imam Yahya Muhammad Hamid ed-Din'],
      'Oman': ['Sultanate (British influence)', 'Sultan Said bin Taimur'], 'Iceland': ['Kingdom in personal union with Denmark', 'PM Hermann Jónasson (King Christian X)'],
      'Tuva': ['People\'s republic (Soviet satellite)', 'Chairman Salchak Toka'], 'Tonga': ['Constitutional monarchy (British protection)', 'Queen Sālote Tupou III'],
      'Liechtenstein': ['Principality', 'Prince Franz Joseph II'], 'San Marino': ['Republic (Fascist-led)', 'The Captains Regent'],
      'Andorra': ['Co-principality', 'The Co-Princes (French President and Bishop of Urgell)'], 'Luxembourg': ['Grand duchy', 'Grand Duchess Charlotte'],
      'Liberia': ['Republic', 'President Edwin Barclay'], 'New Zealand': ['Dominion', 'PM Michael Joseph Savage'],
      'Newfoundland': ['Commission of Government', 'Governor Humphrey Walwyn'], 'Bolivia': ['Republic (military rule)', 'President Germán Busch'],
      'Chile': ['Republic', 'President Pedro Aguirre Cerda'], 'Colombia': ['Republic', 'President Eduardo Santos'],
      'Costa Rica': ['Republic', 'President León Cortés Castro'], 'Cuba': ['Republic (Batista-backed)', 'President Federico Laredo Brú'],
      'Dominican Republic': ['Trujillo dictatorship', 'Rafael Trujillo (President Jacinto Peynado)'], 'Ecuador': ['Republic', 'President Aurelio Mosquera'],
      'El Salvador': ['Military dictatorship', 'President Maximiliano Hernández Martínez'], 'Guatemala': ['Dictatorship', 'President Jorge Ubico'],
      'Haiti': ['Republic', 'President Sténio Vincent'], 'Honduras': ['Dictatorship', 'President Tiburcio Carías Andino'],
      'Nicaragua': ['Somoza dictatorship', 'President Anastasio Somoza García'], 'Panama': ['Republic', 'President Juan Demóstenes Arosemena'],
      'Paraguay': ['Republic', 'President Félix Paiva'], 'Peru': ['Republic (authoritarian)', 'President Óscar R. Benavides'],
      'Uruguay': ['Republic', 'President Alfredo Baldomir'], 'Venezuela': ['Republic', 'President Eleazar López Contreras']
    },
    '2003': {
      'Albania': ['Parliamentary republic', 'PM Fatos Nano'], 'Algeria': ['Republic', 'President Abdelaziz Bouteflika'],
      'Andorra': ['Co-principality', 'Head of Government Marc Forné Molné'], 'Angola': ['Republic', 'President José Eduardo dos Santos'],
      'Antigua and Barbuda': ['Commonwealth realm', 'PM Lester Bird'], 'Armenia': ['Republic', 'President Robert Kocharyan'],
      'Austria': ['Federal republic', 'Chancellor Wolfgang Schüssel'], 'Azerbaijan': ['Republic', 'President Heydar Aliyev'],
      'Bahamas': ['Commonwealth realm', 'PM Perry Christie'], 'Bangladesh': ['Parliamentary republic', 'PM Khaleda Zia'],
      'Barbados': ['Commonwealth realm', 'PM Owen Arthur'], 'Belgium': ['Constitutional monarchy', 'PM Guy Verhofstadt'],
      'Belize': ['Commonwealth realm', 'PM Said Musa'], 'Benin': ['Republic', 'President Mathieu Kérékou'],
      'Bhutan': ['Monarchy', 'King Jigme Singye Wangchuck'], 'Bolivia': ['Republic', 'President Gonzalo Sánchez de Lozada'],
      'Bosnia and Herzegovina': ['Federal republic (international oversight)', 'High Representative Paddy Ashdown'],
      'Botswana': ['Republic', 'President Festus Mogae'], 'Brunei': ['Sultanate', 'Sultan Hassanal Bolkiah'],
      'Bulgaria': ['Parliamentary republic', 'PM Simeon Saxe-Coburg-Gotha'], 'Burkina Faso': ['Republic', 'President Blaise Compaoré'],
      'Burundi': ['Transitional government', 'President Pierre Buyoya'], 'Cambodia': ['Constitutional monarchy', 'PM Hun Sen'],
      'Cameroon': ['Republic', 'President Paul Biya'], 'Central African Republic': ['Republic', 'President Ange-Félix Patassé'],
      'Chad': ['Republic', 'President Idriss Déby'], 'Chile': ['Republic', 'President Ricardo Lagos'],
      'Colombia': ['Republic', 'President Álvaro Uribe'], 'Congo': ['Republic', 'President Denis Sassou Nguesso'],
      'Costa Rica': ['Republic', 'President Abel Pacheco'], 'Croatia': ['Parliamentary republic', 'PM Ivica Račan'],
      'Cyprus': ['Republic', 'President Glafcos Clerides'], 'Czech Republic': ['Parliamentary republic', 'PM Vladimír Špidla'],
      'DR Congo': ['Republic (civil war)', 'President Joseph Kabila'], 'Denmark': ['Constitutional monarchy', 'PM Anders Fogh Rasmussen'],
      'Djibouti': ['Republic', 'President Ismaïl Omar Guelleh'], 'Dominica': ['Parliamentary republic', 'PM Pierre Charles'],
      'Dominican Republic': ['Republic', 'President Hipólito Mejía'], 'Ecuador': ['Republic', 'President Gustavo Noboa'],
      'El Salvador': ['Republic', 'President Francisco Flores'], 'Equatorial Guinea': ['Republic (authoritarian)', 'President Teodoro Obiang'],
      'Estonia': ['Parliamentary republic', 'PM Siim Kallas'], 'Fiji': ['Republic', 'PM Laisenia Qarase'],
      'Finland': ['Republic', 'PM Paavo Lipponen'], 'Gabon': ['Republic', 'President Omar Bongo'],
      'Gambia': ['Republic', 'President Yahya Jammeh'], 'Ghana': ['Republic', 'President John Kufuor'],
      'Grenada': ['Commonwealth realm', 'PM Keith Mitchell'], 'Guatemala': ['Republic', 'President Alfonso Portillo'],
      'Guinea': ['Republic', 'President Lansana Conté'], 'Guinea-Bissau': ['Republic', 'President Kumba Ialá'],
      'Guyana': ['Republic', 'President Bharrat Jagdeo'], 'Haiti': ['Republic', 'President Jean-Bertrand Aristide'],
      'Honduras': ['Republic', 'President Ricardo Maduro'], 'Hungary': ['Parliamentary republic', 'PM Péter Medgyessy'],
      'Iceland': ['Parliamentary republic', 'PM Davíð Oddsson'], 'Ireland': ['Parliamentary republic', 'Taoiseach Bertie Ahern'],
      'Ivory Coast': ['Republic (civil war)', 'President Laurent Gbagbo'], 'Jamaica': ['Commonwealth realm', 'PM P. J. Patterson'],
      'Kenya': ['Republic', 'President Mwai Kibaki'], 'Kyrgyzstan': ['Republic', 'President Askar Akayev'],
      'Laos': ['Communist state', 'President Khamtai Siphandon'], 'Latvia': ['Parliamentary republic', 'PM Einars Repše'],
      'Lebanon': ['Parliamentary republic (Syrian presence)', 'President Émile Lahoud (PM Rafic Hariri)'], 'Lesotho': ['Constitutional monarchy', 'PM Pakalitha Mosisili'],
      'Liberia': ['Republic (civil war)', 'President Charles Taylor'], 'Liechtenstein': ['Principality', 'Prince Hans-Adam II'],
      'Lithuania': ['Republic', 'President Valdas Adamkus'], 'Luxembourg': ['Grand duchy', 'PM Jean-Claude Juncker'],
      'Macedonia': ['Parliamentary republic', 'PM Branko Crvenkovski'], 'Madagascar': ['Republic', 'President Marc Ravalomanana'],
      'Malawi': ['Republic', 'President Bakili Muluzi'], 'Malaysia': ['Federal constitutional monarchy', 'PM Mahathir Mohamad'],
      'Mali': ['Republic', 'President Amadou Toumani Touré'], 'Malta': ['Parliamentary republic', 'PM Eddie Fenech Adami'],
      'Mauritania': ['Republic (authoritarian)', 'President Maaouya Ould Sid\'Ahmed Taya'], 'Moldova': ['Parliamentary republic', 'President Vladimir Voronin'],
      'Mongolia': ['Parliamentary republic', 'PM Nambaryn Enkhbayar'], 'Morocco': ['Constitutional monarchy', 'King Mohammed VI'],
      'Mozambique': ['Republic', 'President Joaquim Chissano'], 'Myanmar': ['Military junta', 'Senior General Than Shwe'],
      'Namibia': ['Republic', 'President Sam Nujoma'], 'Nepal': ['Constitutional monarchy (civil war)', 'King Gyanendra'],
      'Netherlands': ['Constitutional monarchy', 'PM Jan Peter Balkenende'], 'New Zealand': ['Commonwealth realm', 'PM Helen Clark'],
      'Nicaragua': ['Republic', 'President Enrique Bolaños'], 'Niger': ['Republic', 'President Mamadou Tandja'],
      'Norway': ['Constitutional monarchy', 'PM Kjell Magne Bondevik'], 'Oman': ['Sultanate', 'Sultan Qaboos bin Said'],
      'Panama': ['Republic', 'President Mireya Moscoso'], 'Papua New Guinea': ['Commonwealth realm', 'PM Michael Somare'],
      'Paraguay': ['Republic', 'President Luis González Macchi'], 'Peru': ['Republic', 'President Alejandro Toledo'],
      'Philippines': ['Republic', 'President Gloria Macapagal Arroyo'], 'Portugal': ['Parliamentary republic', 'PM José Manuel Durão Barroso'],
      'Qatar': ['Emirate', 'Emir Hamad bin Khalifa Al Thani'], 'Romania': ['Republic', 'President Ion Iliescu (PM Adrian Năstase)'],
      'Rwanda': ['Republic', 'President Paul Kagame'], 'Saint Kitts and Nevis': ['Commonwealth realm', 'PM Denzil Douglas'],
      'Saint Lucia': ['Commonwealth realm', 'PM Kenny Anthony'], 'Saint Vincent and the Grenadines': ['Commonwealth realm', 'PM Ralph Gonsalves'],
      'Samoa': ['Parliamentary republic', 'PM Tuilaepa Sailele Malielegaoi'], 'Senegal': ['Republic', 'President Abdoulaye Wade'],
      'Sierra Leone': ['Republic', 'President Ahmad Tejan Kabbah'], 'Slovakia': ['Parliamentary republic', 'PM Mikuláš Dzurinda'],
      'Slovenia': ['Parliamentary republic', 'PM Anton Rop'], 'Somalia': ['Transitional government (civil war)', 'President Abdiqasim Salad Hassan'],
      'Sri Lanka': ['Republic', 'President Chandrika Kumaratunga'], 'Sudan': ['Military-Islamist government (civil war)', 'President Omar al-Bashir'],
      'Suriname': ['Republic', 'President Ronald Venetiaan'], 'Swaziland': ['Absolute monarchy', 'King Mswati III'],
      'Sweden': ['Constitutional monarchy', 'PM Göran Persson'], 'Tajikistan': ['Republic', 'President Emomali Rahmonov'],
      'Tanzania': ['Republic', 'President Benjamin Mkapa'], 'Thailand': ['Constitutional monarchy', 'PM Thaksin Shinawatra'],
      'Togo': ['Republic (authoritarian)', 'President Gnassingbé Eyadéma'], 'Tonga': ['Constitutional monarchy', 'King Tāufaʻāhau Tupou IV'],
      'Trinidad': ['Parliamentary republic', 'PM Patrick Manning'], 'Tunisia': ['Republic (authoritarian)', 'President Zine El Abidine Ben Ali'],
      'Turkmenistan': ['One-party state', 'President Saparmurat Niyazov'], 'Uganda': ['Republic', 'President Yoweri Museveni'],
      'United Arab Emirates': ['Federation of emirates', 'President Sheikh Zayed bin Sultan Al Nahyan'], 'Uruguay': ['Republic', 'President Jorge Batlle'],
      'Uzbekistan': ['Republic (authoritarian)', 'President Islam Karimov'], 'Yemen': ['Republic', 'President Ali Abdullah Saleh'],
      'Zambia': ['Republic', 'President Levy Mwanawasa'], 'San Marino': ['Republic', 'The Captains Regent'],
      'Seychelles': ['Republic', 'President France-Albert René'], 'Kiribati': ['Republic', 'President Teburoro Tito'],
      'Marshall Islands': ['Republic (free association with the US)', 'President Kessai Note'], 'Mauritius': ['Parliamentary republic', 'PM Anerood Jugnauth'],
      'Comoros': ['Federal republic', 'President Azali Assoumani'], 'São Tomé and Príncipe': ['Republic', 'President Fradique de Menezes'],
      'Cape Verde': ['Republic', 'PM José Maria Neves'], 'Solomon Islands': ['Commonwealth realm', 'PM Allan Kemakeza'],
      'Maldives': ['Republic', 'President Maumoon Abdul Gayoom'], 'Nauru': ['Republic', 'President René Harris'],
      'Micronesia': ['Republic (free association with the US)', 'President Leo Falcam'], 'Vanuatu': ['Parliamentary republic', 'PM Edward Natapei'],
      'Palau': ['Republic (free association with the US)', 'President Tommy Remengesau']
    }
  };

  const COLORS = {
    'United Kingdom': '#c48a8d', 'France': '#879cc4', 'Germany': '#9e9e9e', 'Russia': '#88b492', 'USSR': '#bf807d', 'United States': '#7f92bd',
    'Austria-Hungary': '#cfc79e', 'Italy': '#8eb196', 'Japan': '#cec8b5', 'Ottoman Empire': '#90aca5', 'Qing China': '#c8b48f', 'China': '#c8b48f',
    'Spain': '#cfc19d', 'Portugal': '#86b6a3', 'Netherlands': '#c9ab91', 'Belgium': '#bfac7d', 'Poland': '#d6adb7', 'Brazil': '#87b597',
    'Canada': '#bb8e92', 'Australia': '#82a0ba', 'India': '#cfb79d', 'Iraq': '#a0b18c', 'Iran': '#8bb1a5', 'Turkey': '#b38991', 'Sweden': '#8ea7c2',
    'Sweden-Norway': '#8ea7c2', 'Persia': '#8bb1a5', 'Mexico': '#9bb389', 'Argentina': '#aec3d6', 'Czechoslovakia': '#94a7bc', 'Hungary': '#b39e89',
    'Romania': '#c4b98c', 'Yugoslavia': '#a49ebb', 'Finland': '#b5becf', 'Egypt': '#c8bca1', 'Saudi Arabia': '#90b28a', 'Israel': '#aec0d5',
    'South Korea': '#a6b5cd', 'North Korea': '#b48888', 'Pakistan': '#8bb294', 'Ukraine': '#cdc49a', 'Mongolia': '#ae9d8e', 'Ethiopia': '#a9b588',
    'Jabal Shammar': '#c9ae94', 'Al Saud': '#8fb59a'
  };

  // ------------------------------------------------------------------ helpers
  function hashColor(name) {
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
    const hue = ((h >>> 0) % 360), s = 20 + ((h >>> 9) % 14), l = 62 + ((h >>> 17) % 12);
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

  // ------------------------------------------------------------------ geography
  // The map module supplies point -> province lookup (plain JS, also works outside a browser).
  let DATA = null;
  function attach(data) { DATA = data; }
  function geoOf(data) { return root.WorldMap ? root.WorldMap.prepare(data) : null; }
  function locate(data, lon, lat, hint) { const geo = geoOf(data); return geo ? geo.locate(lon, lat, hint) : (hint ?? -1); }
  const center = (data, p) => [data.provinces[p].x, data.provinces[p].y];
  // fast flat-earth distance in km between two lon/lat points (fine at army scale)
  function kmLL(x1, y1, x2, y2) { const dy = (y2 - y1) * 110.57, dx = (x2 - x1) * 111.32 * Math.cos((y1 + y2) * Math.PI / 360); return Math.hypot(dx, dy); }

  // What changed since the map last looked: provinces that changed hands, or everything (wars, treaties).
  const changed = { provs: [], all: false };
  function drainChanged() { const out = { provs: changed.provs.splice(0), all: changed.all }; changed.all = false; return out; }
  const events = [];
  function drainEvents() { return events.splice(0); }
  function setCtrl(g, p, to, from) {
    g.ctrl[p] = to; changed.provs.push(p);
    if (to === g.player || from === g.player) events.push({ type: 'captured', p, by: to, from });
  }

  // ------------------------------------------------------------------ setup
  const SEA_KM = 160, ENGAGE_KM = 32, STEP = 0.25;
  function newGame(data, periodId, playerName) {
    DATA = data;
    const P = PERIODS[periodId], prof = PROFILES[periodId] || {}, lead = LEADERS[periodId] || {};
    const g = {
      v: 3, period: periodId, start: P.start.slice(), year: P.start[0], month: P.start[1], day: 0, turn: 1, seed: 12345,
      player: -1, nations: [], owner: [], ctrl: [], armies: [], nextArmy: 1, battles: [], nextBattle: 1,
      news: [], chats: {}, orders: '', history: [], log: [], over: null
    };
    data.nations.forEach((n, i) => {
      const p = prof[n.name];
      const area = n.area;
      const div = p ? p[0] : Math.max(1, Math.min(14, Math.round(1 + Math.sqrt(area) / (n.great ? 2 : 4.5))));
      const baseTech = periodId === '1900' ? 0.7 : periodId === '1939' ? 0.7 : 0.75;
      g.nations.push({
        name: n.name, color: COLORS[n.name] || hashColor(n.name), cap: n.cap, great: !!n.great || !!(p && p[0] >= 25),
        tech: p ? p[1] : baseTech, eco: p ? p[2] : Math.round(15 + Math.min(40, Math.sqrt(area))), stab: 60, mil: 50,
        gov: p ? p[3] : (lead[n.name] || [])[0] || '', leader: p ? p[4] : (lead[n.name] || [])[1] || '', money: 0, alive: true,
        rel: {}, allies: [], wars: [], startDiv: div
      });
    });
    g.owner = data.provinces.map(p => p.o);
    // some land starts occupied (Japanese-held China in 1939)
    g.ctrl = data.provinces.map(p => p.oc != null ? p.oc : p.o);
    const idx = name => g.nations.findIndex(n => n.name === name);
    for (const [a, b] of P.alliances) { const i = idx(a), j = idx(b); if (i >= 0 && j >= 0) ally(g, i, j); }
    for (const [a, b] of P.wars) { const i = idx(a), j = idx(b); if (i >= 0 && j >= 0) { setWar(g, i, j, true); g.starter = g.starter || {}; g.starter[key(i, j)] = i; } }
    for (const [a, b, v] of P.hostile) { const i = idx(a), j = idx(b); if (i >= 0 && j >= 0) { setRel(g, i, j, v); setRel(g, j, i, v); } }
    // starting armies: the capital plus the most contested borders
    g.nations.forEach((n, i) => {
      const borders = borderProvinces(data, g, i).filter(p => g.ctrl[p] === i);
      let left = n.startDiv;
      const capShare = borders.length ? Math.max(1, Math.round(left * 0.35)) : left;
      addArmy(g, i, n.cap, capShare); left -= capShare;
      const scored = borders.map(p => {
        let s = 0;
        for (const q of data.provinces[p].nb) { const o = g.owner[q]; if (o >= 0 && o !== i) s += (g.nations[o].great ? 3 : 1) + Math.max(0, -rel(g, i, o)) / 10 + (atWar(g, i, o) ? 20 : 0); }
        return [p, s];
      }).sort((a, b) => b[1] - a[1]);
      const groups = Math.min(scored.length, Math.max(1, Math.min(8, Math.round(left / 5))));
      for (let k = 0; k < groups && left > 0.5; k++) {
        const d = k === groups - 1 ? left : Math.max(1, Math.round(left / (groups - k)));
        addArmy(g, i, scored[k][0], d); left -= d;
      }
      if (left > 0.5) addArmy(g, i, n.cap, left);
    });
    // occupiers garrison the land they hold
    data.provinces.forEach((p, k) => { if (p.oc != null && g.nations[p.oc]) addArmy(g, p.oc, k, 3); });
    mergeArmies(g, true);
    g.player = idx(playerName);
    g.generals = []; g.inbox = [];
    if (g.player >= 0) initGenerals(data, g);
    for (const n of g.nations) n.money = Math.round(income(data, g, g.nations.indexOf(n)) * 3);
    changed.all = true; changed.provs.length = 0; events.length = 0;
    return g;
  }

  function addArmy(g, n, p, div, pt) {
    const [x, y] = pt || center(DATA, p);
    const a = { id: g.nextArmy++, n, p, x, y, div: Math.max(0.5, div), org: 100, route: [], goal: -1, battle: 0, idle: 10, sea: false, retreat: 0 };
    g.armies.push(a); return a;
  }
  function placeAt(a, p) { a.p = p; [a.x, a.y] = center(DATA, p); a.route = []; a.goal = -1; a.sea = false; a.battle = 0; a.retreat = 0; }
  // AI armies standing still close together join up (the player's armies are left as the player arranged them).
  function mergeArmies(g, all) {
    const byNation = new Map();
    for (const a of g.armies) {
      if (a.div <= 0.05 || a.battle || a.route.length || a.sea || (!all && a.n === g.player)) continue;
      let l = byNation.get(a.n); if (!l) byNation.set(a.n, l = []);
      const b = l.find(o => kmLL(o.x, o.y, a.x, a.y) < 25);
      if (b) { b.org = (b.org * b.div + a.org * a.div) / (b.div + a.div); b.div += a.div; a.div = 0; }
      else l.push(a);
    }
    g.armies = g.armies.filter(a => a.div > 0.05);
  }

  // ------------------------------------------------------------------ diplomacy
  const key = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  function rel(g, a, b) { return g.nations[a].rel[b] || 0; }
  function setRel(g, a, b, v) { g.nations[a].rel[b] = Math.max(-100, Math.min(100, Math.round(v))); }
  function addRel(g, a, b, d) { setRel(g, a, b, rel(g, a, b) + d); }
  function atWar(g, a, b) { return a >= 0 && b >= 0 && g.nations[a].wars.includes(b); }
  function allied(g, a, b) { return a >= 0 && b >= 0 && g.nations[a].allies.includes(b); }
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
    changed.all = true;
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
        const o = army.p >= 0 ? g.owner[army.p] : -1;
        if ((army.n === a && o === b) || (army.n === b && o === a)) placeAt(army, g.nations[army.n].cap);
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
    g.owner[p] = to; g.ctrl[p] = to; changed.provs.push(p);
    for (const army of g.armies) if (army.p === p && army.n !== to && !atWar(g, army.n, to) && !allied(g, army.n, to)) {
      const home = g.nations[army.n].cap;
      placeAt(army, g.owner[home] === army.n ? home : nearestOwned(data, g, army.n, p));
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
  // great-circle distance between two provinces' centres, in km
  function km(data, a, b) {
    const A = data.provinces[a], B = data.provinces[b], r = Math.PI / 180;
    const s1 = Math.sin((B.y - A.y) * r / 2), s2 = Math.sin((B.x - A.x) * r / 2);
    return 12742 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(A.y * r) * Math.cos(B.y * r) * s2 * s2));
  }
  function borderProvinces(data, g, n) {
    const out = [];
    data.provinces.forEach((p, i) => { if (g.owner[i] === n && p.nb.some(q => g.owner[q] >= 0 && g.owner[q] !== n)) out.push(i); });
    return out;
  }

  // ------------------------------------------------------------------ economy
  function provValue(data, p) { const pr = data.provinces[p]; return Math.min(5, 0.3 + Math.log10(1 + (pr.pop || 0)) * 0.5 + pr.a / 500); }
  // Monthly income comes mostly from the national economy (scaled by how much of the country you still control), plus land.
  function income(data, g, n) {
    let land = 0, own = 0, held = 0;
    for (let p = 0; p < g.owner.length; p++) {
      if (g.owner[p] !== n) continue;
      const a = data.provinces[p].a + 20;
      own += a;
      if (g.ctrl[p] === n) { held += a; land += provValue(data, p); }
    }
    const N = g.nations[n];
    return 2 + (N.eco * 0.22 * (own ? held / own : 0) + land * 0.12) * (0.6 + N.stab / 250);
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
    // reinforce an army standing there, or raise a new one
    const here = g.armies.find(a => a.n === n && a.p === p && !a.route.length && !a.battle);
    if (here) { here.org = (here.org * here.div + 60 * count) / (here.div + count); here.div += count; return here; }
    const a = addArmy(g, n, p, count); a.org = 60;
    return a;
  }

  // ------------------------------------------------------------------ movement
  function canEnter(g, n, p) {
    if (p < 0) return false;
    const o = g.ctrl[p];
    if (o < 0) return true;                       // unclaimed land
    if (o === n || allied(g, n, o)) return true;
    if ((g.nations[o].access || []).includes(n)) return true;     // military access granted
    if (atWar(g, n, o) || atWar(g, n, g.owner[p])) return true;
    return false;
  }
  // A coastal province you or an ally control works as a port for shipping troops overseas.
  function isPort(data, g, n, p) { return p >= 0 && data.provinces[p].c && (g.ctrl[p] === n || (g.ctrl[p] >= 0 && allied(g, n, g.ctrl[p]))); }
  // Cheapest land route between provinces (Dijkstra on km). Returns the provinces after `from`, or null.
  function routeProv(data, g, n, from, test, maxKm) {
    const N = data.provinces.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const heap = [[0, from]]; dist[from] = 0;
    const push = it => { heap.push(it); let i = heap.length - 1; while (i) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
    while (heap.length) {
      const [d, p] = pop();
      if (d > dist[p]) continue;
      if (p !== from && test(p)) { const path = []; for (let c = p; c !== from; c = prev[c]) path.unshift(c); return path; }
      const pr = data.provinces[p];
      for (const x of neighbours(data, p)) {
        if (!canEnter(g, n, x)) continue;
        const c = g.ctrl[x];
        const nd = d + km(data, p, x) * (pr.nb.includes(x) ? 1 : 1.6) * (c >= 0 && atWar(g, n, c) ? 1.3 : 1);
        if (nd > (maxKm || Infinity) || nd >= dist[x]) continue;
        dist[x] = nd; prev[x] = p; push([nd, x]);
      }
    }
    return null;
  }
  // Can an army march in a straight line between two points (no sea, no forbidden land)?
  function clearLine(data, g, n, x0, y0, x1, y1) {
    const steps = Math.min(60, Math.ceil(kmLL(x0, y0, x1, y1) / 20));
    let hint = -1;
    for (let i = 1; i < steps; i++) {
      const f = i / steps, q = locate(data, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, hint);
      if (q < 0 || !canEnter(g, n, q)) return false;
      hint = q;
    }
    return true;
  }
  // Straighten a route: skip waypoints whenever the direct line is clear.
  function smooth(data, g, a, pts) {
    const out = [];
    let ax = a.x, ay = a.y, i = 0;
    while (i < pts.length) {
      let j = i;
      if (!pts[i][2]) while (j + 1 < pts.length && j - i < 14 && !pts[j + 1][2] && clearLine(data, g, a.n, ax, ay, pts[j + 1][0], pts[j + 1][1])) j++;
      out.push(pts[j]); ax = pts[j][0]; ay = pts[j][1]; i = j + 1;
    }
    return out;
  }
  // Send an army to a province (to an exact point if given). Returns false if it cannot get there,
  // 'sea' if it has to ship from a port.
  function orderTo(data, g, a, prov, pt) {
    if (prov < 0 || !canEnter(g, a.n, prov)) return false;
    const dest = pt || center(data, prov), from = a.p;
    if (prov === from || from < 0) { a.route = [[dest[0], dest[1], 0]]; a.goal = prov; return true; }
    const path = routeProv(data, g, a.n, from, q => q === prov);
    if (path) {
      let prev = from;
      const pts = path.map(q => { const c = center(data, q), sea = data.provinces[prev].nb.includes(q) ? 0 : 1; prev = q; return [c[0], c[1], sea]; });
      pts[pts.length - 1] = [dest[0], dest[1], pts[pts.length - 1][2]];
      a.route = smooth(data, g, a, pts); a.goal = prov;
      return true;
    }
    // overseas: march to a port, then sail
    const N = g.nations[a.n];
    if (!data.provinces[prov].c || !(N.great || N.tech >= 0.95 || a.n === g.player)) return false;
    let land = [];
    if (!isPort(data, g, a.n, from)) { land = routeProv(data, g, a.n, from, q => isPort(data, g, a.n, q), 4000); if (!land) return false; }
    const pts = land.map(q => { const c = center(data, q); return [c[0], c[1], 0]; });
    a.route = smooth(data, g, a, pts).concat([[dest[0], dest[1], 1]]); a.goal = prov;
    return 'sea';
  }
  function stop(a) { a.route = []; a.goal = -1; }

  // Move one army along its route for dt days.
  function moveArmy(data, g, a, dt) {
    if (a.battle) return;
    if (a.retreat > 0) a.retreat = Math.max(0, a.retreat - dt);
    if (!a.route.length) { a.idle += dt; a.manual = false; a.sea = false; return; }
    a.idle = 0;
    const c = a.p >= 0 ? g.ctrl[a.p] : -1;
    let left = dt * (a.route[0][2] ? SEA_KM : PERIODS[g.period].speed) * (a.retreat > 0 ? 1.25 : 1) * (c >= 0 && atWar(g, a.n, c) ? 0.75 : 1);
    while (left > 1e-6 && a.route.length) {
      const [tx, ty, sea] = a.route[0];
      a.sea = !!sea;
      const d = kmLL(a.x, a.y, tx, ty), step = Math.min(d, left);
      const nx = d > 0 ? a.x + (tx - a.x) * step / d : tx, ny = d > 0 ? a.y + (ty - a.y) * step / d : ty;
      if (!sea) {
        const q = locate(data, nx, ny, a.p);
        if (q >= 0 && q !== a.p && !canEnter(g, a.n, q)) { stop(a); a.blocked = true; return; }
        if (q >= 0) a.p = q;
      }
      a.x = nx; a.y = ny; left -= step;
      if (step >= d - 1e-6) {
        a.route.shift();
        if (sea) { a.sea = false; const q = locate(data, a.x, a.y, a.p); if (q >= 0) a.p = q; }
      }
    }
  }
  // Armies take enemy land they stand on, unless enemy troops are there too.
  function capture(g, a, byProv) {
    const p = a.p; if (p < 0 || a.sea || a.battle) return;
    const c = g.ctrl[p], o = g.owner[p];
    if (c >= 0 && c !== a.n && atWar(g, a.n, c)) {
      if ((byProv.get(p) || []).some(b => !b.sea && atWar(g, a.n, b.n))) return;
      const to = (o === a.n || (o >= 0 && allied(g, a.n, o) && !atWar(g, a.n, o))) ? o : a.n;
      setCtrl(g, p, to, c);
    } else if (c < 0 && o < 0) { g.owner[p] = a.n; setCtrl(g, p, a.n, -1); }
  }

  // ------------------------------------------------------------------ battles (real time)
  function sidePower(g, armies) {
    return armies.reduce((s, a) => s + a.div * g.nations[a.n].tech * (0.45 + a.org / 180) * (0.85 + g.nations[a.n].mil / 330), 0);
  }
  const dig = a => 1 + Math.min(0.3, a.idle * 0.03);           // dug-in defenders fight better
  const friendlyGround = (g, a) => { const c = a.p >= 0 ? g.ctrl[a.p] : -1; return c === a.n || (c >= 0 && allied(g, a.n, c)); };
  function battleById(g, id) { return g.battles.find(b => b.id === id); }
  function armyById(g, id) { return g.armies.find(a => a.id === id); }
  function sideFor(g, bt, x) {
    const A = bt.A.map(id => armyById(g, id)).filter(Boolean), D = bt.D.map(id => armyById(g, id)).filter(Boolean);
    const hA = A.some(a => atWar(g, x.n, a.n)), hD = D.some(a => atWar(g, x.n, a.n));
    return hA && !hD ? 'D' : hD && !hA ? 'A' : null;
  }
  function join(g, a, b) {
    if (a.battle && b.battle) {
      if (a.battle === b.battle) return;
      const keep = battleById(g, a.battle), gone = battleById(g, b.battle);
      if (!keep || !gone) return;
      for (const id of gone.A.concat(gone.D)) { const x = armyById(g, id); if (!x) continue; const s = sideFor(g, keep, x); x.battle = s ? keep.id : 0; if (s) keep[s].push(id); }
      g.battles = g.battles.filter(t => t !== gone);
      return;
    }
    if (a.battle || b.battle) {
      const [inB, x] = a.battle ? [a, b] : [b, a], bt = battleById(g, inB.battle);
      if (!bt) { inB.battle = 0; return; }
      const s = sideFor(g, bt, x); if (s) { bt[s].push(x.id); x.battle = bt.id; }
      return;
    }
    // the defender is whoever stands on friendly ground (or has been standing still longer)
    const ha = friendlyGround(g, a), hb = friendlyGround(g, b);
    let att = a, def = b;
    if ((ha && !hb) || (ha === hb && a.idle > b.idle)) { att = b; def = a; }
    const bt = { id: g.nextBattle++, A: [att.id], D: [def.id], x: def.x * 0.6 + att.x * 0.4, y: def.y * 0.6 + att.y * 0.4, p: def.p >= 0 ? def.p : att.p, days: 0, lossA: 0, lossD: 0 };
    att.battle = def.battle = bt.id;
    g.battles.push(bt);
    const mine = att.n === g.player || def.n === g.player || allied(g, att.n, g.player) || allied(g, def.n, g.player);
    events.push({ type: 'battle-start', id: bt.id, mine });
  }
  function engage(g) {
    const K = 0.6, cells = new Map();
    for (const a of g.armies) {
      if (a.sea || a.retreat > 0) continue;
      const k = Math.floor(a.x / K) * 1000 + Math.floor(a.y / K);
      let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(a);
    }
    for (const a of g.armies) {
      if (a.sea || a.retreat > 0) continue;
      const cx = Math.floor(a.x / K), cy = Math.floor(a.y / K);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const b of cells.get((cx + dx) * 1000 + cy + dy) || []) {
          if (b.id <= a.id || b.div <= 0 || a.div <= 0 || !atWar(g, a.n, b.n)) continue;
          if (a.battle && a.battle === b.battle) continue;
          if (kmLL(a.x, a.y, b.x, b.y) < ENGAGE_KM) join(g, a, b);
        }
      }
    }
  }
  // Odds for the attacking side, from 0 to 1.
  function battleOdds(g, b) {
    const A = b.attackers || b.A.map(id => armyById(g, id)).filter(Boolean), D = b.defenders || b.D.map(id => armyById(g, id)).filter(Boolean);
    const capital = g.nations.some(n => n.alive && n.cap === b.p);
    const a = sidePower(g, A), d = D.reduce((s, x) => s + sidePower(g, [x]) * dig(x), 0) * 1.15 * (capital ? 1.15 : 1);
    return { a, d, chance: a / (a + d + 1e-9) };
  }
  function liveBattle(g, id) {
    const b = battleById(g, id); if (!b) return null;
    return { id: b.id, p: b.p, x: b.x, y: b.y, days: b.days, attackers: b.A.map(i => armyById(g, i)).filter(Boolean), defenders: b.D.map(i => armyById(g, i)).filter(Boolean) };
  }
  function updateBattles(data, g, dt) {
    for (const bt of g.battles.slice()) {
      const A = bt.A.map(id => armyById(g, id)).filter(a => a && a.battle === bt.id && a.div > 0.05);
      const D = bt.D.map(id => armyById(g, id)).filter(a => a && a.battle === bt.id && a.div > 0.05);
      bt.A = A.map(a => a.id); bt.D = D.map(a => a.id);
      if (!A.length || !D.length) { endBattle(data, g, bt, !D.length, 'auto'); continue; }
      if (!A.some(a => D.some(d => atWar(g, a.n, d.n)))) { for (const x of A.concat(D)) x.battle = 0; g.battles = g.battles.filter(t => t !== bt); continue; }
      bt.days += dt;
      const { chance } = battleOdds(g, { attackers: A, defenders: D, p: bt.p });
      const r = chance / (1 - chance + 1e-9);
      const fD = 0.018 * Math.min(3, r), fA = 0.018 * Math.min(3, 1 / r);
      for (const a of A) { const l = a.div * fA * dt; a.div -= l; bt.lossA += l; a.org = Math.max(0, a.org - fA * dt * 370); }
      for (const a of D) { const l = a.div * fD * dt; a.div -= l; bt.lossD += l; a.org = Math.max(0, a.org - fD * dt * 370); }
      const avgOrg = l => l.reduce((s, a) => s + a.org * a.div, 0) / (l.reduce((s, a) => s + a.div, 0) || 1);
      if (avgOrg(D) < 15) endBattle(data, g, bt, true, 'auto');
      else if (avgOrg(A) < 15 || bt.days > 40) endBattle(data, g, bt, false, 'auto');
    }
  }
  function retreatTarget(data, g, army) {
    let best = null, bs = -Infinity;
    const from = army.p >= 0 ? army.p : g.nations[army.n].cap;
    for (const x of [from].concat(neighbours(data, from))) {
      const c = g.ctrl[x];
      if (!(c === army.n || (c >= 0 && allied(g, army.n, c)))) continue;
      if (g.armies.some(a => a.p === x && a.div > 0 && atWar(g, army.n, a.n))) continue;
      const s = (c === army.n ? 2 : 1) + (g.owner[x] === army.n ? 1 : 0) + (x === from ? -0.5 : 0);
      if (s > bs) { bs = s; best = x; }
    }
    return best;
  }
  function endBattle(data, g, bt, attackerWins, how) {
    const A = bt.A.map(id => armyById(g, id)).filter(Boolean), D = bt.D.map(id => armyById(g, id)).filter(Boolean);
    const losers = attackerWins ? D : A, winners = attackerWins ? A : D;
    let destroyed = 0;
    for (const a of winners) a.battle = 0;
    for (const a of losers) {
      a.battle = 0;
      const t = a.div < 0.3 ? null : retreatTarget(data, g, a);
      if (t == null) { a.div = 0; destroyed++; continue; }
      const c = center(data, t);
      // fall back away from the fight
      const bx = c[0] + (c[0] - bt.x) * 0.15, by = c[1] + (c[1] - bt.y) * 0.15;
      a.route = [[locate(data, bx, by, t) === t ? bx : c[0], locate(data, bx, by, t) === t ? by : c[1], 0]]; a.goal = t;
      a.retreat = 4; a.manual = false; a.org = Math.max(a.org, 5);
    }
    g.armies = g.armies.filter(a => a.div > 0.05);
    g.battles = g.battles.filter(t => t !== bt);
    const res = {
      id: bt.id, p: bt.p, x: bt.x, y: bt.y, attackerWins, how, days: Math.round(bt.days),
      att: [...new Set(A.map(a => a.n))], def: [...new Set(D.map(a => a.n))],
      lostA: +bt.lossA.toFixed(1), lostD: +bt.lossD.toFixed(1), destroyed
    };
    res.mine = res.att.concat(res.def).some(n => n === g.player || allied(g, n, g.player));
    g.log.push(battleText(data, g, res));
    if (g.log.length > 40) g.log.shift();
    events.push({ type: 'battle-end', res });
    return res;
  }
  function battleText(data, g, r) {
    const nm = l => l.map(i => g.nations[i] ? g.nations[i].name : '?').join(' & ');
    return `Battle of ${data.provinces[r.p] ? data.provinces[r.p].n : 'the field'}: ${nm(r.att)} attacked ${nm(r.def)} and ${r.attackerWins ? 'won' : 'was thrown back'} (losses ${r.lostA} vs ${r.lostD} divisions${r.how === 'fought' ? '; commanded in person' : ''}).`;
  }
  // Apply the result of a battle fought on the tactical map. lossX are fractions of strength lost.
  function finishBattle(g, b, attackerWins, lossA, lossD, how) {
    const bt = battleById(g, b.id);
    for (const a of b.attackers) { const l = a.div * lossA; a.div -= l; if (bt) bt.lossA += l; a.org = Math.max(5, a.org - (attackerWins ? 15 : 35)); }
    for (const a of b.defenders) { const l = a.div * lossD; a.div -= l; if (bt) bt.lossD += l; a.org = Math.max(5, a.org - (attackerWins ? 35 : 15)); }
    if (!bt) return { p: b.p, attackerWins, how, att: [], def: [], lostA: 0, lostD: 0, destroyed: 0 };
    return endBattle(DATA, g, bt, attackerWins, how);
  }

  // ------------------------------------------------------------------ capitulation
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
      events.push({ type: 'capitulation', n: i, annexed: all, by: enemies });
      g.log.push(`${g.nations[i].name} capitulates${all ? ' and is annexed' : ''}.`);
    }
    checkAlive(g);
    return out;
  }

  // ------------------------------------------------------------------ AI military
  function enemyPowerMap(g, me) {
    const m = new Map();
    for (const e of g.armies) if (e.p >= 0 && !e.sea && atWar(g, me, e.n)) m.set(e.p, (m.get(e.p) || 0) + sidePower(g, [e]));
    return m;
  }
  function aiRecruit(data, g, i) {
    const n = g.nations[i];
    const target = n.startDiv * (n.wars.length ? 1.6 : 1.0) * (0.6 + n.mil / 125);
    const have = divisions(g, i);
    if (have >= target) return;
    const cost = PERIODS[g.period].recruitCost;
    const can = Math.floor(Math.max(0, n.money - 10) / cost);
    const add = Math.min(can, Math.ceil((target - have) / 2), 10);
    if (add >= 1) recruit(data, g, i, add);
  }
  // Re-plan one AI nation: hold the front first, then attack with what is left.
  function aiPlan(data, g, i) {
    const n = g.nations[i];
    const mine = g.armies.filter(a => a.n === i && !a.battle && !a.retreat && !a.sea);
    if (!n.wars.length) {
      for (const a of mine) if (!a.route.length && a.p >= 0) { const c = g.ctrl[a.p]; if (c !== i && !(c >= 0 && allied(g, i, c))) { if (!orderTo(data, g, a, n.cap)) placeAt(a, n.cap); } }
      return;
    }
    // attack if this nation started the war, or clearly outguns everyone it is fighting
    const enemyDiv = n.wars.reduce((t, w) => t + divisions(g, w) * g.nations[w].tech, 0);
    const bold = n.wars.some(w => (g.starter || {})[key(i, w)] === i) || divisions(g, i) * n.tech > enemyDiv * 1.4;
    const ep = enemyPowerMap(g, i);
    const isEnemyLand = p => { const c = g.ctrl[p]; return c >= 0 && atWar(g, i, c); };
    const front = [], frontSet = new Set(), targets = [];
    for (let p = 0; p < g.ctrl.length; p++) {
      if (isEnemyLand(p)) { targets.push(p); continue; }
      if (g.ctrl[p] !== i) continue;
      let threat = 0, touches = false;
      for (const q of data.provinces[p].nb) { if (isEnemyLand(q)) touches = true; const e = ep.get(q); if (e) { threat += e; touches = true; } }
      if (touches) { front.push({ p, threat: threat + (p === n.cap ? 2 : 0.5) }); frontSet.add(p); }
    }
    front.sort((a, b) => b.threat - a.threat);
    const committed = a => a.route.length && a.goal >= 0 && (isEnemyLand(a.goal) || frontSet.has(a.goal));
    const free = new Set(mine.filter(a => !committed(a)));
    // 1. defence: enough strength on each threatened front province (defenders fight better)
    for (const f of front) {
      const here = mine.filter(a => (a.route.length && a.goal === f.p) || (!a.route.length && a.p === f.p));
      let have = sidePower(g, here);
      for (const a of here) free.delete(a);
      const need = f.threat / 1.3 * (bold ? 0.5 : 1);
      while (have < need && free.size) {
        let best = null, bd = 1200;
        for (const a of free) { const d = km(data, a.p, f.p); if (d < bd) { bd = d; best = a; } }
        if (!best) break;
        free.delete(best);
        if (orderTo(data, g, best, f.p)) have += sidePower(g, [best]);
      }
    }
    // 2. attack: pick a target and gather enough nearby armies to beat what defends it
    const odds0 = bold ? 1.2 : 1.7;
    const pool = [...free].filter(a => !a.route.length && a.p >= 0);
    for (let round = 0; round < 12 && pool.length; round++) {
      let best = null, bs = -Infinity;
      for (const p of targets) {
        const near = pool.map(a => [a, km(data, a.p, p)]).filter(x => x[1] < 900).sort((x, y) => x[1] - y[1]);
        if (!near.length) continue;
        const need = (ep.get(p) || 0) * 1.25 * odds0;
        const group = []; let pw = 0, dsum = 0;
        for (const [a, d] of near) { if (pw > need && group.length) break; group.push(a); pw += sidePower(g, [a]); dsum += d; }
        if (pw <= need) continue;
        const sc = (g.nations.some(x => x.alive && x.cap === p) ? 8 : 0) + provValue(data, p) + (need ? 1 : 2) - dsum / group.length / 150 - group.length * 0.3;
        if (sc > bs) { bs = sc; best = { p, group }; }
      }
      if (!best) break;
      for (const a of best.group) { pool.splice(pool.indexOf(a), 1); orderTo(data, g, a, best.p); }
    }
    for (const a of pool) {
      if (!bold && front.length) { if (a.p !== front[0].p) orderTo(data, g, a, front[0].p); continue; }
      const path = routeProv(data, g, i, a.p, isEnemyLand, 5000);
      if (path) { orderTo(data, g, a, path[path.length - 1]); continue; }
      // no land route: great powers ship troops to the weakest enemy coast
      if (n.great || n.tech >= 1) {
        let t = null, ts = -Infinity;
        for (const p of targets) { if (!data.provinces[p].c) continue; const sc = -(ep.get(p) || 0) * 2 + data.provinces[p].a / 200 - km(data, p, a.p) / 800; if (sc > ts) { ts = sc; t = p; } }
        if (t != null) orderTo(data, g, a, t);
      }
    }
  }

  // ------------------------------------------------------------------ generals
  // The player hands armies to generals and gives each one standing orders; the general moves them every turn.
  const GENERAL_NAMES = {
    '1900': { 'United Kingdom': ['Lord Roberts', 'Herbert Kitchener', 'Redvers Buller', 'Evelyn Wood'], 'Germany': ['Alfred von Schlieffen', 'Colmar von der Goltz', 'Paul von Hindenburg'],
      'France': ['Joseph Joffre', 'Joseph Gallieni', 'Ferdinand Foch'], 'Russia': ['Aleksey Kuropatkin', 'Nikolai Linevich', 'Aleksei Brusilov'],
      'Austria-Hungary': ['Franz Conrad von Hötzendorf', 'Oskar Potiorek'], 'Japan': ['Ōyama Iwao', 'Nogi Maresuke', 'Kodama Gentarō'],
      'United States': ['Nelson Miles', 'Arthur MacArthur', 'Leonard Wood'], 'Ottoman Empire': ['Colmar von der Goltz Pasha', 'Mahmud Shevket Pasha'],
      'Italy': ['Luigi Cadorna', 'Alberto Pollio'], 'Qing China': ['Yuan Shikai', 'Nie Shicheng'], 'Transvaal': ['Louis Botha', 'Koos de la Rey', 'Piet Joubert'] },
    '1939': { 'Germany': ['Gerd von Rundstedt', 'Fedor von Bock', 'Heinz Guderian', 'Erich von Manstein', 'Erwin Rommel'],
      'France': ['Maurice Gamelin', 'Alphonse Georges', 'Gaston Billotte'], 'United Kingdom': ['Lord Gort', 'Bernard Montgomery', 'Archibald Wavell'],
      'USSR': ['Georgy Zhukov', 'Semyon Timoshenko', 'Konstantin Rokossovsky', 'Ivan Konev'], 'Poland': ['Edward Rydz-Śmigły', 'Tadeusz Kutrzeba', 'Władysław Bortnowski'],
      'Italy': ['Rodolfo Graziani', 'Italo Balbo', 'Ugo Cavallero'], 'Japan': ['Tomoyuki Yamashita', 'Masaharu Homma', 'Hisaichi Terauchi'],
      'United States': ['George Marshall', 'Douglas MacArthur', 'George Patton', 'Dwight Eisenhower'], 'China': ['Xue Yue', 'Li Zongren', 'Bai Chongxi'],
      'Finland': ['Carl Gustaf Mannerheim'] },
    '2003': { 'United States': ['Tommy Franks', 'William Wallace', 'David Petraeus', 'James Mattis'], 'United Kingdom': ['Brian Burridge', 'Robin Brims'],
      'Russia': ['Valery Gerasimov', 'Yuri Baluyevsky', 'Vladimir Shamanov'], 'China': ['Liang Guanglie', 'Guo Boxiong'], 'Iraq': ['Ali Hassan al-Majid', 'Qusay Hussein', 'Raad al-Hamdani'],
      'Iran': ['Qasem Soleimani', 'Yahya Rahim Safavi'], 'Israel': ['Moshe Ya\'alon', 'Dan Halutz'], 'Syria': ['Hassan Turkmani', 'Ali Habib Mahmoud'],
      'India': ['N. C. Vij', 'J. J. Singh'], 'Pakistan': ['Pervez Musharraf', 'Ashfaq Kayani'], 'Turkey': ['Hilmi Özkök', 'Yaşar Büyükanıt'], 'Ukraine': ['Oleksandr Zatynaiko'] }
  };
  const GEN_COLORS = ['#ffcf5a', '#7fe0b4', '#ff9de0', '#9fb7ff', '#ffa45c', '#c4f06a'];
  function generalName(g, n, k) {
    const list = (GENERAL_NAMES[g.period] || {})[g.nations[n].name];
    if (list && list[k]) return 'Gen. ' + list[k];
    const ranks = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
    return `${ranks[k] || (k + 1) + 'th'} Army Group`;
  }
  function addGeneral(g, n) {
    g.generals = g.generals || [];
    const k = g.generals.filter(x => x.n === n).length;
    const gen = { id: (g.nextGen = (g.nextGen || 1) + 1), n, name: generalName(g, n, k), color: GEN_COLORS[k % GEN_COLORS.length], armies: [], order: { kind: 'auto' } };
    g.generals.push(gen);
    return gen;
  }
  function generalOf(g, army) { return (g.generals || []).find(x => x.armies.includes(army.id)); }
  function assignArmy(g, gen, army) {
    for (const o of g.generals || []) o.armies = o.armies.filter(id => id !== army.id);
    if (gen) gen.armies.push(army.id);
  }
  // Split the player's starting armies between a few generals by region.
  function initGenerals(data, g) {
    const mine = g.armies.filter(a => a.n === g.player);
    const k = Math.max(1, Math.min(3, Math.round(mine.length / 3)));
    const gens = []; for (let i = 0; i < k; i++) gens.push(addGeneral(g, g.player));
    const pts = mine.map(a => [data.provinces[a.p].x, data.provinces[a.p].y]);
    // farthest-point start so every general gets a region
    let cent = [pts[0].slice()];
    while (cent.length < k) {
      let best = null, bd = -1;
      for (const p of pts) { const d = Math.min(...cent.map(c => (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2)); if (d > bd) { bd = d; best = p; } }
      cent.push(best.slice());
    }
    for (let it = 0; it < 8; it++) {
      const sum = cent.map(() => [0, 0, 0]);
      pts.forEach(p => { let b = 0, bd = Infinity; cent.forEach((c, j) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2; if (d < bd) { bd = d; b = j; } }); sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2]++; });
      cent = cent.map((c, j) => sum[j][2] ? [sum[j][0] / sum[j][2], sum[j][1] / sum[j][2]] : c);
    }
    mine.forEach((a, i) => { const p = pts[i]; let b = 0, bd = Infinity; cent.forEach((c, j) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2; if (d < bd) { bd = d; b = j; } }); gens[b].armies.push(a.id); });
    // the army in the capital stays under direct command
    const capArmy = mine.find(a => a.p === g.nations[g.player].cap);
    if (capArmy && mine.length > 1) assignArmy(g, null, capArmy);
  }
  // Provinces of `me` facing nation `t` (directly, or the closest ones if there is no shared border).
  function frontWith(data, g, me, t) {
    const out = [];
    for (let p = 0; p < g.ctrl.length; p++) {
      if (g.ctrl[p] !== me) continue;
      if (data.provinces[p].nb.some(q => g.ctrl[q] === t)) out.push(p);
    }
    if (out.length) return out;
    const theirCap = g.nations[t].cap, mine = [];
    for (let p = 0; p < g.ctrl.length; p++) if (g.ctrl[p] === me) mine.push(p);
    return mine.sort((a, b) => km(data, a, theirCap) - km(data, b, theirCap)).slice(0, 3);
  }
  // Spread armies along front provinces, most threatened first. Armies already on their spot stay put.
  function holdFront(data, g, me, armies, front) {
    if (!front.length || !armies.length) return;
    const ep = enemyPowerMap(g, me);
    const threat = p => { let t = 0.5; for (const q of data.provinces[p].nb) t += ep.get(q) || 0; return t; };
    const ranked = front.map(p => ({ p, t: threat(p) })).sort((a, b) => b.t - a.t);
    const slots = [];
    for (let k = 0; slots.length < armies.length; k++) slots.push(ranked[k % ranked.length].p);
    const free = new Set(armies);
    for (const p of slots) {
      let best = null, bd = Infinity;
      for (const a of free) { const d = (a.goal === p || (a.p === p && !a.route.length)) ? -1 : km(data, a.p, p); if (d < bd) { bd = d; best = a; } }
      if (!best) break;
      free.delete(best);
      if ((best.p === p && !best.route.length) || (best.goal === p && best.route.length)) continue;
      orderTo(data, g, best, p);
    }
  }
  function attackWith(data, g, me, armies, isTarget, fallbackFront) {
    const ep = enemyPowerMap(g, me), targets = [];
    for (let p = 0; p < g.ctrl.length; p++) if (isTarget(p)) targets.push(p);
    const left = [];
    for (const a of armies) {
      if (a.route.length && a.goal >= 0 && isTarget(a.goal)) continue;      // already on its way
      const my = sidePower(g, [a]);
      let best = null, bs = -Infinity;
      for (const p of targets) {
        const d = km(data, a.p, p); if (d > 800) continue;
        const e = (ep.get(p) || 0) * 1.25, odds = my / (e + 0.01);
        if (e > 0 && odds < 1.0) continue;
        const sc = (g.nations.some(x => x.alive && x.cap === p) ? 6 : 0) + provValue(data, p) + Math.min(odds, 3) - d / 160;
        if (sc > bs) { bs = sc; best = p; }
      }
      if (best == null || !orderTo(data, g, a, best)) left.push(a);
    }
    // the rest push toward the target
    const stuck = [];
    for (const a of left) { const path = routeProv(data, g, me, a.p, isTarget, 6000); if (!path || !orderTo(data, g, a, path[path.length - 1])) stuck.push(a); }
    if (stuck.length && fallbackFront) holdFront(data, g, me, stuck, fallbackFront);
  }
  // Let the player's generals carry out their standing orders.
  function runGenerals(data, g) {
    for (const gen of g.generals || []) {
      if (gen.n !== g.player) continue;
      gen.armies = gen.armies.filter(id => g.armies.some(a => a.id === id));
      const armies = g.armies.filter(a => gen.armies.includes(a.id) && !a.manual && !a.battle && !a.retreat && !a.sea);
      gen.note = '';
      if (!armies.length) continue;
      const o = gen.order || { kind: 'auto' }, me = g.player;
      if (o.kind === 'auto') {
        // guard every border with a nation we are at war with (the general's own armies spread over it)
        const wars = g.nations[me].wars.filter(w => g.nations[w].alive);
        if (wars.length) {
          const fr = new Set(); for (const w of wars) for (const p of frontWith(data, g, me, w)) fr.add(p);
          const mid = armies.reduce((t, a) => [t[0] + a.x / armies.length, t[1] + a.y / armies.length], [0, 0]);
          const near = [...fr].filter(p => kmLL(mid[0], mid[1], data.provinces[p].x, data.provinces[p].y) < 1500);
          holdFront(data, g, me, armies, near.length ? near : [...fr]);
        }
      } else if (o.kind === 'front' && o.target != null) holdFront(data, g, me, armies, frontWith(data, g, me, o.target));
      else if (o.kind === 'attack' && o.target != null) {
        if (!atWar(g, me, o.target)) { holdFront(data, g, me, armies, frontWith(data, g, me, o.target)); gen.note = `Not at war with ${g.nations[o.target].name}, holding the border instead.`; }
        else attackWith(data, g, me, armies, p => g.ctrl[p] === o.target || (g.ctrl[p] >= 0 && allied(g, g.ctrl[p], o.target) && atWar(g, me, g.ctrl[p])), frontWith(data, g, me, o.target));
      } else if (o.kind === 'seize' && o.prov != null) {
        const c = g.ctrl[o.prov];
        if (c === me) holdFront(data, g, me, armies, [o.prov].concat(data.provinces[o.prov].nb.filter(q => g.ctrl[q] === me)));
        else if (c >= 0 && !atWar(g, me, c)) gen.note = `Not at war with ${g.nations[c].name}, cannot take ${data.provinces[o.prov].n}.`;
        else attackWith(data, g, me, armies, p => p === o.prov || (data.provinces[o.prov].nb.includes(p) && g.ctrl[p] >= 0 && atWar(g, me, g.ctrl[p])));
      } else if (o.kind === 'defend' && o.prov != null) {
        holdFront(data, g, me, armies, [o.prov].concat(data.provinces[o.prov].nb.filter(q => g.ctrl[q] === me)).slice(0, Math.max(1, armies.length)));
      }
    }
  }

  // ------------------------------------------------------------------ the historical timeline
  // What actually happened. AI nations tend to follow it unless the world has changed too much.
  const TIMELINE = {
    '1900': [[1901, 3, 'war', 'Al Saud', 'Jabal Shammar', 'The Saudi-Rashidi war'], [1904, 2, 'war', 'Japan', 'Russia', 'Russo-Japanese War'], [1905, 9, 'peace', 'Japan', 'Russia', 'Treaty of Portsmouth'],
      [1911, 9, 'war', 'Italy', 'Ottoman Empire', 'Italo-Turkish War'], [1912, 10, 'war', 'Bulgaria', 'Ottoman Empire', 'First Balkan War'],
      [1912, 10, 'war', 'Serbia', 'Ottoman Empire', 'First Balkan War'], [1912, 10, 'war', 'Greece', 'Ottoman Empire', 'First Balkan War'],
      [1914, 7, 'war', 'Austria-Hungary', 'Serbia', 'The July Crisis'], [1914, 8, 'war', 'Germany', 'Russia', 'The Great War'],
      [1914, 8, 'war', 'Germany', 'France', 'The Great War'], [1914, 8, 'war', 'United Kingdom', 'Germany', 'The Great War'],
      [1914, 11, 'war', 'Ottoman Empire', 'Russia', 'The Ottomans join the war'], [1915, 5, 'war', 'Italy', 'Austria-Hungary', 'Italy joins the Entente'],
      [1917, 4, 'war', 'United States', 'Germany', 'America enters the war']],
    '1939': [[1939, 4, 'annex', 'Italy', 'Albania', 'Italy invades Albania'],
      [1939, 8, 'pact', 'Germany', 'USSR', 'Molotov-Ribbentrop Pact'], [1939, 9, 'war', 'Germany', 'Poland', 'Fall Weiss'], [1939, 9, 'war', 'USSR', 'Poland', 'Soviet invasion of Poland'],
      [1939, 11, 'war', 'USSR', 'Finland', 'The Winter War'], [1940, 4, 'war', 'Germany', 'Denmark', 'Operation Weserübung'], [1940, 4, 'war', 'Germany', 'Norway', 'Operation Weserübung'],
      [1940, 5, 'war', 'Germany', 'Netherlands', 'Fall Gelb'], [1940, 5, 'war', 'Germany', 'Belgium', 'Fall Gelb'], [1940, 6, 'war', 'Italy', 'France', 'Italy joins the war'],
      [1940, 10, 'war', 'Italy', 'Greece', 'Greco-Italian War'], [1941, 4, 'war', 'Germany', 'Yugoslavia', 'Invasion of Yugoslavia'],
      [1941, 6, 'war', 'Germany', 'USSR', 'Operation Barbarossa'], [1941, 12, 'war', 'Japan', 'United States', 'Pearl Harbor'], [1941, 12, 'war', 'Japan', 'United Kingdom', 'Japan strikes Malaya']],
    '2003': [[2003, 3, 'war', 'United States', 'Iraq', 'Invasion of Iraq'], [2003, 3, 'war', 'United Kingdom', 'Iraq', 'Invasion of Iraq'],
      [2006, 7, 'war', 'Israel', 'Lebanon', 'Lebanon War'], [2008, 8, 'war', 'Russia', 'Georgia', 'Russo-Georgian War'], [2022, 2, 'war', 'Russia', 'Ukraine', 'Russian invasion of Ukraine']]
  };
  // Timeline entries within the next `months` months (hints for the AI game master).
  function upcoming(g, months) {
    const now = g.year * 12 + g.month, out = [];
    for (const [y, m, kind, a, b, note] of TIMELINE[g.period] || []) {
      const t = y * 12 + m;
      if (t >= now && t <= now + months) out.push(`${MONTHS[m - 1]} ${y}: ${note} (${kind} ${a} -> ${b})`);
    }
    return out;
  }
  // Apply this month's timeline entries for AI nations (used when the AI game master is offline).
  function applyTimeline(data, g) {
    const now = g.year * 12 + g.month, out = [];
    for (const [y, m, kind, an, bn, note] of TIMELINE[g.period] || []) {
      if (y * 12 + m !== now) continue;
      const a = findNation(g, an), b = findNation(g, bn);
      if (a < 0 || b < 0 || a === g.player || !g.nations[a].alive || !g.nations[b].alive) continue;
      if (kind === 'war' && !atWar(g, a, b) && !allied(g, a, b) && rel(g, a, b) < 30) { declareWar(g, a, b); out.push({ title: note, body: `${g.nations[a].name} declares war on ${g.nations[b].name}.`, nations: [an, bn] }); }
      if (kind === 'peace' && atWar(g, a, b)) { makePeace(g, a, b); out.push({ title: note, body: `${g.nations[a].name} and ${g.nations[b].name} make peace.`, nations: [an, bn] }); }
      if (kind === 'pact' && !atWar(g, a, b)) { setRel(g, a, b, 40); setRel(g, b, a, 40); out.push({ title: note, body: `${g.nations[a].name} and ${g.nations[b].name} sign a non-aggression pact.`, nations: [an, bn] }); }
      if (kind === 'annex' && b !== g.player && divisions(g, b) < divisions(g, a) * 0.5) { for (let p = 0; p < g.owner.length; p++) if (g.owner[p] === b) transfer(g, data, p, a); out.push({ title: note, body: `${g.nations[b].name} is swallowed by ${g.nations[a].name}.`, nations: [an, bn] }); }
    }
    return out;
  }

  // ------------------------------------------------------------------ the clock
  // Time runs continuously. step() advances the world by dt days; the UI calls it every frame.
  function dateOf(g) { return new Date(Date.UTC(g.start[0], g.start[1] - 1, 1) + Math.floor(g.day) * 86400000); }
  function step(data, g, dt) {
    DATA = data;
    const d0 = Math.floor(g.day);
    g.day += dt;
    for (const a of g.armies) moveArmy(data, g, a, dt);
    const byProv = new Map();
    for (const a of g.armies) if (a.p >= 0 && !a.sea) { let l = byProv.get(a.p); if (!l) byProv.set(a.p, l = []); l.push(a); }
    for (const a of g.armies) capture(g, a, byProv);
    engage(g);
    updateBattles(data, g, dt);
    for (let d = d0 + 1; d <= Math.floor(g.day); d++) newDay(data, g, d);
  }
  function newDay(data, g, d) {
    // morale recovers, faster at home
    for (const a of g.armies) if (!a.battle) a.org = Math.min(100, a.org + (friendlyGround(g, a) ? 4 : 1.5));
    // AI nations and the player's generals re-plan every other day (staggered so not everyone thinks at once)
    g.nations.forEach((n, i) => { if (i !== g.player && n.alive && (d + i) % 2 === 0) aiPlan(data, g, i); });
    if (d % 2 === 0) runGenerals(data, g);
    if (d % 5 === 0) capitulations(data, g);
    const date = dateOf(g), m = date.getUTCMonth() + 1, y = date.getUTCFullYear();
    if (m !== g.month || y !== g.year) newMonth(data, g, y, m);
  }
  function newMonth(data, g, y, m) {
    const ended = dateLabel(g);
    g.nations.forEach((n, i) => {
      if (!n.alive) return;
      n.money += income(data, g, i) - upkeep(g, i);
      if (n.money < 0) { n.stab = Math.max(5, n.stab - 3); n.money = 0; }
      if (n.wars.length) n.stab = Math.max(5, n.stab - 0.5); else n.stab = Math.min(90, n.stab + 0.5);
      if (i !== g.player) aiRecruit(data, g, i);
    });
    mergeArmies(g);
    g.year = y; g.month = m; g.turn++;
    events.push({ type: 'month', label: ended });
  }
  function dateLabel(g) { return `${MONTHS[g.month - 1]} ${g.year}`; }
  function dayLabel(g) { const d = dateOf(g); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
  // days until the next month starts
  function daysToMonth(g) { const d = dateOf(g); return Math.max(1, Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - d.getTime()) / 86400000)); }

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
    PERIODS, MONTHS, STEP, newGame, attach, step, dateLabel, dayLabel, daysToMonth, rel, setRel, addRel, atWar, allied, ally, unally, declareWar, makePeace, setWar,
    transfer, provincesOf, income, upkeep, divisions, recruit, canEnter, orderTo, stop, routeProv, battleOdds, liveBattle, finishBattle, sidePower,
    applyChange, findNation, findProvince, neighbours, borderProvinces, serialize, deserialize, hashColor, isPort, km, kmLL, provValue, locate,
    addGeneral, generalOf, assignArmy, initGenerals, runGenerals, frontWith, upcoming, applyTimeline, TIMELINE, checkAlive, mergeArmies, addArmy,
    drainChanged, drainEvents
  };
})(typeof window !== 'undefined' ? window : globalThis);
