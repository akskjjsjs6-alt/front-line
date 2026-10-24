# Front Line

An open-world grand strategy game in the browser. Pick a year (1900, 1939 or 2003), pick **any nation**, and play
in real time (pause and three speeds, like Hearts of Iron) while an AI game master runs every other country.

- **Write orders in plain words.** "Build railways", "demand the Danzig corridor", "fund drones". The AI judges
  what happens and writes a newspaper report each month.
- **Talk to any leader.** Open a diplomatic channel and negotiate in your own words: alliances, peace, land, trade.
  When a leader agrees to a deal, you can sign it.
- **A real world map.** About 2,300 real provinces (states, oblasts, governorates) over shaded terrain, with the
  borders of the chosen year. Zoom out to see the world, zoom in and the map and units grow, like Hearts of Iron.
- **Move armies anywhere.** Tap an army, then tap any spot on the map: it marches there and takes the enemy land it
  passes through. Armies are drawn with NATO map symbols: blue for you and your allies, red for enemies, green for
  neutrals. Tap a far coast to ship troops from a port.
- **Generals.** Put armies under a general and order him to hold a border, attack a nation, or take or defend a
  province, or just defend against every enemy (the default). He keeps re-planning as the war moves.
- **A living world.** Other nations follow their own ambitions and the real historical timeline by default
  (Fall Weiss, Barbarossa, the Iraq War...), declare wars on their own and send you demands and offers.
- **Fight battles yourself or let them play out.** Battles start when enemy armies meet; press *Command* to zoom down to a real-time
  battlefield and control every unit: draw front lines, call air strikes, take the objective.

## Run it

No build step. Serve the folder with any static server, for example:

```
python3 -m http.server
```

then open http://localhost:8000. For free hosting, turn on GitHub Pages (Settings → Pages → deploy from `main`).

## The AI game master

`supabase/functions/ai/index.ts` is a Supabase Edge Function that calls an AI model through
OpenRouter (all free models: it tries the fastest first and, if one is slow, starts the next and takes the first good
answer), Vercel AI Gateway or the Claude API. It needs one secret in the
Supabase project (Edge Functions → Secrets): `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY`.
Optionally set `AI_MODEL` to use a different model. When the server can't be reached, the game keeps working with simple built-in rules.

## Files

- `js/world.js`: world rules (nations, provinces, armies, wars, economy, computer-run militaries)
- `js/gm.js`: talks to the AI game master; offline fallback
- `js/map.js`: world map rendering and input
- `js/app.js`: screens, panels and the real-time game loop
- `battle/`: the real-time tactical battle engine, its AI, and the battle screen
- `data/`: world maps per period (see `data/CREDITS.md`)
- `tools/build_map.py`: rebuilds the map data from the source datasets

Map data: GPL-3.0 (historical-basemaps) and public domain (Natural Earth). See `data/CREDITS.md`.
