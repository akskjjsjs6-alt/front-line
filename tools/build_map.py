"""Build the world map data used by the game.

Reads historical borders (aourednik/historical-basemaps, GPL-3.0) and city names
(Natural Earth, public domain), rasterises them onto a 0.25 degree grid, assigns
colonies to their empires, splits every nation into provinces and writes
data/world-<year>.json.

usage: python3 tools/build_map.py <folder with world_1900.geojson etc. and cities.geojson>
"""
import json, math, sys, os, collections
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
RES = 0.25
LAT0, LAT1 = 82.0, -58.0
W, H = int(360 / RES), int((LAT0 - LAT1) / RES)

# territory -> owning nation, per map year (None = keep its own name)
OWNERS = {
    1900: {
        'British Raj': 'United Kingdom', 'India': 'United Kingdom', 'Hong Kong': 'United Kingdom', 'Cape Colony': 'United Kingdom',
        'Natal': 'United Kingdom', 'Canada': 'United Kingdom', 'British Guiana': 'United Kingdom', 'Belize': 'United Kingdom',
        'Ceylon': 'United Kingdom', 'Malaya': 'United Kingdom', 'Sierra Leone': 'United Kingdom', 'Gambia': 'United Kingdom',
        'Lagos': 'United Kingdom', 'Accra': 'United Kingdom', 'Basutoland': 'United Kingdom', 'Malta': 'United Kingdom',
        'Griqualand West': 'United Kingdom', 'Fiji': 'United Kingdom', 'Papua New Guinea': 'United Kingdom', 'Brunei': 'United Kingdom',
        'Anguilla': 'United Kingdom', 'Montserrat': 'United Kingdom', 'Antigua and Barbuda': 'United Kingdom', 'Dominica': 'United Kingdom',
        'Saint Kitts and Nevis': 'United Kingdom', 'Swaziland': 'United Kingdom', 'Zululand': 'United Kingdom', 'Calabar': 'United Kingdom',
        'Opobo': 'United Kingdom', 'Trucial Oman': 'United Kingdom', 'Sultanate of Zanzibar': 'United Kingdom',
        'New South Wales (UK)': 'United Kingdom', 'Northern Territory (UK)': 'United Kingdom', 'Queensland (UK)': 'United Kingdom',
        'South Australia (UK)': 'United Kingdom', 'Victoria (UK)': 'United Kingdom', 'Western Australia (UK)': 'United Kingdom',
        'United Kingdom of Great Britain and Ireland': 'United Kingdom', 'Māori': 'United Kingdom', 'Niue': 'United Kingdom',
        'Algeria': 'France', 'Senegal': 'France', 'Ivory Coast': 'France', 'Dahomey': 'France', 'Gabon': 'France', 'Tunisia': 'France',
        'French Guiana': 'France', 'Guadeloupe': 'France', 'French Indochina': 'France', 'Cotonou': 'France', 'Madagascar': 'France',
        'Imerina': 'France', 'Saint Barthelemy': 'France', 'Wallis and Futuna Islands': 'France', 'Futa Toro': 'France', 'Futa Jalon': 'France',
        'Angola': 'Portugal', 'Portuguese East Africa': 'Portugal', 'Portuguese Guinea': 'Portugal',
        'Congo': 'Belgium',
        'Netherlands Indies': 'Netherlands', 'Dutch Guiana': 'Netherlands', 'Netherlands Antilles': 'Netherlands', 'Saint Martin': 'Netherlands',
        'Philippines': 'United States', 'Kingdom of Hawaii': 'United States', 'American Samoa': 'United States',
        'United States Virgin Islands': 'Denmark', 'United States of America': 'United States',
        'Greenland': 'Denmark', 'Iceland': 'Denmark', 'Spanish Guinea': 'Spain', 'Rapa Nui': 'Chile', 'Harer (Egypt)': 'Egypt',
        'Bosnia-Herzegovina': 'Austria-Hungary', 'Austria Hungary': 'Austria-Hungary', 'Kingdom of Brazil': 'Brazil',
        'Imperial Japan': 'Japan', 'Manchu Empire': 'Qing China', 'Rattanakosin Kingdom': 'Siam', 'Sweden–Norway': 'Sweden-Norway',
        'Russian Empire': 'Russia',
    },
    1938: {
        'United Kingdom of Great Britain and Ireland': 'United Kingdom', 'India': 'United Kingdom', 'British Raj': 'United Kingdom',
        'Ceylon': 'United Kingdom', 'Malawi': 'United Kingdom', 'Sudan': 'United Kingdom', 'Guyana': 'United Kingdom', 'Belize': 'United Kingdom',
        'Jamaica': 'United Kingdom', 'Bahamas': 'United Kingdom', 'Trinidad': 'United Kingdom', 'Barbados': 'United Kingdom',
        'Grenada': 'United Kingdom', 'Saint Lucia': 'United Kingdom', 'Saint Vincent and the Grenadines': 'United Kingdom',
        'Anguilla': 'United Kingdom', 'Montserrat': 'United Kingdom', 'Antigua and Barbuda': 'United Kingdom', 'Dominica': 'United Kingdom',
        'Saint Kitts and Nevis': 'United Kingdom', 'Turks and Caicos Islands': 'United Kingdom', 'Fiji': 'United Kingdom', 'Tonga': 'United Kingdom',
        'Israel': 'United Kingdom', 'Jordan': 'United Kingdom', 'Kuwait': 'United Kingdom', 'Qatar': 'United Kingdom', 'Trucial Oman': 'United Kingdom',
        'Brunei': 'United Kingdom', 'Gambia, The': 'United Kingdom', 'Mesopotamia (GB)': 'Iraq', 'Mandatory Palestine (GB)': 'United Kingdom',
        'Libya': 'Italy', 'Tunisia': 'France', 'Togo': 'France', 'French Somaliland': 'France', 'Martinique': 'France', 'Guadeloupe': 'France',
        'French Guiana': 'France', 'Laos': 'France', 'Cambodia': 'France', 'Cochin China': 'France', 'Saint Barthelemy': 'France',
        'Wallis and Futuna Islands': 'France',
        'Suriname': 'Netherlands', 'Netherlands Antilles': 'Netherlands', 'Saint Martin': 'Netherlands', 'Guinea-Bissau': 'Portugal',
        'Puerto Rico': 'United States', 'American Samoa': 'United States', 'United States Virgin Islands': 'United States',
        'Niue': 'New Zealand', 'Samoa': 'New Zealand', 'Armenia': 'USSR', 'Chinese warlords': 'China', 'Empire of Japan': 'Japan',
        'Emirate of Bin Shal\'an': 'Saudi Arabia', 'Hail': 'Saudi Arabia', 'Hejaz': 'Saudi Arabia', 'Iran': 'Iran',
        'Dominion of Newfoundland': 'Newfoundland', 'Eritrea (Italy)': 'Italy', 'Ethiopia (Italy)': 'Italy', 'Italian Somaliland': 'Italy', 'Union of South Africa': 'South Africa', 'Siam': 'Siam',
    },
    2000: {
        'Hong Kong': 'China', 'Puerto Rico': 'United States', 'American Samoa': 'United States', 'United States Virgin Islands': 'United States',
        'Greenland': 'Denmark', 'French Guiana': 'France', 'Guadeloupe': 'France', 'Martinique': 'France', 'Saint Martin': 'France',
        'Saint Barthelemy': 'France', 'Wallis and Futuna Islands': 'France', 'Netherlands Antilles': 'Netherlands', 'Anguilla': 'United Kingdom',
        'Montserrat': 'United Kingdom', 'Turks and Caicos Islands': 'United Kingdom', 'Niue': 'New Zealand', 'Western Sahara': 'Morocco',
        'Turkish Cypriot-administered area': 'Turkey', 'Rapa Nui': 'Chile', 'Byelarus': 'Belarus', 'Zaire': 'DR Congo',
        'Korea, Democratic People\'s Republic of': 'North Korea', 'Korea, Republic of': 'South Korea',
        'Tanzania, United Republic of': 'Tanzania', 'Gambia, The': 'Gambia', 'Burma': 'Myanmar',
    },
}
FILL_1914 = {
    'Anglo-Egyptian Sudan': 'United Kingdom', 'Botswana': 'United Kingdom', 'British East Africa': 'United Kingdom',
    'British Protectorate': 'United Kingdom', 'British Somaliland': 'United Kingdom', 'Gold Coast': 'United Kingdom', 'Malawi': 'United Kingdom',
    'Nigeria': 'United Kingdom', 'Rhodesia': 'United Kingdom', 'South Africa': 'United Kingdom', 'Uganda': 'United Kingdom',
    'Sierra Leone': 'United Kingdom', 'Gambia, The': 'United Kingdom', 'Lesotho': 'United Kingdom', 'Swaziland': 'United Kingdom',
    'Algeria': 'France', 'Djibouti': 'France', 'French Equatorial Africa': 'France', 'French West Africa': 'France',
    'Madagascar (France)': 'France', 'Tunisia': 'France',
    'German E. Africa (Tanganyika)': 'Germany', 'German South-West Africa': 'Germany', 'Kamerun': 'Germany', 'Togoland': 'Germany',
    'Belgian Congo': 'Belgium', 'Angola': 'Portugal', 'Mozambique': 'Portugal', 'Portuguese Guinea': 'Portugal',
    'Rio De Oro': 'Spain', 'Spanish Sahara': 'Spain', 'Equatorial Guinea': 'Spain', 'Eritrea': 'Italy', 'Italian Somaliland': 'Italy',
    'Libya': 'Ottoman Empire', 'Egypt': 'Egypt', 'Abyssinia': 'Ethiopia', 'Morocco': 'Morocco', 'Spanish Morocco': 'Morocco', 'Liberia': 'Liberia',
}
# SUBJECTO values that name an empire differently
ALIAS = {'United Kingdom of Great Britain and Ireland': 'United Kingdom', 'Empire of Japan': 'Japan', 'Imperial Japan': 'Japan',
         'United States of America': 'United States'}

# cities that did not exist (or were villages) in the earlier maps
NEW_CITIES = {'Brasilia', 'Islamabad', 'Gaborone', 'Abuja', 'Nouakchott', 'Lilongwe', 'Dodoma', 'Belmopan', 'Yamoussoukro',
              'Astana', 'Naypyidaw', 'Palikir', 'Putrajaya', 'Chandigarh', 'Ciudad Guayana', 'Tel Aviv-Yafo', 'Karaganda', 'Qaraghandy',
              'Magnitogorsk', 'Norilsk', 'Togliatti', 'Komsomolsk-na-Amure', 'Shenzhen', 'Brazzaville'}
NEW_CITIES_1950 = {'Canberra'} - {'Canberra'}
CAPITALS = {
    1900: {'United Kingdom': 'London', 'France': 'Paris', 'Germany': 'Berlin', 'Russia': 'St. Petersburg', 'Austria-Hungary': 'Vienna',
           'United States': 'Washington, D.C.', 'Japan': 'Tokyo', 'Italy': 'Rome', 'Ottoman Empire': 'Constantinople', 'Qing China': 'Peking',
           'Spain': 'Madrid', 'Portugal': 'Lisbon', 'Netherlands': 'Amsterdam', 'Belgium': 'Brussels', 'Denmark': 'Kobenhavn',
           'Brazil': 'Rio de Janeiro', 'Sweden-Norway': 'Stockholm', 'Persia': 'Tehran', 'Egypt': 'Cairo', 'Canada': 'Ottawa',
           'Arabia': 'Riyadh', 'Siam': 'Bangkok', 'Korea': 'Hanseong', 'Afghanistan': 'Kabul', 'Ethiopia': 'Addis Ababa'},
    1938: {'United Kingdom': 'London', 'France': 'Paris', 'Germany': 'Berlin', 'USSR': 'Moscow', 'United States': 'Washington, D.C.',
           'Japan': 'Tokyo', 'Italy': 'Rome', 'China': 'Nanking', 'Poland': 'Warsaw', 'Czechoslovakia': 'Prague', 'Turkey': 'Ankara',
           'Spain': 'Madrid', 'Portugal': 'Lisbon', 'Netherlands': 'Amsterdam', 'Belgium': 'Brussels', 'Denmark': 'Kobenhavn',
           'Brazil': 'Rio de Janeiro', 'Canada': 'Ottawa', 'Australia': 'Canberra', 'Saudi Arabia': 'Riyadh', 'Iran': 'Tehran',
           'South Africa': 'Pretoria', 'Hungary': 'Budapest', 'Romania': 'Bucharest', 'Yugoslavia': 'Belgrade'},
    2000: {'United States': 'Washington, D.C.', 'Russia': 'Moscow', 'China': 'Beijing', 'United Kingdom': 'London', 'France': 'Paris',
           'Germany': 'Berlin', 'Japan': 'Tokyo', 'India': 'New Delhi', 'Denmark': 'Kobenhavn', 'Sweden': 'Stockholm', 'Canada': 'Ottawa', 'Brazil': 'Brasilia', 'Australia': 'Canberra',
           'Iraq': 'Baghdad', 'Iran': 'Tehran', 'Israel': 'Jerusalem', 'Turkey': 'Ankara', 'Pakistan': 'Islamabad', 'Saudi Arabia': 'Riyadh',
           'South Korea': 'Seoul', 'North Korea': 'Pyongyang', 'Italy': 'Rome', 'Ukraine': 'Kiev', 'Poland': 'Warsaw', 'Egypt': 'Cairo',
           'Kazakhstan': 'Astana', 'Nigeria': 'Abuja', 'South Africa': 'Pretoria'},
}

# modern city names -> names used in that year
CITY_NAMES = {
    1900: {'Istanbul': 'Constantinople', 'Mumbai': 'Bombay', 'Kolkata': 'Calcutta', 'Chennai': 'Madras', 'Beijing': 'Peking',
           'Jakarta': 'Batavia', 'Ho Chi Minh City': 'Saigon', 'Kaliningrad': 'Königsberg', 'Gdańsk': 'Danzig', 'Gdansk': 'Danzig',
           'Wroclaw': 'Breslau', 'Lviv': 'Lemberg', 'Bratislava': 'Pressburg', 'Oslo': 'Christiania', 'Volgograd': 'Tsaritsyn',
           'Kinshasa': 'Léopoldville', 'Harare': 'Salisbury', 'Yangon': 'Rangoon', 'Guangzhou': 'Canton', 'Nanjing': 'Nanking',
           'Chongqing': 'Chungking', 'Tianjin': 'Tientsin', 'Shenyang': 'Mukden', 'Seoul': 'Hanseong', 'Vilnius': 'Vilna',
           'Tallinn': 'Reval', 'Tbilisi': 'Tiflis', 'Almaty': 'Verny', 'Bishkek': 'Pishpek', 'Ashgabat': 'Askhabad', 'Dhaka': 'Dacca',
           'Maputo': 'Lourenço Marques', 'Luanda': 'São Paulo de Luanda', 'Thessaloniki': 'Salonica', 'Izmir': 'Smyrna', 'Yekaterinburg': 'Ekaterinburg',
           'Ljubljana': 'Laibach', 'Zagreb': 'Agram', 'Chisinau': 'Kishinev', 'Kraków': 'Krakau', 'Poznań': 'Posen', 'Poznan': 'Posen',
           'Szczecin': 'Stettin', 'Strasbourg': 'Strassburg', 'Kyiv': 'Kiev', 'Taipei': 'Taihoku'},
    1938: {'Istanbul': 'Istanbul', 'Mumbai': 'Bombay', 'Kolkata': 'Calcutta', 'Chennai': 'Madras', 'Beijing': 'Peiping', 'Jakarta': 'Batavia',
           'Ho Chi Minh City': 'Saigon', 'Kaliningrad': 'Königsberg', 'Gdańsk': 'Danzig', 'Gdansk': 'Danzig', 'Wroclaw': 'Breslau',
           'Lviv': 'Lwów', 'Saint Petersburg': 'Leningrad', 'St. Petersburg': 'Leningrad', 'Volgograd': 'Stalingrad', 'Kinshasa': 'Léopoldville',
           'Harare': 'Salisbury', 'Yangon': 'Rangoon', 'Guangzhou': 'Canton', 'Nanjing': 'Nanking', 'Chongqing': 'Chungking',
           'Tianjin': 'Tientsin', 'Shenyang': 'Mukden', 'Seoul': 'Keijō', 'Vilnius': 'Wilno', 'Tbilisi': 'Tiflis', 'Almaty': 'Alma-Ata',
           'Bishkek': 'Frunze', 'Dhaka': 'Dacca', 'Maputo': 'Lourenço Marques', 'Szczecin': 'Stettin', 'Samara': 'Kuybyshev',
           'Nizhny Novgorod': 'Gorky', 'Yekaterinburg': 'Sverdlovsk', 'Donetsk': 'Stalino', 'Dushanbe': 'Stalinabad', 'Kyiv': 'Kiev',
           'Taipei': 'Taihoku'},
    2000: {},
}

GREAT = {
    1900: ['United Kingdom', 'France', 'Germany', 'Russia', 'Austria-Hungary', 'United States', 'Japan', 'Italy', 'Ottoman Empire', 'Qing China', 'Spain'],
    1938: ['United Kingdom', 'France', 'Germany', 'USSR', 'United States', 'Japan', 'Italy', 'China', 'Poland', 'Czechoslovakia', 'Turkey', 'Spain'],
    2000: ['United States', 'Russia', 'China', 'United Kingdom', 'France', 'Germany', 'Japan', 'India', 'Iraq', 'Iran', 'Israel', 'Turkey',
           'Pakistan', 'Brazil', 'Saudi Arabia', 'South Korea', 'North Korea', 'Italy', 'Ukraine', 'Poland', 'Egypt'],
}


def rasterize(features):
    """Return int16 grid of feature index (-1 = water/none), using scanline even-odd fill."""
    grid = np.full((H, W), -1, dtype=np.int32)
    rows_lat = LAT0 - (np.arange(H) + 0.5) * RES
    for fi, f in enumerate(features):
        g = f['geometry']
        if not g:
            continue
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        edges = []
        for poly in polys:
            for ring in poly:
                a = np.asarray(ring, dtype=np.float64)
                if len(a) < 3:
                    continue
                b = np.roll(a, -1, axis=0)
                edges.append(np.hstack([a, b]))
        if not edges:
            continue
        E = np.vstack(edges)
        x0, y0, x1, y1 = E[:, 0], E[:, 1], E[:, 2], E[:, 3]
        ymin, ymax = np.minimum(y0, y1), np.maximum(y0, y1)
        r0 = max(0, int(math.floor((LAT0 - ymax.max()) / RES)) - 1)
        r1 = min(H - 1, int(math.ceil((LAT0 - ymin.min()) / RES)) + 1)
        for r in range(r0, r1 + 1):
            lat = rows_lat[r]
            m = (ymin <= lat) & (ymax > lat) & (y0 != y1)
            if not m.any():
                continue
            xs = x0[m] + (lat - y0[m]) * (x1[m] - x0[m]) / (y1[m] - y0[m])
            xs.sort()
            cols = (xs + 180.0) / RES - 0.5
            for k in range(0, len(cols) - 1, 2):
                c0 = max(0, int(math.ceil(cols[k])))
                c1 = min(W - 1, int(math.floor(cols[k + 1])))
                if c1 >= c0:
                    grid[r, c0:c1 + 1] = fi
    return grid


def components(mask):
    """4-connected components of a boolean mask. Returns label grid (0 = none) and count."""
    lab = np.zeros(mask.shape, dtype=np.int32)
    n = 0
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if lab[y, x]:
            continue
        n += 1
        stack = [(y, x)]
        lab[y, x] = n
        while stack:
            cy, cx = stack.pop()
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < H:
                    nx %= W
                    if mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        stack.append((ny, nx))
    return lab, n


def build(year, cities):
    d = json.load(open(os.path.join(SRC, f'world_{year if year != 1938 else 1938}.geojson')))
    feats = [f for f in d['features'] if f['geometry']]
    over = OWNERS[year]
    owner_name = []
    for f in feats:
        p = f['properties']
        n = (p.get('NAME') or '').strip()
        s = (p.get('SUBJECTO') or '').strip()
        if not n:
            owner_name.append(None)          # unclaimed land
            continue
        if n in over:
            owner_name.append(over[n])
        elif s and s != n and ALIAS.get(s, s) != n and s not in ('Fiji', 'Tonga', 'Samoa', 'Chile', 'Bhutan', 'Luxembourg', 'Haiti', 'Dominican Republic', 'Nicaragua', 'Costa Rica', 'Philippines', 'Argentina', 'Switzerland', 'Cuba', 'Qatar', 'Oman', 'Mali', 'Niger', 'Chad', 'Vietnam', 'China', 'Cyprus', 'Western Sahara', 'United Arab Emirates', 'Japan', 'Italy', 'Russia', 'Laos', 'Puerto Rico', 'Jamaica', 'Ceylon', 'Egypt', 'American Samoa', 'Wallis and Futuna Islands', 'Māori', 'Trucial Oman'):
            owner_name.append(ALIAS.get(s, s))
        else:
            owner_name.append(ALIAS.get(n, n))
    fgrid = rasterize(feats)
    names = sorted({o for o in owner_name if o})
    nidx = {n: i for i, n in enumerate(names)}
    nat = np.full((H, W), -1, dtype=np.int32)
    land = fgrid >= 0
    lut = np.array([nidx[o] if o else -2 for o in owner_name] + [-1], dtype=np.int32)
    nat[land] = lut[fgrid[land]]
    nat[nat == -2] = -2   # unclaimed land stays -2

    if year == 1900:
        # The 1900 source leaves most of Africa unclaimed; fill it from the 1914 colonial borders.
        d14 = [f for f in json.load(open(os.path.join(SRC, 'world_1914.geojson')))['features'] if f['geometry']]
        g14 = rasterize(d14)
        fill = [nidx.get(FILL_1914.get((f['properties'].get('NAME') or '').strip()), -9) for f in d14] + [-9]
        fill = np.array(fill, dtype=np.int32)
        rows = LAT0 - (np.arange(H) + 0.5) * RES
        cols = np.arange(W) * RES - 180
        box = ((rows[:, None] > -36) & (rows[:, None] < 38)) & ((cols[None, :] > -20) & (cols[None, :] < 55))
        m = (nat == -2) & box & (g14 >= 0)
        f = fill[g14[m]]
        sel = np.flatnonzero(m.ravel())[f >= 0]
        nat.ravel()[sel] = f[f >= 0]

    lats = LAT0 - (np.arange(H) + 0.5) * RES
    coslat = np.cos(np.radians(lats))
    cell_km2 = (111.32 * RES) ** 2 * coslat     # per row

    prov = np.zeros((H, W), dtype=np.int32)     # 0 = water, else province id+1
    provinces = []
    rng = np.random.default_rng(year)

    def add_provinces(mask, owner):
        ys, xs = np.nonzero(mask)
        if len(ys) == 0:
            return
        area = cell_km2[ys].sum()
        k = max(1, int(round(math.sqrt(area / 16000.0))))
        k = min(k, max(1, len(ys) // 12), 70)
        xr = xs.astype(np.float64)
        if xs.max() - xs.min() > W / 2:      # spans the antimeridian
            xr = np.where(xs < W / 2, xr + W, xr)
        px = (xr - xr.mean()) * coslat[ys]
        pts = np.stack([px, ys.astype(np.float64)], 1)
        if k == 1:
            lab = np.zeros(len(ys), dtype=np.int32)
        else:
            cent = pts[rng.choice(len(pts), k, replace=False)]
            for _ in range(14):
                dd = ((pts[:, None, :] - cent[None, :, :]) ** 2).sum(-1) if len(pts) * k < 4e7 else None
                if dd is None:
                    lab = np.empty(len(pts), dtype=np.int32)
                    for s in range(0, len(pts), 200000):
                        lab[s:s + 200000] = ((pts[s:s + 200000, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
                else:
                    lab = dd.argmin(1)
                for j in range(k):
                    m = lab == j
                    if m.any():
                        cent[j] = pts[m].mean(0)
        base = len(provinces)
        for j in range(k):
            m = lab == j
            if not m.any():
                continue
            provinces.append({'o': owner, 'cells': (ys[m], xs[m])})
            prov[ys[m], xs[m]] = len(provinces)
        return base

    for oi, n in enumerate(names):
        m = nat == oi
        lab, nc = components(m)
        sizes = np.bincount(lab.ravel())[1:]
        big = np.zeros_like(m)
        for c in range(nc):
            if sizes[c] >= 12:
                big |= lab == c + 1
        # big landmasses: k-means over the whole nation; small islands: own province (merged later if tiny)
        add_provinces(big, oi)
        for c in range(nc):
            if sizes[c] < 12:
                cm = lab == c + 1
                if sizes[c] >= 3:
                    add_provinces(cm, oi)
    # unclaimed land
    m = nat == -2
    lab, nc = components(m)
    sizes = np.bincount(lab.ravel())[1:]
    for c in range(nc):
        if sizes[c] >= 6:
            add_provinces(lab == c + 1, -1)

    # split provinces into connected parts; fold small fragments into a touching province of the same owner
    for _ in range(2):
        newprov = []
        prov[:] = 0
        for p in provinces:
            ys, xs = p['cells']
            prov[ys, xs] = 1
        # relabel per province via components restricted to each province
        P = len(provinces)
        pid = np.zeros((H, W), dtype=np.int32)
        for i, p in enumerate(provinces):
            pid[p['cells']] = i + 1
        out = []
        for i, p in enumerate(provinces):
            ys, xs = p['cells']
            y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
            if x1 - x0 > W / 2:          # wraps the antimeridian: keep as is
                out.append(p)
                continue
            sub = pid[y0:y1 + 1, x0:x1 + 1] == i + 1
            lab = np.zeros(sub.shape, dtype=np.int32)
            n = 0
            for sy, sx in zip(*np.nonzero(sub)):
                if lab[sy, sx]:
                    continue
                n += 1
                st = [(sy, sx)]
                lab[sy, sx] = n
                while st:
                    cy, cx = st.pop()
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < sub.shape[0] and 0 <= nx < sub.shape[1] and sub[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            st.append((ny, nx))
            if n == 1:
                out.append(p)
                continue
            sizes = np.bincount(lab.ravel())[1:]
            for c in range(n):
                cy, cx = np.nonzero(lab == c + 1)
                out.append({'o': p['o'], 'cells': (cy + y0, cx + x0), 'frag': sizes[c] < 0.35 * sizes.max() and sizes[c] < 40})
        provinces = out
        pid[:] = 0
        for i, p in enumerate(provinces):
            pid[p['cells']] = i + 1
        keep = []
        remap = {}
        for i, p in enumerate(provinces):
            if not p.get('frag'):
                continue
            ys, xs = p['cells']
            cnt = collections.Counter()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = np.clip(ys + dy, 0, H - 1), (xs + dx) % W
                for q in pid[ny, nx]:
                    if q and q != i + 1 and provinces[q - 1]['o'] == p['o'] and not provinces[q - 1].get('frag'):
                        cnt[q - 1] += 1
            if cnt:
                remap[i] = cnt.most_common(1)[0][0]
        merged = [dict(p) for p in provinces]
        for i, j in remap.items():
            a, b = merged[j]['cells'], provinces[i]['cells']
            merged[j]['cells'] = (np.concatenate([a[0], b[0]]), np.concatenate([a[1], b[1]]))
        provinces = [dict(p, frag=False) for i, p in enumerate(merged) if i not in remap]

    # final grid + stats
    prov[:] = 0
    for i, p in enumerate(provinces):
        prov[p['cells']] = i + 1
    land = prov > 0
    out_p = []
    for i, p in enumerate(provinces):
        ys, xs = p['cells']
        # centroid: the cell nearest the mean (keeps labels on land)
        if xs.max() - xs.min() > W / 2:
            xs_c = np.where(xs < W / 2, xs + W, xs)
        else:
            xs_c = xs
        my, mx = ys.mean(), xs_c.mean()
        k = ((ys - my) ** 2 + (xs_c - mx) ** 2).argmin()
        cy, cx = int(ys[k]), int(xs[k])
        coast = bool((~land[np.clip(ys + 1, 0, H - 1), xs]).any() or (~land[np.clip(ys - 1, 0, H - 1), xs]).any()
                     or (~land[ys, (xs + 1) % W]).any() or (~land[ys, (xs - 1) % W]).any())
        out_p.append({'o': int(p['o']), 'x': cx, 'y': cy, 'a': int(round(cell_km2[ys].sum() / 1000)), 'c': int(coast), 'nb': []})

    # land neighbours
    nb = collections.defaultdict(set)
    for dy, dx in ((0, 1), (1, 0)):
        a = prov
        b = np.roll(prov, -dx, axis=1) if dx else np.vstack([prov[1:], np.zeros((1, W), dtype=np.int32)])
        m = (a > 0) & (b > 0) & (a != b)
        for u, v in set(zip(a[m].tolist(), b[m].tolist())):
            nb[u - 1].add(v - 1)
            nb[v - 1].add(u - 1)
    # sea links between coastal provinces up to ~350 km apart
    coast_cells = collections.defaultdict(list)
    for i, p in enumerate(provinces):
        if not out_p[i]['c']:
            continue
        ys, xs = p['cells']
        sel = np.arange(len(ys))[:: max(1, len(ys) // 60)]
        for y, x in zip(ys[sel], xs[sel]):
            coast_cells[(y // 8, x // 8)].append((y, x, i))
    sea = collections.defaultdict(set)
    for (by, bx), lst in coast_cells.items():
        for oy in (-1, 0, 1):
            for ox in (-1, 0, 1):
                for (y2, x2, j) in coast_cells.get((by + oy, (bx + ox) % (W // 8)), []):
                    for (y, x, i) in lst:
                        if i >= j or j in nb[i]:
                            continue
                        dx = min(abs(x - x2), W - abs(x - x2)) * math.cos(math.radians(LAT0 - y * RES))
                        if (y - y2) ** 2 + dx ** 2 < 12 ** 2:
                            sea[i].add(j)
                            sea[j].add(i)
    for i in range(len(out_p)):
        out_p[i]['nb'] = sorted(nb[i])
        s = sorted(sea[i] - nb[i])
        if s:
            out_p[i]['sea'] = s

    # names from cities
    cn = CITY_NAMES[year]
    best = {}
    allnames = {}
    allpos = {}
    for f in cities:
        pp = f['properties']
        lat, lon = pp['latitude'], pp['longitude']
        r = int((LAT0 - lat) / RES)
        c = int((lon + 180) / RES) % W
        if not (0 <= r < H):
            continue
        q = prov[r, c]
        if not q:
            # coastal cities can fall in the sea at this resolution: remember where they are (for capitals),
            # but don't name a province after them, it may be across the water
            nm0 = pp.get('nameascii') or pp['name']
            nm0 = cn.get(pp['name'], cn.get(nm0, nm0))
            allpos.setdefault(nm0, (r, c))
            allpos.setdefault(pp['name'], (r, c))
            win = prov[max(0, r - 2):r + 3, max(0, c - 2):c + 3]
            nz = win[win > 0]
            if not len(nz):
                continue
            owners = {provinces[int(v) - 1]['o'] for v in np.unique(nz)}
            if len(owners) != 1:
                continue
            q = int(np.bincount(nz).argmax())
        pop = pp.get('pop_max') or 0
        nm = pp.get('nameascii') or pp['name']
        if year < 2000 and nm in NEW_CITIES:
            continue
        if year < 1950 and nm in NEW_CITIES_1950:
            continue
        nm = cn.get(pp['name'], cn.get(nm, nm))
        allnames.setdefault(nm, int(q) - 1)
        allnames.setdefault(pp['name'], int(q) - 1)
        allpos.setdefault(nm, (r, c))
        allpos.setdefault(pp['name'], (r, c))
        if q - 1 not in best or pop > best[q - 1][0]:
            best[q - 1] = (pop, nm, bool(pp.get('adm0cap')))
    used = collections.Counter()
    for i, p in enumerate(out_p):
        if i in best:
            p['n'] = best[i][1]
            if best[i][2]:
                p['cap'] = 1
        else:
            owner = names[p['o']] if p['o'] >= 0 else 'Wilderness'
            lat = LAT0 - p['y'] * RES
            lon = p['x'] * RES - 180
            p['n'] = None
        used[p.get('n')] += 1
    # unnamed provinces: name by compass relative to owner centroid
    for oi in range(-1, len(names)):
        ps = [p for p in out_p if p['o'] == oi]
        if not ps:
            continue
        cx = sum(p['x'] for p in ps) / len(ps)
        cy = sum(p['y'] for p in ps) / len(ps)
        owner = names[oi] if oi >= 0 else 'Unclaimed land'
        cnt = collections.Counter()
        for p in ps:
            if p['n']:
                continue
            dx, dy = p['x'] - cx, p['y'] - cy
            if abs(dx) < 6 and abs(dy) < 6:
                d = 'Central'
            else:
                ang = math.degrees(math.atan2(-dy, dx)) % 360
                d = ['East', 'Northeast', 'North', 'Northwest', 'West', 'Southwest', 'South', 'Southeast'][int(((ang + 22.5) % 360) // 45)]
            base = f'{d} {owner}' if oi >= 0 else f'{owner}'
            cnt[base] += 1
            p['n'] = base if cnt[base] == 1 else f'{base} {cnt[base]}'
    # duplicate city names
    seen = collections.Counter()
    for p in out_p:
        seen[p['n']] += 1
        if seen[p['n']] > 1:
            p['n'] = f"{p['n']} {seen[p['n']]}"

    # capitals: national capital city province, else largest province
    nations = []
    for oi, n in enumerate(names):
        ps = [i for i, p in enumerate(out_p) if p['o'] == oi]
        if not ps:
            continue
        want = CAPITALS[year].get(n)
        cap = allnames.get(want) if want else None
        if (cap is None or out_p[cap]['o'] != oi) and want in allpos:
            # the capital city fell into a neighbour's cell: use this nation's province nearest to it
            r0, c0 = allpos[want]
            near = min(ps, key=lambda i: (out_p[i]['y'] - r0) ** 2 + (out_p[i]['x'] - c0) ** 2)
            if (out_p[near]['y'] - r0) ** 2 + (out_p[near]['x'] - c0) ** 2 < 30 ** 2:
                cap = near
                if n in out_p[cap]['n']:          # generic compass name: call it after the capital
                    out_p[cap]['n'] = {'Kobenhavn': 'Copenhagen'}.get(want, want)
        if cap is None or out_p[cap]['o'] != oi:
            # a capital city in the nation's biggest province cluster, else its biggest province
            home = max(ps, key=lambda i: out_p[i]['a'])
            caps = [i for i in ps if out_p[i].get('cap') and abs(out_p[i]['x'] - out_p[home]['x']) + abs(out_p[i]['y'] - out_p[home]['y']) < 120]
            cap = caps[0] if caps else home
        nations.append({'name': n, 'cap': int(cap), 'area': sum(out_p[i]['a'] for i in ps), 'great': n in GREAT[year]})
    # nations index remap (drop empties)
    keep = {names.index(nn['name']): k for k, nn in enumerate(nations)}
    for p in out_p:
        p['o'] = keep.get(p['o'], -1)
        p.pop('cap', None)

    # RLE of province grid (0 = sea)
    flat = prov.ravel()
    change = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate([[0], change])
    lens = np.diff(np.concatenate([starts, [flat.size]]))
    rle = np.stack([flat[starts], lens], 1).ravel().tolist()

    data = {'year': year, 'w': W, 'h': H, 'lat0': LAT0, 'res': RES, 'nations': nations, 'provinces': out_p, 'rle': rle}
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'world-{year}.json')
    with open(path, 'w') as fh:
        json.dump(data, fh, separators=(',', ':'), ensure_ascii=False)
    print(year, 'nations', len(nations), 'provinces', len(out_p), 'bytes', os.path.getsize(path))


if __name__ == '__main__':
    cities = json.load(open(os.path.join(SRC, 'cities.geojson')))['features']
    for y in (1900, 1938, 2000):
        build(y, cities)
