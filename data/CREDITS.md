# Map data credits

- **Provinces** come from Natural Earth's first-level administrative regions
  ([ne_10m_admin_1_states_provinces](https://www.naturalearthdata.com/)), public domain. Some are merged or split
  for gameplay.
- **Historical borders** used to decide who owned each province in 1900, 1939 and 2003 come from
  [historical-basemaps](https://github.com/aourednik/historical-basemaps) by André Ourednik and contributors,
  licensed under the **GNU General Public License v3.0**. The derived files `world-1900.json`, `world-1939.json`
  and `world-2003.json` are therefore distributed under GPL-3.0. The 1900 African colonial borders are filled in
  from the same project's 1914 map.
- **Terrain** (`relief.jpg`) is Natural Earth II shaded relief (1:50m), public domain, reprojected to the game's
  Miller projection.
- **City names and populations** come from Natural Earth's populated places (public domain).

All of it is rebuilt by `tools/build_map.py`. Borders are approximate and simplified for gameplay.
- **Princely states of India** (1900 and 1939 maps) are approximated from groups of modern district outlines from
  [geoBoundaries](https://www.geoboundaries.org/) (gbOpen, CC BY 4.0; Runfola et al. 2020), plus Natural Earth regions for
  Burma's Shan States. See `tools/princely.py`.
