# Front Line

A real-time war game in the style of *War of Dots* and *Lines of Battle*, with units drawn as NATO (APP-6) map symbols.

- Units paint territory as they move and fight on contact.
- Select several units and drag a line to spread them along a front.
- Supply flows from your home edge and supply cities; cut-off units weaken.
- Cities earn funds to deploy new units. Take the enemy capital to win at once.

## Battles

| Year | Battle | Sides |
|------|--------|-------|
| 1900 | Road to Pretoria (Second Boer War) | British Empire vs Boer Republics |
| 1939 | Fall Weiss (Invasion of Poland) | Germany vs Poland |
| 2003 | Thunder Run (Invasion of Iraq) | Coalition vs Iraq |

Play either side against an AI commander at three difficulty levels.

## Run it

No build step. Open `index.html` through any static web server, for example:

```
python3 -m http.server
```

then visit http://localhost:8000. To host it free, turn on GitHub Pages for this repository (Settings → Pages → deploy from the `main` branch).

## Files

- `engine.js`: the simulation (movement, combat, territory, supply, victory)
- `ai.js`: the enemy commander
- `scenarios.js`: maps, cities and orders of battle
- `symbols.js`: NATO symbol drawing
- `ui.js`, `index.html`, `style.css`: rendering, controls and menus
