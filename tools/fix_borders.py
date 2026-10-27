"""Correct the borders of the built 1900 and 1939 maps against the historical record.

The historical-basemaps source is coarse in places (Africa in 1900 still shows kingdoms that had
already been conquered, the Caucasus in 1900 is Persian, eastern Turkey in 1939 is Soviet and
French...). This pass fixes ownership province by province, using the modern country each
province lies in plus a few province names.

Run after build_map.py, on freshly built data (it is not meant to run twice):
    python3 tools/fix_borders.py <srcdir with admin1.geojson> [1900 1939]
"""
import json
import os
import sys

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

UK, FR, DE, PT, BE, IT, ES, US, NL, DK, JP = ('United Kingdom', 'France', 'Germany', 'Portugal', 'Belgium', 'Italy',
                                              'Spain', 'United States', 'Netherlands', 'Denmark', 'Japan')

# Kingdoms the 1900 source shows as independent although the colonial powers had taken them by 1900.
GONE_1900 = {'Sokoto Caliphate', 'Tukular Caliphate', 'Sultanate of Utetera', 'Kanem-Bornu', 'Mossi States', 'First Samori Empire',
             'Second Samori Empire', 'Yeke', 'Mirambo Unyanyembe Ukimbu', 'Lozi', 'Shona', 'Borgu States', 'Barotse', 'Teke', 'Mbailundu',
             'Bunyoro', 'Kuba', 'Ovimbundu', 'Buganda', 'Asante', 'Lunda', 'Ndebele', 'Ibadan', 'Yaka', 'Ngwato', 'Nguni', 'Rwanda', 'Oyo',
             'Burundi', 'Benin', 'Ato trading confederacy', 'Kong'}
# Who ruled each (modern) African country in January 1900.
COLONY_1900 = {
    'Nigeria': UK, 'Niger': FR, 'Chad': FR, 'Cameroon': DE, 'Benin': FR, 'Togo': DE, 'Ghana': UK, 'Ivory Coast': FR,
    'Burkina Faso': FR, 'Mali': FR, 'Guinea': FR, 'Senegal': FR, 'Mauritania': FR, 'Democratic Republic of the Congo': BE,
    'Republic of the Congo': FR, 'Gabon': FR, 'Central African Republic': FR, 'Angola': PT, 'Zambia': UK, 'Zimbabwe': UK,
    'Malawi': UK, 'Mozambique': PT, 'United Republic of Tanzania': DE, 'Rwanda': DE, 'Burundi': DE, 'Uganda': UK, 'Kenya': UK,
    'Botswana': UK, 'Namibia': DE, 'Guinea Bissau': PT, 'Sierra Leone': UK, 'Eritrea': IT, 'Somaliland': UK,
}
ISLANDS_1900 = {
    'Bermuda': UK, 'Falkland Islands': UK, 'Mauritius': UK, 'Seychelles': UK, 'Maldives': UK, 'Saint Helena': UK, 'Fiji': UK,
    'Solomon Islands': UK, 'Pitcairn Islands': UK, 'Norfolk Island': UK, 'South Georgia': UK, 'British Indian Ocean': UK,
    'Indian Ocean Territories': UK, 'Heard Island': UK, 'Kiribati': UK, 'Cook Islands': UK, 'Vanuatu': UK, 'Cayman Islands': UK,
    'British Virgin Islands': UK, 'Bahrain': UK, 'United Arab Emirates': UK, 'Cyprus': UK, 'Northern Cyprus': UK,
    'Akrotiri Sovereign Base Area': UK, 'Dhekelia Sovereign Base Area': UK, 'Cape Verde': PT, 'Sao Tome and Principe': PT,
    'Macau S.A.R': PT, 'Comoros': FR, 'French Polynesia': FR, 'New Caledonia': FR, 'French Southern': FR,
    'Saint Pierre and Miquelon': FR, 'Federated States of Micronesia': DE, 'Marshall Islands': DE, 'Palau': DE,
    'Northern Mariana Islands': DE, 'Nauru': DE, 'Faroe Islands': DK, 'Puerto Rico': US, 'Cuba': US,
    'US Naval Base Guantanamo Bay': US, 'Guam': US, 'Taiwan': JP,
}
ISLANDS_1939 = {
    'Bermuda': UK, 'Falkland Islands': UK, 'Mauritius': UK, 'Seychelles': UK, 'Maldives': UK, 'Saint Helena': UK, 'Fiji': UK,
    'Solomon Islands': UK, 'Pitcairn Islands': UK, 'South Georgia': UK, 'British Indian Ocean': UK, 'Indian Ocean Territories': UK,
    'Kiribati': UK, 'Cayman Islands': UK, 'British Virgin Islands': UK, 'Malta': UK, 'Guernsey': UK, 'Jersey': UK,
    'Cape Verde': PT, 'Sao Tome and Principe': PT, 'Macau S.A.R': PT, 'Comoros': FR, 'French Polynesia': FR,
    'French Southern': FR, 'Saint Pierre and Miquelon': FR, 'Aruba': NL, 'Faroe Islands': DK,
    'Federated States of Micronesia': JP, 'Marshall Islands': JP, 'Palau': JP, 'Northern Mariana Islands': JP,
    'Nauru': 'Australia', 'Norfolk Island': 'Australia', 'Heard Island': 'Australia', 'Cook Islands': 'New Zealand',
}
# Provinces of China held by Japan in March 1939: still Chinese, but occupied when the game starts.
OCCUPIED_1939 = {'Beijing', 'Tianjin', 'Hebei', 'Shandong', 'Shanxi', 'Jiangsu', 'Shanghai', 'Anhui', 'Hubei', 'Guangdong', 'Hainan',
                 'East Inner Mongolia'}


def aden(name):
    """Province in the British Aden colony and protectorate (south Yemen)."""
    return any(k in name for k in ("'Adan", 'Abyan', 'Shabwah', 'Hadhramaut', 'Mahrah'))


def rules_1900(c, owner, name):
    """New owner for a province in 1900 (or None to leave it)."""
    if c in COLONY_1900 and (owner in GONE_1900 or owner != COLONY_1900[c]):
        return COLONY_1900[c]
    if owner in GONE_1900:
        return {'South Africa': UK, 'Ethiopia': 'Ethiopia', 'Sudan': UK, 'S. Sudan': UK}.get(c, UK)
    for k, v in ISLANDS_1900.items():
        if c.startswith(k):
            return v
    if c in ('Armenia', 'Azerbaijan', 'Georgia'):
        return 'Russia'                                      # Russian since the 1820s, not Persian
    if c == 'Chile':
        return 'Chile'                                       # the Atacama was Chilean after the War of the Pacific
    if c in ('Libya', 'Kosovo') or (c in ('Iraq', 'Jordan', 'Syria') and owner == 'Arabia'):
        return 'Ottoman Empire'
    if c == 'Egypt':
        return 'Egypt'                                       # Sinai included
    if c == 'Oman':
        return 'Oman'
    if c == 'Somalia':
        return UK if name in ('Lower Juba', 'Middle Juba') else IT
    if c == 'Yemen':
        return UK if aden(name) else 'Ottoman Empire'       # Aden and its protectorate; the north is Ottoman
    if c == 'Bulgaria' and name in ('South Burgas', 'South Yambol', 'South Sofia', 'Kyustendil'):
        return 'Bulgaria'                                    # Eastern Rumelia joined Bulgaria in 1885
    if (c == 'Myanmar' and owner == 'Siam') or (c == 'Guyana' and owner != UK):
        return UK
    if c in ('Germany', 'Portugal', 'France', 'Colombia', 'Ecuador') and owner != {'Germany': DE}.get(c, c):
        return {'Germany': DE}.get(c, c)
    if c == 'India' and name.startswith('Andaman'):
        return UK
    if c in ('Australia', 'New Zealand', 'Papua New Guinea') and owner is None:
        return UK
    return None


def rules_1939(c, owner, name):
    for k, v in ISLANDS_1939.items():
        if c.startswith(k):
            return v
    if c == 'Turkey':
        return 'Turkey'                                      # eastern Turkey is not Soviet or French in 1939
    if c in ('Jordan', 'Kuwait'):
        return UK                                            # Transjordan and Kuwait were British-ruled, not Iraqi
    if c == 'Czech Republic':
        return DE                                            # Bohemia and Moravia, occupied 15 March 1939
    if c == 'Slovakia' and owner == 'Czechoslovakia':
        return 'Slovakia'
    if c == 'Ukraine' and owner == 'Czechoslovakia':
        return 'Hungary'                                     # Carpatho-Ukraine, March 1939
    if name == 'Klaipėda':
        return DE                                            # Memel, March 1939
    if c in ('Rwanda', 'Burundi'):
        return BE                                            # Ruanda-Urundi mandate
    if c == 'Yemen':
        return UK if aden(name) else 'Yemen'
    if c == 'Russia' and owner == US:
        return 'USSR'
    if c in ('Portugal', 'France', 'Norway', 'Colombia', 'Ecuador', 'Australia', 'New Zealand') and owner != c:
        return c
    if c == 'Papua New Guinea' and owner is None:
        return 'Australia'
    if c == 'India' and name.startswith('Andaman'):
        return UK
    return None


NEW_NATIONS = {'1939': {'Slovakia': 'Bratislava'}}
CAPITALS = {'1939': {'China': 'Chongqing'}}            # wartime capital: Nanjing had fallen in 1937


def main():
    src = sys.argv[1]
    years = sys.argv[2:] or ['1900', '1939']
    feats = json.load(open(os.path.join(src, 'admin1.geojson')))['features']
    geoms = [shape(f['geometry']) for f in feats]
    tree = STRtree(geoms)

    def modern(p):
        pt = Point(p['x'], p['y'])
        hit = [i for i in tree.query(pt) if geoms[i].contains(pt)] or [int(tree.nearest(pt))]
        return feats[hit[0]]['properties']['admin']

    for year in years:
        path = f'data/world-{year}.json'
        d = json.load(open(path))
        names = [n['name'] for n in d['nations']]
        for nn in NEW_NATIONS.get(year, {}):
            names.append(nn)
            d['nations'].append({'name': nn, 'cap': -1, 'area': 0, 'great': False})
        idx = {n: i for i, n in enumerate(names)}
        rule = rules_1900 if year == '1900' else rules_1939
        moved = 0
        for p in d['provinces']:
            owner = names[p['o']] if p['o'] >= 0 else None
            new = rule(modern(p), owner, p['n'])
            if new and new != owner:
                p['o'] = idx[new]
                moved += 1
            if year == '1939' and p['n'] in OCCUPIED_1939 and owner == 'China':
                p['oc'] = idx[JP]
        # capitals of new nations, and of nations whose capital changed hands
        for nn, capname in NEW_NATIONS.get(year, {}).items():
            d['nations'][idx[nn]]['cap'] = next(i for i, p in enumerate(d['provinces']) if p['n'] == capname)
        for nn, capname in CAPITALS.get(year, {}).items():
            d['nations'][idx[nn]]['cap'] = next(i for i, p in enumerate(d['provinces']) if p['n'] == capname)
        for i, n in enumerate(d['nations']):
            mine = [k for k, p in enumerate(d['provinces']) if p['o'] == i]
            if mine and d['provinces'][n['cap']]['o'] != i:
                n['cap'] = max(mine, key=lambda k: (d['provinces'][k]['pop'], d['provinces'][k]['a']))
        # drop nations left without land, renumber owners
        keep = [i for i in range(len(d['nations'])) if any(p['o'] == i for p in d['provinces'])]
        gone = [d['nations'][i]['name'] for i in range(len(d['nations'])) if i not in keep]
        remap = {old: new for new, old in enumerate(keep)}
        d['nations'] = [d['nations'][i] for i in keep]
        for p in d['provinces']:
            if p['o'] >= 0:
                p['o'] = remap[p['o']]
            if 'oc' in p:
                p['oc'] = remap[p['oc']]
        for i, n in enumerate(d['nations']):
            n['area'] = sum(p['a'] for p in d['provinces'] if p['o'] == i)
        json.dump(d, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
        print(year, f'{moved} provinces moved; removed: {", ".join(gone) or "none"}; added: {", ".join(NEW_NATIONS.get(year, {})) or "none"}')


if __name__ == '__main__':
    main()
