"""Province-level corrections to the built maps that fix_borders.py cannot express by modern country.

Some historical borders cut through a single modern region (the Finnish-Soviet border of 1920-1940,
for one), so those provinces are split here along the old line; the rest are owners, capitals and
small nations the source map left out. Every step checks the current state first, so the script
can be run again on already-fixed data.

    python3 tools/fix_details.py [1900 1939 2003]
"""
import json
import sys

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import split as shp_split

UK, FR, ES, PT, NL, US = 'United Kingdom', 'France', 'Spain', 'Portugal', 'Netherlands', 'United States'

# new owner by province name
OWNERS = {
    '1900': {
        'Saint Martin': FR, 'Riau Islands': NL, 'Viqueque': PT, 'Dili': PT,
        'Hunedoara': 'Austria-Hungary', 'Sibiu': 'Austria-Hungary', 'Brașov': 'Austria-Hungary',   # Transylvania
        # Anglo-Egyptian Sudan: one owner, not a patchwork of British and Egyptian provinces
        **{n: UK for n in ('Juba', 'Upper Nile', 'Jonglei', 'Unity', 'East Lakes', 'Northwest Al Qadarif', 'Northwest Blue Nile', 'Sennar',
                           'Northern III', 'Dongola', 'River Nile', 'Red Sea', 'Northwest Kassala', 'White Nile', 'South Kordofan',
                           'Al Jazirah', 'Khartoum', 'North Kordofan')},
        'Al Jahra': 'Kuwait', 'Capital@Kuwait': 'Kuwait', 'Andorra la Vella': 'Andorra', 'Vaduz': 'Liechtenstein', 'Borgo Maggiore': 'San Marino',
    },
    '1939': {
        'Riau Islands': NL, 'Viqueque': PT, 'Dili': PT, 'Northeast Wele-Nzas': ES, 'East Banjul': UK, 'USNB, Guantanamo Bay': US,
        'Tangier-Tetouan': ES,                                                                            # the Spanish protectorate
        **{n: 'Oman' for n in ('Al Batinah North', 'Al Buraimi', 'Ad Dhahirah', 'Dhofar', 'Al Wusta', 'Ash Sharqiyah', 'Ash Sharqiyah North', 'Muscat')},
        **{n: 'Iceland' for n in ('Austurland', 'Reykjavík', 'Western (Iceland)', 'Westfjords', 'Northwestern@Iceland', 'Northeastern')},
        'Tuva Republic': 'Tuva', 'Tongatapu': 'Tonga', 'Niuas': 'Tonga', 'Vaduz': 'Liechtenstein', 'Borgo Maggiore': 'San Marino',
    },
}
# 'Name@Country' picks a province by name among those of a modern country (several provinces are just 'Capital')
MODERN = {'Kuwait': (47.98, 29.38), 'Iceland': (-20.5, 65.5), 'Cameroon': (11.5, 4.5)}

RENAMES = {'1900': {'central Asian khanates': 'Bukhara and Khiva'}}

# Provinces carry today's region names; these are the names of the day: name -> (1900, 1939, 2003), None keeps it
_ = None
PLACE_NAMES = {
    # Russia and the Soviet Union
    'Saint Petersburg': (_, 'Leningrad', _), 'Volgograd': ('Tsaritsyn', 'Stalingrad', _), 'Nizhny Novgorod': (_, 'Gorky', _),
    'Samara': (_, 'Kuybyshev', _), 'Sverdlovsk': ('Yekaterinburg', _, _), 'Kirov': ('Vyatka', _, _), 'Perm Krai': ('Perm', 'Perm', 'Perm'),
    'Kaliningrad': ('Königsberg', 'Königsberg', _), 'Ulan-Ude': ('Verkhneudinsk', _, _), 'Murmansk': ('Kola', _, _),
    'Novosibirsk': ('Novonikolayevsk', _, _), 'Kemerovo': ('Kuznetsk', _, _), 'Norilsk': ('Taymyr', _, _), 'Vorkuta': ('Pechora', 'Pechora', _),
    'Mirny': ('Vilyuy', 'Vilyuy', _), 'Tiksi': ('Lena Delta', _, _), 'Batagay': ('Verkhoyansk', 'Verkhoyansk', _), 'Chokurdakh': ('Indigirka', 'Indigirka', _),
    'Ust-Nera': ('Oymyakon', 'Oymyakon', _), 'Magadan': ('Ola', _, _), 'Petropavlovsk-Kamchatsky': ('Petropavlovsk', 'Petropavlovsk', _),
    'Krasnodar Krai': ('Kuban', 'Krasnodar', 'Krasnodar'), 'Stavropol Krai': ('Stavropol', 'Ordzhonikidze', 'Stavropol'),
    'Primorsky Krai': ('Primorye', 'Primorye', 'Primorye'), 'Northeast Zabaykalsky Krai': ('Transbaikalia', 'Transbaikalia', 'Northeast Zabaykalsky'),
    'Republic of Tatarstan': ('Kazan', 'Tatar ASSR', 'Tatarstan'), 'Bashkortostan': ('Ufa', 'Bashkir ASSR', _), 'Udmurt Republic': ('Sarapul', 'Udmurt ASSR', 'Udmurtia'),
    'Southwest Komi Republic': ('Ust-Sysolsk', 'Komi ASSR', 'Komi'), 'Chechen Republic': ('Terek', 'Checheno-Ingush ASSR', 'Chechnya'),
    'Republic of Kalmykia': ('Kalmyk Steppe', 'Kalmyk ASSR', 'Kalmykia'), 'Republic of Khakassia': ('Minusinsk', 'Khakassia', 'Khakassia'),
    'Altai Republic': ('Gorny Altai', 'Oirot', 'Altai'), 'Northeast Republic of Buryatia': ('Barguzin', 'Barguzin', 'Northeast Buryatia'),
    'Northwest Sakha Republic': ('Olenyok', 'Olenyok', 'Northwest Yakutia'), 'West Sakha Republic': ('Vilyuysk', 'Vilyuysk', 'West Yakutia'),
    'Southwest Sakha Republic': ('Olyokminsk', 'Olyokminsk', 'Southwest Yakutia'), 'Tuva Republic': ('Uriankhai', 'Tuva', 'Tuva'),
    'North Yamalo-Nenets Autonomous Okrug': ('Yamal', 'Yamal', 'Yamal'), 'Southeast Yamalo-Nenets Autonomous Okrug': ('Obdorsk', 'Salekhard', 'Salekhard'),
    'Southwest Yamalo-Nenets Autonomous Okrug': ('Berezov', 'Berezovo', 'Nadym'), 'West Khanty-Mansi Autonomous Okrug': ('Konda', 'Ostyak-Vogul', 'Khanty-Mansiysk'),
    'Nenets Autonomous Okrug': ('Pechora Delta', 'Nenets', 'Nenets'), 'West Chukotka Autonomous Okrug': ('Kolyma', 'Kolyma', 'West Chukotka'),
    'East Chukotka Autonomous Okrug': ('Chukotka', 'Chukotka', 'East Chukotka'), 'Sakhalin': (_, 'Karafuto', _),
    'Southwest Odessa': ('Bessarabia', _, _),
    # Ukraine, Belarus, the Baltic, the Caucasus
    'Dnipropetrovsk': ('Yekaterinoslav', _, _), 'Donetsk': ('Yuzovka', 'Stalino', _), 'Luhansk': (_, 'Voroshilovgrad', _), 'Zaporizhzhia': ('Aleksandrovsk', _, _),
    'Kirovohrad': ('Yelisavetgrad', _, _), 'Ivano-Frankivsk': ('Stanislau', 'Stanisławów', _), 'Southeast Ivano-Frankivsk': ('Kolomea', 'Kołomyja', _),
    'Lviv': ('Lemberg', 'Lwów', _), 'Chernivtsi': ('Czernowitz', 'Cernăuți', _), 'Zakarpattia': ('Ungvár', 'Carpatho-Ukraine', _),
    'Vilnius': ('Vilna', 'Wilno', _), 'Kaunas': ('Kovno', _, _), 'Klaipėda': ('Memel', 'Memel', _), 'Tartu': ('Dorpat', _, _),
    'Mahilioŭ': ('Mogilev', 'Mogilev', _), 'Tbilisi': ('Tiflis', 'Tiflis', _), 'Samegrelo-Zemo Svaneti': ('Mingrelia', 'Mingrelia', _),
    'Khojavend': ('Karabakh', 'Nagorno-Karabakh', _), 'Chișinău': ('Kishinev', _, _),
    # Central Asia
    'Nur-Sultan': ('Akmolinsk', 'Akmolinsk', 'Astana'), 'Almaty': ('Verny', 'Alma-Ata', _), 'Mangystau': ('Mangyshlak', 'Mangyshlak', _),
    'Aktobe': ('Aktyubinsk', 'Aktyubinsk', _), 'Atyrau': ('Guryev', 'Guryev', _), 'Kostanay': ('Kustanai', 'Kustanai', _), 'Jambyl': ('Aulie-Ata', 'Dzhambul', _),
    'Kyzylorda': ('Perovsk', 'Kzyl-Orda', _), 'Qaraghandy': ('Karkaraly', 'Karaganda', 'Karaganda'), 'West Karaganda': ('Sarysu', 'Sarysu', _),
    'Baikonur': ('Karmakchi', 'Karmakchi', _), 'Turkistan': ('Chimkent', 'Chimkent', _),
    'Bishkek': ('Pishpek', 'Frunze', _), 'Dushanbe': (_, 'Stalinabad', _), 'Khujand': (_, 'Leninabad', _), 'Gorno-Badakhshan': ('Pamirs', _, _),
    'Khatlon': ('Kulob', 'Kurgan-Tyube', _), 'Navoiy': ('Kermine', 'Kermine', _), 'Qashqadaryo': ('Karshi', 'Kashka-Darya', _),
    'Surxondaryo': ('Termez', 'Surkhan-Darya', _), 'Xorazm': ('Khiva', 'Khorezm', _), 'Balkan': ('Krasnovodsk', 'Krasnovodsk', _),
    'Daşoguz': ('Tashauz', 'Tashauz', _), 'Lebap': ('Chardzhou', 'Chardzhou', _), 'Southeast Lebap': ('Kerki', 'Kerki', _), 'Mary': ('Merv', 'Mary', _),
    # Poland and Germany
    'Masovian Voivodeship': ('Warsaw', 'Warsaw', 'Masovia'), 'Lesser Poland Voivodeship': ('Kraków', 'Kraków', 'Lesser Poland'),
    'Silesian Voivodeship': ('Upper Silesia', 'Silesia', 'Silesia'), 'Lower Silesian Voivodeship': ('Lower Silesia', 'Lower Silesia', 'Lower Silesia'),
    'Opole Voivodeship': ('Oppeln', 'Oppeln', 'Opole'), 'Podkarpackie Voivodeship': ('Rzeszów', 'Rzeszów', 'Subcarpathia'),
    'Podlaskie Voivodeship': ('Białystok', 'Białystok', 'Podlasie'), 'Warmian-Masurian Voivodeship': ('East Prussia', 'East Prussia', 'Warmia-Masuria'),
    'Lubusz Voivodeship': ('Neumark', 'Neumark', 'Lubusz'), 'West Pomeranian Voivodeship': ('Stettin', 'Stettin', 'West Pomerania'),
    'West Pomeranian Voivodeship II': ('Köslin', 'Köslin', 'Koszalin'), 'Pomeranian Voivodeship': ('Danzig', 'Pomorze', 'Pomerania'),
    'Kuyavian-Pomeranian Voivodeship': ('Bromberg', 'Bydgoszcz', 'Kuyavia-Pomerania'), 'Greater Poland Voivodeship': ('Posen', 'Poznań', 'Greater Poland'),
    'Southwest Greater Poland Voivodeship': ('Lissa', 'Leszno', 'Southwest Greater Poland'), 'Lublin Voivodeship': ('Lublin', 'Lublin', 'Lublin'),
    'Łódź Voivodeship': ('Łódź', 'Łódź', 'Łódź'), 'Świętokrzyskie Voivodeship': ('Kielce', 'Kielce', 'Świętokrzyskie'),
    'North Rhine-Westphalia': ('Rhineland-Westphalia', 'Rhineland-Westphalia', _), 'Rhineland-Palatinate': ('Palatinate', 'Palatinate', _),
    'Lower Saxony': ('Hanover', 'Hanover', _), 'Baden-Württemberg': ('Württemberg and Baden', 'Württemberg and Baden', _),
    'Saxony-Anhalt': ('Prussian Saxony', 'Prussian Saxony', _), 'Mecklenburg-Western Pomerania': ('Mecklenburg', 'Mecklenburg', _),
    'Primorje-Gorski': ('Fiume', 'Fiume', _), 'Goriška': ('Görz', 'Gorizia', _), 'Plzeň-': ('Plzeň', 'Plzeň', 'Plzeň'), 'East Plzeň-': ('East Plzeň', 'East Plzeň', 'East Plzeň'),
    'Denmark': ('Zealand', 'Zealand', 'Zealand'),
    # the Middle East
    'Northern (Israel)': ('Galilee', 'Galilee', _), 'West Bank': ('Nablus', 'Samaria', _), 'Northern Cyprus': ('Kyrenia', 'Kyrenia', _),
    'Nineveh': ('Mosul', 'Mosul', _), 'Saladin': ('Tikrit', 'Tikrit', _), 'Al-Qādisiyyah': ('Diwaniya', 'Diwaniya', _), 'Al Muthanna': ('Samawah', 'Samawah', _),
    'Babylon': ('Hillah', 'Hillah', _), 'Wasit': ('Kut', 'Kut', _), 'Maysan': ('Amarah', 'Amarah', _), 'Dhi Qar': ('Muntafiq', 'Muntafiq', _),
    'Al Anbar': ('Dulaim', 'Dulaim', _), 'Golestan': ('Astarabad', 'Gorgan', _), 'Hormozgan': ('Bandar Abbas', 'Bandar Abbas', _),
    'Razavi Khorasan': ('Khorasan', 'Khorasan', _), 'Capital@Kuwait': ('Kuwait', 'Kuwait', 'Kuwait City'),
    # South and Southeast Asia
    'Uttar Pradesh': ('United Provinces', 'United Provinces', _), 'Maharashtra': ('Bombay', 'Bombay', _), 'Tamil Nadu': ('Madras', 'Madras', _),
    'Andhra Pradesh': ('Northern Circars', 'Northern Circars', _), 'Karnataka': ('Bombay Karnatak', 'Bombay Karnatak', _), 'Kerala': ('Malabar', 'Malabar', _),
    'Madhya Pradesh': ('Central Provinces', 'Central Provinces', _), 'Odisha': ('Orissa', 'Orissa', _), 'Jharkhand': ('Chota Nagpur', 'Chota Nagpur', _),
    'Uttarakhand': ('Kumaon', 'Kumaon', _), 'Northwest Uttarakhand': ('Garhwal', 'Garhwal', _), 'Arunachal Pradesh': ('Tribal Assam', 'North-East Frontier', _),
    'Meghalaya': ('Khasi Hills', 'Khasi Hills', _), 'Mizoram': ('Lushai Hills', 'Lushai Hills', _), 'Nagaland': ('Naga Hills', 'Naga Hills', _),
    'Himachal Pradesh': ('Kangra', 'Kangra', _), 'Telangana': ('Hyderabad', 'Hyderabad', _),
    'Khyber Pakhtunkhwa': ('Peshawar', 'North-West Frontier', _), 'Federally Administered Tribal Areas': ('Tribal Areas', 'Tribal Areas', _),
    'Azad Kashmir': ('Poonch', 'Poonch', _), 'Gilgit-Baltistan': ('Gilgit', 'Gilgit', _), 'Chattogram': ('Chittagong', 'Chittagong', 'Chittagong'),
    'Yangon': ('Rangoon', 'Rangoon', _), 'Ayeyarwady': ('Irrawaddy', 'Irrawaddy', _), 'Rakhine State': ('Arakan', 'Arakan', _), 'Bago': ('Pegu', 'Pegu', _),
    'Tanintharyi': ('Tenasserim', 'Tenasserim', _), 'Kayin State': ('Karen Hills', 'Karen Hills', _), 'Kayah State': ('Karenni', 'Karenni', _),
    'Magway': ('Magwe', 'Magwe', _), 'Jakarta': ('Batavia', 'Batavia', _), 'Papua': ('Dutch New Guinea', 'Dutch New Guinea', _),
    'Ho Chi Minh': ('Saigon', 'Saigon', _), 'Kowloon City': ('Hong Kong', 'Hong Kong', 'Hong Kong'),
    'Taipei': ('Taihoku', 'Taihoku', _), 'Kaohsiung': ('Takao', 'Takao', _), 'Ulaanbaatar': ('Urga', _, _),
    # Africa
    'Harare': ('Salisbury', 'Salisbury', _), 'Kinshasa': ('Léopoldville', 'Léopoldville', _), 'Kisangani': ('Stanleyville', 'Stanleyville', _),
    'Lubumbashi': ('Katanga', 'Élisabethville', _), 'Mbandaka': ('Coquilhatville', 'Coquilhatville', _), 'Kalemie': ('Albertville', 'Albertville', _),
    'Gaborone': ('Gaberones', 'Gaberones', _), 'Federal Capital Territory': ('Abuja', 'Abuja', _),
    # the Americas and the Pacific
    'Federal': ('Central Goiás', 'Central Goiás', 'Brasília'), 'Goiânia': ('Goiás', 'Goiânia', _), 'Tocantins': ('North Goiás', 'North Goiás', _),
    'Rondônia': ('Guaporé', 'Guaporé', _), 'Canberra': ('Monaro', _, _), 'USNB, Guantanamo Bay': ('Guantánamo Bay', 'Guantánamo Bay', 'Guantánamo Bay'),
    'Archipelago of Saint Andréws': ('San Andrés', 'San Andrés', 'San Andrés'), 'Cusco Departament': ('Cusco', 'Cusco', 'Cusco'),
    'of Bougainville': ('Bougainville', 'Bougainville', 'Bougainville'), 'Nacional': ('Santo Domingo', 'Ciudad Trujillo', 'Santo Domingo'),
    'Ouest': ('Port-au-Prince', 'Port-au-Prince', 'Port-au-Prince'), 'Central Singapore Community Development Council': ('Singapore', 'Singapore', 'Singapore'),
}
YEAR_COL = {'1900': 0, '1939': 1, '2003': 2}

# capitals by province name (the seat of government at the start date)
CAPITALS = {
    '1900': {'Bolivia': 'Chuquisaca', 'Ecuador': 'Pichincha', 'Kalat': 'Southwest Balochistan II', 'Morocco': 'Fès-méknas-boulmane',
             'Oman': 'Muscat', 'Serbia': 'Belgrade', 'Switzerland': 'Bern', 'Bukhara and Khiva': 'Bukhara', 'Bhutan': 'Wangdue Phodrang',
             'Kuwait': 'Capital@Kuwait', 'Andorra': 'Andorra la Vella', 'Liechtenstein': 'Vaduz', 'San Marino': 'Borgo Maggiore'},
    '1939': {'Bolivia': 'Chuquisaca', 'Ecuador': 'Pichincha', 'Kalat': 'Southwest Balochistan II', 'New Zealand': 'Wellington',
             'Switzerland': 'Bern', 'Oman': 'Muscat', 'Iceland': 'Reykjavík', 'Tuva': 'Tuva Republic', 'Tonga': 'Tongatapu',
             'Liechtenstein': 'Vaduz', 'San Marino': 'Borgo Maggiore'},
    '2003': {'Bahamas': 'New Providence', 'Bolivia': 'La Paz', 'Cameroon': 'Centre@Cameroon', 'Ecuador': 'Pichincha', 'Ivory Coast': 'Lacs',
             'Malaysia': 'Kuala Lumpur', 'Morocco': 'Rabat-Salé-Zemmour-Zaër', 'Netherlands': 'North Holland', 'New Zealand': 'Wellington',
             'United Arab Emirates': 'Emirate of Abu Dhabi', 'Vietnam': 'Hanoi', 'Switzerland': 'Bern', 'Marshall Islands': 'Ratak Chain'},
}

# Provinces cut by a historical border: (province, new province name, owner of the new piece, a point inside it, the line in lon/lat)
SPLITS = {
    '1939': [
        # the Karelian Isthmus and the Finnish half of Lake Ladoga (the Tartu border of 1920)
        ('Saint Petersburg', 'Vyborg', 'Finland', (28.75, 60.71),
         [(29.6, 60.05), (29.95, 60.14), (30.3, 60.26), (30.65, 60.38), (30.95, 60.47), (31.6, 60.85), (32.3, 61.2), (32.7, 61.4)]),
        # Ladoga Karelia: Sortavala, Salmi and Suojärvi
        ('Karelia', 'Sortavala', 'Finland', (30.7, 61.7),
         [(31.6, 60.85), (32.3, 61.2), (32.45, 61.75), (32.6, 62.1), (32.1, 62.45), (31.6, 62.8), (30.9, 63.0)]),
        # Petsamo, Finland's corridor to the Arctic Ocean
        ('Murmansk', 'Petsamo', 'Finland', (31.1, 69.5),
         [(28.6, 68.65), (29.6, 68.75), (30.5, 68.95), (31.0, 69.2), (31.6, 69.45), (31.7, 70.1)]),
    ],
}


def decode(arc):
    x = y = 0
    out = []
    for i in range(0, len(arc), 2):
        x += arc[i]; y += arc[i + 1]
        out.append([x, y])
    return out


def encode(pts):
    out = [pts[0][0], pts[0][1]]
    for a, b in zip(pts, pts[1:]):
        out += [b[0] - a[0], b[1] - a[1]]
    return out


class Map:
    def __init__(self, d):
        self.d, self.P, self.Q, self.top = d, d['provinces'], d['quant'], d['latMax']
        self.arcs = [decode(a) for a in d['arcs']]

    def q(self, lon, lat):
        return [round((lon + 180) * self.Q), round((self.top - lat) * self.Q)]

    def ll(self, p):
        return (p[0] / self.Q - 180, self.top - p[1] / self.Q)

    def ring_pts(self, ring):
        pts = []
        for r in ring:
            a = self.arcs[r] if r >= 0 else self.arcs[~r][::-1]
            pts += a if not pts else a[1:]
        return pts

    def poly(self, ring):
        return Polygon([self.ll(p) for p in self.ring_pts(ring)])

    def users(self):
        u = [[] for _ in self.arcs]
        for i, p in enumerate(self.P):
            for poly in p['g']:
                for ring in poly:
                    for r in ring:
                        u[r if r >= 0 else ~r].append(i)
        return u

    def split_arc_at(self, k, pt):
        """Make pt (quantized) a node: split arc k there; returns nothing, rewrites every ring that uses k."""
        a = self.arcs[k]
        if pt in (a[0], a[-1]):
            return
        best, bi = None, None
        for i in range(len(a) - 1):
            seg = LineString([a[i], a[i + 1]])
            dd = seg.distance(Point(pt))
            if best is None or dd < best:
                best, bi = dd, i
        if pt == a[bi + 1]:
            bi += 1
            first, second = a[:bi + 1], a[bi:]
        else:
            first, second = a[:bi + 1] + [pt], [pt] + a[bi + 1:]
        self.arcs[k] = first
        n = len(self.arcs)
        self.arcs.append(second)
        for p in self.P:
            for poly in p['g']:
                for ring in poly:
                    i = 0
                    while i < len(ring):
                        if ring[i] == k:
                            ring[i:i + 1] = [k, n]; i += 2
                        elif ring[i] == ~k:
                            ring[i:i + 1] = [~n, ~k]; i += 2
                        else:
                            i += 1

    def node_index(self, ring, pt):
        """Index in ring of the arc that starts at pt."""
        for i, r in enumerate(ring):
            a = self.arcs[r] if r >= 0 else self.arcs[~r][::-1]
            if a[0] == pt:
                return i
        raise ValueError('point is not a node of the ring')

    def split(self, pi, name, owner, inside, line):
        p = self.P[pi]
        # the polygon of the province that the line crosses
        cut = LineString(line)
        hits = [k for k, poly in enumerate(p['g']) if self.poly(poly[0]).intersects(cut)]
        assert len(hits) == 1, f'{p["n"]}: the line crosses {len(hits)} parts'
        gi = hits[0]
        ring = p['g'][gi][0]
        assert len(p['g'][gi]) == 1, 'holes are not handled'
        shape = self.poly(ring)
        pieces = shp_split(shape, cut)
        assert len(pieces.geoms) == 2, f'{p["n"]}: the line makes {len(pieces.geoms)} pieces'
        inner = shape.intersection(cut)
        assert inner.geom_type == 'LineString', inner.geom_type
        c0, c1 = list(inner.coords)[0], list(inner.coords)[-1]
        # snap the crossing points onto the boundary as nodes
        ends = []
        for c in (c0, c1):
            qp = self.q(*c)
            best, bk = None, None
            for r in ring:
                k = r if r >= 0 else ~r
                dd = LineString(self.arcs[k]).distance(Point(qp)) if len(self.arcs[k]) > 1 else 1e9
                if best is None or dd < best:
                    best, bk = dd, k
            self.split_arc_at(bk, qp)
            ends.append(qp)
            ring = p['g'][gi][0]
        # the new border, quantized, without repeated points
        mid = [self.q(*c) for c in list(inner.coords)[1:-1]]
        pts = [ends[0]] + mid + [ends[1]]
        pts = [pt for i, pt in enumerate(pts) if i == 0 or pt != pts[i - 1]]
        C = len(self.arcs)
        self.arcs.append(pts)
        i0, i1 = self.node_index(ring, ends[0]), self.node_index(ring, ends[1])
        rot = ring[i0:] + ring[:i0]
        j = (i1 - i0) % len(ring)
        a_side, b_side = rot[:j], rot[j:]           # ends[0] -> ends[1], ends[1] -> ends[0]
        ring_a = a_side + [~C]
        ring_b = b_side + [C]
        new_ring = ring_a if self.poly(ring_a).contains(Point(inside)) else ring_b
        old_ring = ring_b if new_ring is ring_a else ring_a
        assert self.poly(new_ring).contains(Point(inside)), 'the inside point is in neither piece'
        frac = self.poly(new_ring).area / shape.area
        p['g'][gi] = [old_ring]
        rp = self.poly(new_ring).representative_point()
        np_ = {'n': name, 'o': owner, 'a': max(1, round(p['a'] * frac)), 'x': round(rp.x, 2), 'y': round(rp.y, 2), 'c': 0,
               'pop': round((p.get('pop') or 0) * frac), 'nb': [], 'g': [[new_ring]]}
        p['a'] = max(1, p['a'] - np_['a'])
        orp = Polygon().union(self.poly(old_ring))
        if not orp.contains(Point(p['x'], p['y'])) and len(p['g']) == 1:
            r2 = orp.representative_point(); p['x'], p['y'] = round(r2.x, 2), round(r2.y, 2)
        if p.get('sea'):
            np_['sea'] = list(p['sea'])
        self.P.append(np_)
        return len(self.P) - 1

    def refresh(self, touched):
        """Recompute neighbours, coast flags and sea links for touched provinces from the arcs."""
        u = self.users()
        nb = {i: set() for i in range(len(self.P))}
        coast = set()
        for us in u:
            if len(us) == 1:
                coast.add(us[0])
            for a in us:
                for b in us:
                    if a != b:
                        nb[a].add(b)
        for i in touched:
            p = self.P[i]
            p['nb'] = sorted(nb[i])
            p['c'] = 1 if i in coast else 0
            if not p['c'] and p.pop('sea', None):
                for q in self.P:
                    if i in q.get('sea', []):
                        q['sea'].remove(i)
            for q in nb[i]:
                self.P[q]['nb'] = sorted(nb[q])
        # sea links are symmetric
        for i in touched:
            for q in self.P[i].get('sea', []):
                s = self.P[q].setdefault('sea', [])
                if i not in s:
                    s.append(i); s.sort()

    def save(self):
        used = set()
        for p in self.P:
            for poly in p['g']:
                for ring in poly:
                    for r in ring:
                        used.add(r if r >= 0 else ~r)
        assert used == set(range(len(self.arcs))) - {k for k in range(len(self.arcs)) if len(self.arcs[k]) < 2}
        self.d['arcs'] = [encode(a) for a in self.arcs]


def province(d, name, nation_names=None):
    """Province index by name (as built, or as renamed below), or 'Name@Country' to pick among same-named provinces."""
    year = str(d['year'])
    later = PLACE_NAMES.get(name, (None,) * 3)[YEAR_COL[year]]
    names = {name.split('@')[0], (later or name).split('@')[0]}
    cand = [i for i, p in enumerate(d['provinces']) if p['n'] in names]
    if '@' in name:
        x, y = MODERN[name.split('@')[1]]
        return min(cand, key=lambda i: (d['provinces'][i]['x'] - x) ** 2 + (d['provinces'][i]['y'] - y) ** 2)
    assert len(cand) == 1, f'{name}: {len(cand)} provinces'
    return cand[0]


def rename_places(d):
    col = YEAR_COL[str(d['year'])]
    done = 0
    for old, names in PLACE_NAMES.items():
        new = names[col]
        if not new:
            continue
        if '@' in old:
            i = province(d, old)
        else:
            cand = [i for i, p in enumerate(d['provinces']) if p['n'] == old]
            if len(cand) != 1:
                continue
            i = cand[0]
        if d['provinces'][i]['n'] != new:
            d['provinces'][i]['n'] = new
            done += 1
    return done


def nation(d, name):
    names = [n['name'] for n in d['nations']]
    if name not in names:
        d['nations'].append({'name': name, 'cap': -1, 'area': 0, 'great': False})
        names.append(name)
    return names.index(name)


def main():
    years = sys.argv[1:] or ['1900', '1939', '2003']
    for year in years:
        path = f'data/world-{year}.json'
        d = json.load(open(path))
        for old, new in RENAMES.get(year, {}).items():
            for n in d['nations']:
                if n['name'] == old:
                    n['name'] = new
        m = Map(d)
        touched = set()
        for pname, nname, owner, inside, line in SPLITS.get(year, []):
            if any(p['n'] == nname for p in d['provinces']):
                continue
            i = m.split(province(d, pname, None), nname, nation(d, owner), inside, line)
            touched |= {i, province(d, pname, None)}
            print(year, f'split {nname} from {pname}')
        if touched:
            m.refresh(touched)
            m.save()
        moved = 0
        for pname, owner in OWNERS.get(year, {}).items():
            i, o = province(d, pname, None), nation(d, owner)
            if d['provinces'][i]['o'] != o:
                d['provinces'][i]['o'] = o
                d['provinces'][i].pop('oc', None)
                moved += 1
        for nname, pname in CAPITALS.get(year, {}).items():
            n = nation(d, nname)
            d['nations'][n]['cap'] = province(d, pname, None)
            assert d['provinces'][d['nations'][n]['cap']]['o'] == n, f'{nname}: capital {pname} is not its own'
        # nations whose capital changed hands get their biggest province; drop nations left without land
        for i, n in enumerate(d['nations']):
            mine = [k for k, p in enumerate(d['provinces']) if p['o'] == i]
            if mine and (n['cap'] < 0 or d['provinces'][n['cap']]['o'] != i):
                n['cap'] = max(mine, key=lambda k: (d['provinces'][k].get('pop', 0), d['provinces'][k]['a']))
        keep = [i for i in range(len(d['nations'])) if any(p['o'] == i for p in d['provinces'])]
        remap = {old: new for new, old in enumerate(keep)}
        d['nations'] = [d['nations'][i] for i in keep]
        for p in d['provinces']:
            if p['o'] >= 0:
                p['o'] = remap[p['o']]
            if 'oc' in p:
                p['oc'] = remap[p['oc']]
        for i, n in enumerate(d['nations']):
            n['area'] = sum(p['a'] for p in d['provinces'] if p['o'] == i)
        renamed = rename_places(d)
        json.dump(d, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
        print(year, f'{moved} provinces changed hands, {renamed} renamed, {len(d["nations"])} nations')


if __name__ == '__main__':
    main()
