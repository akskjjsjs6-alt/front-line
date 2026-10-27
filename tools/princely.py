"""Build approximate outlines of the main princely states of British India (c. 1900-1939).

There is no open vector map of the princely states, but most of them line up well with groups of
today's districts (Hyderabad = Telangana + Marathwada + the Raichur Doab, Mysore = southern
Karnataka, ...). This dissolves geoBoundaries district outlines (gbOpen, CC BY 4.0) into one shape
per state (plus Natural Earth regions for Burma's Shan States) and writes tools/princely_states.geojson, which build_map.py carves out of British India.

    python3 tools/princely.py <IND-ADM2.geojson> <PAK-ADM2.geojson> <admin1.geojson>
"""
import json
import sys

from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

# state -> [(modern first-level region, [districts])]; small states are grouped into their agency
PRINCELY = {
    'Hyderabad': [('Telangana', '*'),
                  ('Maharashtra', ['Aurangabad', 'Jalna', 'Bid', 'Parbhani', 'Hingoli', 'Nanded', 'Latur', 'Osmanabad']),
                  ('Karnataka', ['Gulbarga', 'Bidar', 'Raichur', 'Yadgir', 'Koppal'])],
    'Mysore': [('Karnataka', ['Bangalore', 'Bangalore Rural', 'Mysore', 'Mandya', 'Chamarajanagar', 'Hassan', 'Tumkur', 'Kolar',
                              'Chikkaballapura', 'Chitradurga', 'Davanagere', 'Shimoga', 'Chikmagalur'])],
    'Travancore': [('Kerala', ['Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha', 'Kottayam', 'Idukki']),
                   ('Tamil Nadu', ['Kanniyakumari'])],
    'Cochin': [('Kerala', ['Ernakulam', 'Thrissur'])],
    'Jammu and Kashmir': [('Jammu and Kashmir', '*'), ('Ladakh', '*'), ('Azad Kashmir', '*'), ('Northern Areas', '*')],
    'Jodhpur': [('Rajasthan', ['Jodhpur', 'Barmer', 'Jalor', 'Pali', 'Nagaur'])],
    'Bikaner': [('Rajasthan', ['Bikaner', 'Churu', 'Ganganagar', 'Hanumangarh'])],
    'Jaisalmer': [('Rajasthan', ['Jaisalmer'])],
    'Jaipur': [('Rajasthan', ['Jaipur', 'Dausa', 'Sikar', 'Jhunjhunun', 'Sawai Madhopur'])],
    'Udaipur': [('Rajasthan', ['Udaipur', 'Rajsamand', 'Chittaurgarh', 'Bhilwara'])],
    'Rajputana States': [('Rajasthan', ['Alwar', 'Bharatpur', 'Dhaulpur', 'Karauli', 'Kota', 'Bundi', 'Baran', 'Jhalawar', 'Tonk',
                                        'Banswara', 'Dungarpur', 'Pratapgarh', 'Sirohi'])],
    'Gwalior': [('Madhya Pradesh', ['Gwalior', 'Bhind', 'Morena', 'Sheopur', 'Shivpuri', 'Guna', 'Ashoknagar', 'Vidisha', 'Ujjain',
                                    'Shajapur', 'Agar', 'Mandsaur', 'Neemuch'])],
    'Indore': [('Madhya Pradesh', ['Indore', 'Dewas', 'Dhar', 'Jhabua', 'Alirajpur', 'Barwani', 'Khargone (West Nimar)', 'Ratlam'])],
    'Bhopal': [('Madhya Pradesh', ['Bhopal', 'Sehore', 'Raisen'])],
    'Rewa': [('Madhya Pradesh', ['Rewa', 'Satna', 'Sidhi', 'Singrauli', 'Shahdol', 'Umaria', 'Anuppur'])],
    'Bundelkhand States': [('Madhya Pradesh', ['Datia', 'Tikamgarh', 'Niwari', 'Chhatarpur', 'Panna'])],
    'Baroda': [('Gujarat', ['Vadodara', 'Mahesana', 'Amreli', 'Navsari'])],
    'Kathiawar States': [('Gujarat', ['Rajkot', 'Jamnagar', 'Devbhumi Dwarka', 'Junagadh', 'Gir Somnath', 'Porbandar', 'Bhavnagar',
                                      'Batod', 'Morbi', 'Surendranagar', 'Banas Kantha', 'Sabar Kantha', 'Aravali',
                                      'Chhota Udaipur', 'Narmada', 'The Dangs'])],
    'Kutch': [('Gujarat', ['Kachchh'])],
    'Patiala': [('Punjab', ['Patiala', 'Sangrur', 'Barnala', 'Bathinda', 'Mansa', 'Fatehgarh Sahib'])],
    'Punjab Hill States': [('Himachal Pradesh', ['Chamba', 'Mandi', 'Bilaspur', 'Sirmaur', 'Kinnaur']),
                           ('Uttarakhand', ['Tehri Garhwal', 'Uttarkashi'])],
    'Bahawalpur': [('Punjab', ['Bahawalpur', 'Bahawalnagar', 'Rahim Yar Khan'])],
    'Khairpur': [('Sind', ['Khairpur'])],
    'Kalat': [('Baluchistan', ['Kalat', 'Mastung', 'Khuzdar', 'Kharan', 'Awaran', 'Lasbela', 'Panjgur', 'Kech', 'Jhal Magsi', 'Kachhi'])],
    'Bastar': [('Chhattisgarh', ['Bastar', 'Dakshin Bastar Dantewada', 'Bijapur', 'Sukma', 'Narayanpur', 'Kondagaon',
                                 'Uttar Bastar Kanker'])],
    'Chhattisgarh States': [('Chhattisgarh', ['Surguja', 'Koriya', 'Jashpur', 'Raigarh', 'Balrampur', 'Surajpur', 'Rajnandgaon',
                                              'Kabeerdham'])],
    'Orissa States': [('Odisha', ['Mayurbhanj', 'Kendujhar', 'Dhenkanal', 'Sundargarh', 'Kalahandi', 'Balangir', 'Debagarh', 'Baudh',
                                  'Nayagarh', 'Subarnapur'])],
    'Swat, Dir & Chitral': [('K.P.', ['Chitral', 'Upper Dir', 'Lower Dir', 'Swat', 'Shangla', 'Buner'])],
    # Burma's Shan and Karenni states come straight from Natural Earth's first-level regions
    'Shan States': [('@Myanmar', ['Shan', 'Kayah'])],
    'Sikkim': [('Sikkim', '*')],
    'Manipur': [('Manipur', '*')],
    'Tripura': [('Tripura', '*')],
}


def main():
    ind, pak, adm1 = sys.argv[1:4]
    every = json.load(open(adm1))['features']
    a1 = [f for f in every if f['properties']['admin'] in ('India', 'Pakistan', 'Siachen Glacier')]
    g1 = [shape(f['geometry']) for f in a1]
    tree = STRtree(g1)
    districts = []                                     # (region, name, geometry)
    for path in (ind, pak):
        for f in json.load(open(path))['features']:
            g = shape(f['geometry']).buffer(0)
            p = g.representative_point()
            hit = [i for i in tree.query(p) if g1[i].contains(p)] or [int(tree.nearest(p))]
            districts.append((a1[hit[0]]['properties']['name'], f['properties']['shapeName'], g))
    feats, used = [], set()
    for state, parts in PRINCELY.items():
        geoms = []
        for region, names in parts:
            if region.startswith('@'):              # whole first-level regions of another country
                for f in every:
                    if f['properties']['admin'] == region[1:] and f['properties']['name'] in names:
                        geoms.append(shape(f['geometry']).buffer(0)); used.add((region, f['properties']['name']))
                missing = [n for n in names if (region, n) not in used]
                if missing:
                    raise SystemExit(f'{state}: no region named {missing} in {region[1:]}')
                continue
            for k, (r, n, g) in enumerate(districts):
                if r == region and (names == '*' or n in names):
                    geoms.append(g); used.add((region, n))
            missing = [] if names == '*' else [n for n in names if (region, n) not in used]
            if missing:
                raise SystemExit(f'{state}: no district named {missing} in {region}')
        shp = unary_union(geoms).buffer(0.01).buffer(-0.01).simplify(0.01)   # close slivers between districts
        feats.append({'type': 'Feature', 'properties': {'name': state}, 'geometry': mapping(shp)})
    out = 'tools/princely_states.geojson'
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'))
    print(out, len(feats), 'states')


if __name__ == '__main__':
    main()
