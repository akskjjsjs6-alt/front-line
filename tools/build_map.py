"""Build the world map data used by the game.

Provinces are real first-level administrative regions (Natural Earth admin-1, public domain), merged where a
country has too many and split where one is huge. Each province is assigned to the nation that held it in the
chosen year using historical borders (aourednik/historical-basemaps, GPL-3.0); where a historical border cuts a
region, the region is split along it. The result is written as TopoJSON-style shared arcs, so neighbouring
provinces share exact borders, plus a shaded-relief background image.

usage: python3 tools/build_map.py <source folder>
  The source folder holds world_1900.geojson, world_1914.geojson, world_1938.geojson, world_2000.geojson
  (historical-basemaps), admin1.geojson (ne_10m_admin_1_states_provinces), cities.geojson
  (ne_50m_populated_places_simple) and ne2/NE2_50M_SR_W/NE2_50M_SR_W.tif (Natural Earth II shaded relief).
"""
import json, math, os, sys, collections
import numpy as np
import shapely
from shapely.geometry import shape, Point, MultiPoint, Polygon, MultiPolygon, box
from shapely.ops import unary_union
from shapely import STRtree

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
LAT_MIN, LAT_MAX = -58.0, 84.0
QUANT = 100            # coordinates are stored in 1/100 degree
SIMPLIFY = 0.025       # degrees, topology-preserving

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nations import OWNERS, ALIAS, FILL_1914, CAPITALS, GREAT, KEEP_SUBJECT  # noqa: E402


def km2(g):
    """Approximate area in km^2 of a lon/lat geometry."""
    if g.is_empty:
        return 0.0
    lat = g.centroid.y
    return g.area * 111.32 * 111.32 * math.cos(math.radians(lat))


def clean(g):
    g = shapely.make_valid(g)
    if g.geom_type == 'GeometryCollection':
        g = unary_union([p for p in g.geoms if p.geom_type in ('Polygon', 'MultiPolygon')])
    return g.buffer(0)


# ------------------------------------------------------------------ base provinces (period independent)
def base_regions(cities):
    feats = json.load(open(os.path.join(SRC, 'admin1.geojson')))['features']
    cpts = [Point(c['properties']['longitude'], c['properties']['latitude']) for c in cities]
    cpop = [c['properties'].get('pop_max') or 0 for c in cities]
    ctree = STRtree(cpts)
    clip = box(-180, LAT_MIN, 180, LAT_MAX)
    by_country = collections.defaultdict(list)
    for f in feats:
        p = f['properties']
        g = clean(shape(f['geometry']).intersection(clip))
        if g.is_empty or km2(g) < 0.5:
            continue
        name = p.get('name_en') or p.get('name') or p.get('gn_name') or '?'
        if p.get('admin') == 'Syria' and name == 'UNDOF':
            continue
        pop = sum(cpop[int(j)] for j in ctree.query(g, predicate='intersects'))
        by_country[p['admin']].append({'name': name, 'region': (p.get('region') or '').strip(), 'geom': g, 'pop': pop})
    regions = []
    for country, rs in by_country.items():
        # countries split into dozens of tiny units: use their larger regions instead
        if len(rs) > 90:
            groups = collections.defaultdict(list)
            for r in rs:
                groups[r['region']].append(r)
            if 5 <= len(groups) <= 45 and '' not in groups:
                rs = [{'name': k, 'region': k, 'geom': clean(unary_union([x['geom'] for x in v])), 'pop': sum(x['pop'] for x in v)} for k, v in groups.items()]
        rs = merge_small(rs, max_count=60)
        for r in rs:
            r['country'] = country
            regions.extend(split_large(r))
    print('base regions', len(regions))
    return regions


def merge_small(rs, max_count):
    """Merge the smallest regions into the neighbour they share the most border with."""
    rs = [dict(r, area=km2(r['geom'])) for r in rs]
    def merge_one(i):
        r = rs[i]
        best, bl = None, 0
        for j, o in enumerate(rs):
            if j == i:
                continue
            if not r['geom'].buffer(0.02).intersects(o['geom']):
                continue
            l = r['geom'].buffer(0.02).intersection(o['geom']).area
            if l > bl:
                bl, best = l, j
        if best is None:      # an island: join the nearest region
            best = min((j for j in range(len(rs)) if j != i), key=lambda j: r['geom'].distance(rs[j]['geom']), default=None)
            if best is None or r['geom'].distance(rs[best]['geom']) > 1.5:
                return False
        o = rs[best]
        big = o if (o['pop'], o['area']) >= (r['pop'], r['area']) else r     # keep the name of the more populous part
        rs[best] = {'name': big['name'], 'region': big['region'], 'geom': clean(unary_union([o['geom'], r['geom']])),
                    'area': o['area'] + r['area'], 'pop': o['pop'] + r['pop']}
        rs.pop(i)
        return True
    # tiny bits first
    changed = True
    while changed and len(rs) > 1:
        changed = False
        for i in sorted(range(len(rs)), key=lambda i: rs[i]['area']):
            if rs[i]['area'] < 5000 and merge_one(i):
                changed = True
                break
    while len(rs) > max_count:
        i = min(range(len(rs)), key=lambda i: rs[i]['area'])
        if not merge_one(i):
            rs[i]['area'] = 1e12
    return rs


DIRS = ['East', 'Northeast', 'North', 'Northwest', 'West', 'Southwest', 'South', 'Southeast']
ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']


def tidy_name(name):
    """'Northeast Northeast Inner Mongolia 2' -> 'Northeast Inner Mongolia': one direction, no counter."""
    words = name.split()
    first = words[0] if words[0] in DIRS or words[0] == 'Central' else None
    while len(words) > 1 and (words[0] in DIRS or words[0] == 'Central'):
        words.pop(0)
    if len(words) > 1 and words[-1].isdigit():
        words.pop()
    return ' '.join(([first] if first else []) + words)


def split_large(r, limit=320000):
    a = km2(r['geom'])
    if a <= limit:
        return [r]
    k = min(9, int(round(a / 230000)))
    g = r['geom']
    minx, miny, maxx, maxy = g.bounds
    rng = np.random.default_rng(abs(hash(r['name'])) % 2**32)
    pts = []
    tries = 0
    from shapely.prepared import prep
    prepared = prep(g)
    while len(pts) < 600 and tries < 20000:
        x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        tries += 1
        if prepared.contains(Point(x, y)):
            pts.append((x * math.cos(math.radians(y)), y))
    pts = np.array(pts)
    cent = pts[rng.choice(len(pts), k, replace=False)]
    for _ in range(20):
        lab = ((pts[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            if (lab == j).any():
                cent[j] = pts[lab == j].mean(0)
    seeds = [(cx / max(0.2, math.cos(math.radians(cy))), cy) for cx, cy in cent]
    cells = shapely.voronoi_polygons(MultiPoint(seeds), extend_to=box(minx - 1, miny - 1, maxx + 1, maxy + 1))
    c0 = g.centroid
    out, used = [], collections.Counter()
    for cell in cells.geoms:
        piece = clean(g.intersection(cell))
        if piece.is_empty or km2(piece) < 2000:
            continue
        pc = piece.centroid
        ang = math.degrees(math.atan2(pc.y - c0.y, (pc.x - c0.x) * math.cos(math.radians(c0.y)))) % 360
        d = DIRS[int(((ang + 22.5) % 360) // 45)] if pc.distance(c0) > 1 else 'Central'
        used[d] += 1
        nm = f"{d} {r['name']}" + (f" {used[d]}" if used[d] > 1 else '')
        out.append({'name': nm, 'region': r['region'], 'geom': piece, 'country': r.get('country'), 'gen': True})
    # anything the cells missed goes to the nearest piece
    rest = clean(g.difference(unary_union([o['geom'] for o in out])))
    if not rest.is_empty and out:
        for part in getattr(rest, 'geoms', [rest]):
            j = min(range(len(out)), key=lambda j: out[j]['geom'].distance(part))
            out[j]['geom'] = clean(unary_union([out[j]['geom'], part]))
    return out or [r]


# ------------------------------------------------------------------ historical ownership
# Land the historical source puts on the wrong side of a border, as whole first-level regions of
# Natural Earth: year of the source map -> new owner -> [(country, [regions])]
OVERRIDES = {
    1900: {'Germany': [('France', ['Moselle', 'Bas-Rhin', 'Haute-Rhin'])],          # Alsace-Lorraine, 1871-1918
           'Russia': [('Turkey', ['Kars', 'Ardahan', 'Artvin'])]},                    # Russian 1878-1918
    1938: {'United Kingdom': [('Cameroon', ['Nord-Ouest', 'Sud-Ouest'])]},            # British Cameroons
}
PRINCELY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'princely_states.geojson')
PRINCELY = set()


def owner_of(props, year):
    n = (props.get('NAME') or '').strip()
    s = (props.get('SUBJECTO') or '').strip()
    if not n:
        return None
    over = OWNERS[year]
    if n in over:
        return over[n]
    if s and s != n and ALIAS.get(s, s) != n and s not in KEEP_SUBJECT:
        return ALIAS.get(s, s)
    return ALIAS.get(n, n)


def nation_shapes(year):
    src = {1939: 1938, 2003: 2000}.get(year, year)
    feats = json.load(open(os.path.join(SRC, f'world_{src}.geojson')))['features']
    parts = collections.defaultdict(list)
    unclaimed = []
    for f in feats:
        if not f['geometry']:
            continue
        g = clean(shape(f['geometry']))
        o = owner_of(f['properties'], src)
        (parts[o] if o else unclaimed).append(g)
    if src == 1900:
        # most of Africa is unclaimed in the 1900 source: fill it from the 1914 colonial borders
        africa = box(-20, -36, 55, 38)
        f14 = json.load(open(os.path.join(SRC, 'world_1914.geojson')))['features']
        un = unary_union(unclaimed).intersection(africa)
        for f in f14:
            nm = (f['properties'].get('NAME') or '').strip()
            if nm in FILL_1914 and f['geometry']:
                piece = clean(shape(f['geometry'])).intersection(un)
                if not piece.is_empty:
                    parts[FILL_1914[nm]].append(piece)
                    un = un.difference(piece)
        unclaimed = [un]
    shapes = {k: clean(unary_union(v)) for k, v in parts.items()}
    if src in OVERRIDES:
        a1 = json.load(open(os.path.join(SRC, 'admin1.geojson')))['features']
        for owner, items in OVERRIDES[src].items():
            want = {(c, r) for c, regs in items for r in regs}
            g = clean(unary_union([shape(f['geometry']).buffer(0) for f in a1 if (f['properties']['admin'], f['properties']['name']) in want]))
            for k in list(shapes):
                if k != owner and shapes[k].intersects(g):
                    shapes[k] = clean(shapes[k].difference(g))
            shapes[owner] = clean(unary_union([shapes.get(owner, g), g]))
    if src in (1900, 1938):
        # India's princely states (tools/princely_states.geojson, built by princely.py) carved out of British India
        raj = shapes['United Kingdom']
        for f in json.load(open(PRINCELY_FILE))['features']:
            g = clean(clean(shape(f['geometry'])).intersection(raj))
            if g.is_empty or km2(g) < 500:
                continue
            shapes[f['properties']['name']] = g
            PRINCELY.add(f['properties']['name'])
            raj = raj.difference(g)
        shapes['United Kingdom'] = clean(raj)
    return shapes


def assign(regions, shapes):
    names = sorted(shapes)
    geoms = [shapes[n] for n in names]
    tree = STRtree(geoms)
    out = []
    for r in regions:
        g = r['geom']
        area = km2(g)
        hits = []
        for j in tree.query(g):
            inter = g.intersection(geoms[j])
            a = km2(inter)
            if a > 0:
                hits.append((a, j, inter))
        hits.sort(key=lambda h: -h[0])
        covered = sum(h[0] for h in hits)
        if not hits or covered < area * 0.05:
            # coastline mismatch or unclaimed: nearest nation if close, else unclaimed land
            if hits:
                owner = hits[0][1]
            else:
                j = tree.query_nearest(g, max_distance=2.0)
                owner = int(j[0]) if len(j) else -1
            out.append(dict(r, owner=owner))
            continue
        main = hits[0]
        # princely states are small next to the modern regions they sit in: split for them more readily
        keep = [h for h in hits[1:] if h[0] >= (max(800, area * 0.03) if names[h[1]] in PRINCELY else max(2500, area * 0.15))]
        if not keep:
            out.append(dict(r, owner=main[1]))
            continue
        # split the region along the historical border
        pieces = []
        for h in keep:
            p = clean(h[2])
            p = unary_union([q for q in getattr(p, 'geoms', [p]) if km2(q) > max(300, h[0] * 0.05)]) if not p.is_empty else p
            if not p.is_empty:
                pieces.append((h[1], p))
        rest = clean(g.difference(unary_union([p for _, p in pieces])))
        c0 = g.centroid
        def label(p):
            pc = p.centroid
            ang = math.degrees(math.atan2(pc.y - c0.y, (pc.x - c0.x) * math.cos(math.radians(c0.y)))) % 360
            return DIRS[int(((ang + 22.5) % 360) // 45)]
        out.append(dict(r, geom=rest, owner=main[1]))
        for o, p in pieces:
            out.append(dict(r, name=f"{label(p)} {r['name']}", geom=p, owner=o, gen=True))
    return out, names


# ------------------------------------------------------------------ topology
def build_topology(provs):
    import topojson as tp
    geoms = shapely.coverage_simplify(np.array([p['geom'] for p in provs], dtype=object), SIMPLIFY)
    feats = []
    for i, g in enumerate(geoms):
        g = shapely.make_valid(g)
        if g.geom_type == 'GeometryCollection':
            g = unary_union([q for q in g.geoms if q.geom_type in ('Polygon', 'MultiPolygon')])
        provs[i]['simple'] = g
        feats.append({'type': 'Feature', 'properties': {'i': i}, 'geometry': shapely.geometry.mapping(g)})
    topo = tp.Topology({'type': 'FeatureCollection', 'features': feats}, prequantize=False, topology=True, shared_coords=False).to_dict()
    arcs = topo['arcs']
    geoms_out = [None] * len(provs)
    obj = next(iter(topo['objects'].values()))
    for gm in obj['geometries']:
        i = gm['properties']['i']
        if gm['type'] == 'Polygon':
            geoms_out[i] = [gm['arcs']]
        elif gm['type'] == 'MultiPolygon':
            geoms_out[i] = gm['arcs']
        else:
            geoms_out[i] = []
    # quantise + delta-encode arcs
    qarcs = []
    for arc in arcs:
        pts = [(int(round((x + 180) * QUANT)), int(round((LAT_MAX - y) * QUANT))) for x, y in arc]
        flat, px, py = [], 0, 0
        for x, y in pts:
            flat += [x - px, y - py]
            px, py = x, y
        qarcs.append(flat)
    return qarcs, geoms_out


def arc_users(geoms_out):
    users = collections.defaultdict(list)
    for i, polys in enumerate(geoms_out):
        for poly in polys or []:
            for ring in poly:
                for a in ring:
                    users[a if a >= 0 else ~a].append(i)
    return users


# ------------------------------------------------------------------ main
def build(year, regions, cities):
    shapes = nation_shapes(year)
    provs, names = assign(regions, shapes)
    provs = [p for p in provs if not p['geom'].is_empty and km2(p['geom']) > 25]
    for p in provs:
        p['owner_name'] = names[p['owner']] if p['owner'] >= 0 else None
    qarcs, geoms_out = build_topology(provs)
    users = arc_users(geoms_out)
    nb = collections.defaultdict(set)
    coast = set()
    for a, us in users.items():
        u = sorted(set(us))
        if len(u) == 1:
            coast.add(u[0])
        for x in u:
            for y in u:
                if x != y:
                    nb[x].add(y)
    # sea links between coastal provinces up to ~250 km apart
    cl = sorted(coast)
    cg = [provs[i]['simple'] for i in cl]
    tree = STRtree(cg)
    sea = collections.defaultdict(set)
    for k, i in enumerate(cl):
        for j in tree.query(cg[k], predicate='dwithin', distance=2.2):
            o = cl[int(j)]
            if o != i and o not in nb[i]:
                sea[i].add(o)
                sea[o].add(i)
    # city population and names
    cpts = [(Point(c['properties']['longitude'], c['properties']['latitude']), c['properties']) for c in cities]
    ptree = STRtree([p['simple'] for p in provs])
    pop = collections.Counter()
    city_in = {}
    for pt, cp in cpts:
        hit = ptree.query(pt, predicate='intersects')
        if len(hit):
            i = int(hit[0])
            pop[i] += cp.get('pop_max') or 0
            city_in.setdefault(cp.get('nameascii') or cp['name'], []).append(i)
            city_in.setdefault(cp['name'], []).append(i)
    # pieces cut off by the build get the name of their biggest city ("Hailar", not "Northeast Northeast Inner Mongolia 2")
    best = {}
    for pt, cp in cpts:
        hit = ptree.query(pt, predicate='intersects')
        if len(hit) and (cp.get('pop_max') or 0) > best.get(int(hit[0]), (-1, ''))[0]:
            best[int(hit[0])] = (cp.get('pop_max') or 0, cp['name'])
    taken = {p['name'] for p in provs if not p.get('gen')}
    for i, p in enumerate(provs):
        if not p.get('gen'):
            continue
        nm = best.get(i, (0, None))[1]
        if not nm or nm in taken:
            nm = tidy_name(p['name'])
        base, k = nm, 2
        while nm in taken:
            nm = f'{base} {ROMAN[k]}'; k += 1
        taken.add(nm)
        p['name0'], p['name'] = p['name'], nm
    out_p = []
    for i, p in enumerate(provs):
        lp = p['simple'].representative_point() if not p['simple'].is_empty else p['geom'].representative_point()
        try:
            lp = shapely.ops.polylabel(max(getattr(p['simple'], 'geoms', [p['simple']]), key=lambda q: q.area), 0.05)
        except Exception:
            pass
        out_p.append({
            'n': p['name'], 'o': p['owner'], 'a': int(round(km2(p['geom']) / 1000)) or 1,
            'x': round(lp.x, 2), 'y': round(lp.y, 2), 'c': int(i in coast),
            'pop': int(pop[i] // 1000), 'nb': sorted(nb[i]), 'g': geoms_out[i]
        })
        if p.get('name0'):
            out_p[-1]['n0'] = p['name0']                 # the generated name, for fix_borders.py rules; removed there
        if sea[i]:
            out_p[-1]['sea'] = sorted(sea[i])
    # nations and capitals
    used = collections.Counter(p['o'] for p in out_p if p['o'] >= 0)
    nations, remap = [], {}
    for k, name in enumerate(names):
        if not used[k]:
            continue
        mine = [i for i, p in enumerate(out_p) if p['o'] == k]
        want = CAPITALS.get(year, {}).get(name)
        cap = next((i for i in city_in.get(want, []) if out_p[i]['o'] == k), None) if want else None
        if cap is None:
            cap = max(mine, key=lambda i: (out_p[i]['pop'], out_p[i]['a']))
        remap[k] = len(nations)
        nations.append({'name': name, 'cap': cap, 'area': sum(out_p[i]['a'] for i in mine), 'great': name in GREAT.get(year, [])})
    for p in out_p:
        p['o'] = remap.get(p['o'], -1)
    data = {'year': year, 'quant': QUANT, 'latMax': LAT_MAX, 'latMin': LAT_MIN, 'nations': nations, 'provinces': out_p, 'arcs': qarcs}
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'world-{year}.json')
    with open(path, 'w') as fh:
        json.dump(data, fh, separators=(',', ':'), ensure_ascii=False)
    print(year, 'nations', len(nations), 'provinces', len(out_p), 'arcs', len(qarcs), 'MB', round(os.path.getsize(path) / 1e6, 2))


def relief():
    """Reproject the Natural Earth II relief to the game's Miller projection and save a JPEG."""
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    src = Image.open(os.path.join(SRC, 'ne2', 'NE2_50M_SR_W', 'NE2_50M_SR_W.tif')).convert('RGB')
    sw, sh = src.size
    W = 6144
    miller = lambda lat: 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))
    y0, y1 = miller(LAT_MAX), miller(LAT_MIN)
    H = int(round(W * (y0 - y1) / (2 * math.pi)))
    arr = np.asarray(src)
    rows = []
    for r in range(H):
        y = y0 - (r + 0.5) / H * (y0 - y1)
        lat = math.degrees(2.5 * math.atan(math.exp(0.8 * y)) - 0.625 * math.pi)
        rows.append(min(sh - 1, max(0, int((90 - lat) / 180 * sh))))
    cols = np.minimum(sw - 1, (np.arange(W) + 0.5) / W * sw).astype(int)
    out = arr[np.array(rows)][:, cols]
    img = Image.fromarray(out)
    img.save(os.path.join(OUT, 'relief.jpg'), quality=82, optimize=True, progressive=True)
    print('relief', W, H, round(os.path.getsize(os.path.join(OUT, 'relief.jpg')) / 1e6, 2), 'MB')


if __name__ == '__main__':
    what = sys.argv[2:] or ['relief', '1900', '1939', '2003']
    if 'relief' in what:
        relief()
    years = [int(y) for y in what if y.isdigit()]
    if years:
        cities = json.load(open(os.path.join(SRC, 'cities.geojson')))['features']
        regions = base_regions(cities)
        for y in years:
            build(y, regions, cities)
