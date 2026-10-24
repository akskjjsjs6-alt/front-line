"""Nation tables for build_map.py: who owned what in each source map, capitals and great powers."""

# territory name in the source map -> owning nation (keyed by source map year)
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
        "Emirate of Bin Shal'an": 'Saudi Arabia', 'Hail': 'Saudi Arabia', 'Hejaz': 'Saudi Arabia', 'Iran': 'Iran',
        'Dominion of Newfoundland': 'Newfoundland', 'Eritrea (Italy)': 'Italy', 'Ethiopia (Italy)': 'Italy', 'Italian Somaliland': 'Italy',
        'Union of South Africa': 'South Africa', 'Siam': 'Siam',
    },
    2000: {
        'Hong Kong': 'China', 'Puerto Rico': 'United States', 'American Samoa': 'United States', 'United States Virgin Islands': 'United States',
        'Greenland': 'Denmark', 'French Guiana': 'France', 'Guadeloupe': 'France', 'Martinique': 'France', 'Saint Martin': 'France',
        'Saint Barthelemy': 'France', 'Wallis and Futuna Islands': 'France', 'Netherlands Antilles': 'Netherlands', 'Anguilla': 'United Kingdom',
        'Montserrat': 'United Kingdom', 'Turks and Caicos Islands': 'United Kingdom', 'Niue': 'New Zealand', 'Western Sahara': 'Morocco',
        'Turkish Cypriot-administered area': 'Turkey', 'Rapa Nui': 'Chile', 'Byelarus': 'Belarus', 'Zaire': 'DR Congo',
        "Korea, Democratic People's Republic of": 'North Korea', 'Korea, Republic of': 'South Korea',
        'Tanzania, United Republic of': 'Tanzania', 'Gambia, The': 'Gambia', 'Burma': 'Myanmar',
    },
}
# SUBJECTO values that name an empire differently
ALIAS = {'United Kingdom of Great Britain and Ireland': 'United Kingdom', 'Empire of Japan': 'Japan', 'Imperial Japan': 'Japan',
         'United States of America': 'United States'}
# SUBJECTO values that are not real overlords in the source data
KEEP_SUBJECT = {'Fiji', 'Tonga', 'Samoa', 'Chile', 'Bhutan', 'Luxembourg', 'Haiti', 'Dominican Republic', 'Nicaragua', 'Costa Rica',
                'Philippines', 'Argentina', 'Switzerland', 'Cuba', 'Qatar', 'Oman', 'Mali', 'Niger', 'Chad', 'Vietnam', 'China', 'Cyprus',
                'Western Sahara', 'United Arab Emirates', 'Japan', 'Italy', 'Russia', 'Laos', 'Puerto Rico', 'Jamaica', 'Ceylon', 'Egypt',
                'American Samoa', 'Wallis and Futuna Islands', 'Māori', 'Trucial Oman'}

# 1914 colonies used to fill Africa in the 1900 map
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

# capital city (Natural Earth name) per game year
CAPITALS = {
    1900: {'United Kingdom': 'London', 'France': 'Paris', 'Germany': 'Berlin', 'Russia': 'St. Petersburg', 'Austria-Hungary': 'Vienna',
           'United States': 'Washington, D.C.', 'Japan': 'Tokyo', 'Italy': 'Rome', 'Ottoman Empire': 'Istanbul', 'Qing China': 'Beijing',
           'Spain': 'Madrid', 'Portugal': 'Lisbon', 'Netherlands': 'Amsterdam', 'Belgium': 'Brussels', 'Denmark': 'Kobenhavn',
           'Brazil': 'Rio de Janeiro', 'Sweden-Norway': 'Stockholm', 'Persia': 'Tehran', 'Egypt': 'Cairo', 'Arabia': 'Riyadh',
           'Siam': 'Bangkok', 'Korea': 'Seoul', 'Afghanistan': 'Kabul', 'Ethiopia': 'Addis Ababa', 'Greece': 'Athens',
           'Transvaal': 'Pretoria', 'Orange Free State': 'Bloemfontein', 'Mexico': 'Mexico City', 'Argentina': 'Buenos Aires'},
    1939: {'United Kingdom': 'London', 'France': 'Paris', 'Germany': 'Berlin', 'USSR': 'Moscow', 'United States': 'Washington, D.C.',
           'Japan': 'Tokyo', 'Italy': 'Rome', 'China': 'Nanjing', 'Poland': 'Warsaw', 'Czechoslovakia': 'Prague', 'Turkey': 'Ankara',
           'Spain': 'Madrid', 'Portugal': 'Lisbon', 'Netherlands': 'Amsterdam', 'Belgium': 'Brussels', 'Denmark': 'Kobenhavn',
           'Brazil': 'Rio de Janeiro', 'Canada': 'Ottawa', 'Australia': 'Canberra', 'Saudi Arabia': 'Riyadh', 'Iran': 'Tehran',
           'South Africa': 'Pretoria', 'Hungary': 'Budapest', 'Romania': 'Bucharest', 'Yugoslavia': 'Belgrade', 'Greece': 'Athens',
           'Finland': 'Helsinki', 'Sweden': 'Stockholm', 'Norway': 'Oslo'},
    2003: {'United States': 'Washington, D.C.', 'Russia': 'Moscow', 'China': 'Beijing', 'United Kingdom': 'London', 'France': 'Paris',
           'Germany': 'Berlin', 'Japan': 'Tokyo', 'India': 'New Delhi', 'Canada': 'Ottawa', 'Brazil': 'Brasilia', 'Australia': 'Canberra',
           'Iraq': 'Baghdad', 'Iran': 'Tehran', 'Israel': 'Jerusalem', 'Turkey': 'Ankara', 'Pakistan': 'Islamabad', 'Saudi Arabia': 'Riyadh',
           'South Korea': 'Seoul', 'North Korea': 'Pyongyang', 'Italy': 'Rome', 'Ukraine': 'Kiev', 'Poland': 'Warsaw', 'Egypt': 'Cairo',
           'Kazakhstan': 'Astana', 'Nigeria': 'Abuja', 'South Africa': 'Pretoria', 'Denmark': 'Kobenhavn', 'Sweden': 'Stockholm',
           'Syria': 'Damascus'},
}
CAPITALS[1938] = CAPITALS[1939]

GREAT = {
    1900: ['United Kingdom', 'France', 'Germany', 'Russia', 'Austria-Hungary', 'United States', 'Japan', 'Italy', 'Ottoman Empire', 'Qing China', 'Spain'],
    1939: ['United Kingdom', 'France', 'Germany', 'USSR', 'United States', 'Japan', 'Italy', 'China', 'Poland', 'Czechoslovakia', 'Turkey', 'Spain'],
    2003: ['United States', 'Russia', 'China', 'United Kingdom', 'France', 'Germany', 'Japan', 'India', 'Iraq', 'Iran', 'Israel', 'Turkey',
           'Pakistan', 'Brazil', 'Saudi Arabia', 'South Korea', 'North Korea', 'Italy', 'Ukraine', 'Poland', 'Egypt'],
}
