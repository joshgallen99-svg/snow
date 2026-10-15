# Kitakaze Peak

A low-poly snowboarding game in a single self-contained HTML file, built with three.js. The resort is modelled on a Japanese volcano resort like Grand Hirafu: one snow-capped cone, runs fanning down through birch and fir forest to a village in the valley, a second base to the east, and an off-limits ravine on the west flank.

**Play:** open `index.html` in a modern browser. Everything (three.js included) is inlined, so it works offline. Google Fonts load if you're online and fall back to system fonts if you're not.

## What's in it

- **The whole mountain, generated in code.** A volcanic cone with radial ribs, a summit bowl, a rock-walled couloir, the east spur ridge, the ravine, a river through the valley and hills beyond. About 60,000 instanced fir and birch trees, rocks, a village of hotels and chalets with snowy roofs, icicles and lit windows, mountain huts, snowcats and a bridge.
- **Eight real 3D lifts.** A 10-person gondola, high-speed quads, a hooded six-pack, a vintage pair chair, T-bars and a beginner platter. Towers are placed to keep cable clearance over the terrain and stay out of the runs. Chairs and cabins run around the loop with sagging cables.
- **Thirteen runs**, rated green, red and black (Japanese trail-map convention). They mix tight forest cruisers, banked turns, rollers, kickers, a terrain park with boxes and rails, moguls, glades, deep powder, a cornice drop and cliff bands.
- **Live mountain cam.** The trail map is a real camera over the resort with thin trail-map lines: solid for groomed runs, dotted for ungroomed, orange for the park, yellow bands for night skiing and a red dotted line for the boundary. Hover a lift to light it up with a white and black outline. Locked areas sit under cloud that lifts as you open new terrain.
- **Riding.** Carving with edge grip and skids, tucking, ollies with charge and a pop at kicker lips, spins, flips, four grabs, combos, and 50-50s and boardslides on rails and boxes. Bad landings or hitting trees and rocks put you into a verlet ragdoll.
- **Snow that reacts.** Corduroy on the groomers, sun glitter, wind ripples in powder, spray off your edge, landing puffs, and a compacted trail behind you that's thin when you carve and wide when you skid.
- **Mood.** A day/night cycle with dawn, golden hour and floodlit night skiing. Weather moves between bluebird, overcast, snowing and whiteout. The generative lo-fi soundtrack shifts with the time of day, alongside wind, carving and skid audio.
- **Modes and progression.** Free ride or time trial (gates, splits, best times, optional ghost of your best run). Snowflake collectibles hover and spin on every run and unlock boards and outfits in the gear locker. Opening lifts depends on how many runs you've ridden.
- **Cameras.** Chase cam with speed FOV and shake, cinematic side cam on big air, slow-motion orbit (`C`), and lift ride shots.

## Controls

| Key | Action |
| --- | --- |
| `A` `D` / `←` `→` | Carve. In the air: spin |
| `W` / `↑` | Tuck. In the air: frontflip |
| `S` / `↓` | Skid / brake. In the air: backflip |
| `Space` | Hold to crouch, release to ollie. Jump off rails |
| `J` `K` `L` `I` | Indy, Melon, Tail and Nose grabs |
| `C` | Slow motion orbit camera (drag to look, scroll to zoom) |
| `R` | Respawn at your last safe spot |
| `E` | Ride the lift you're standing at |
| `M` | Mountain cam |
| `N` | Music on or off |
| `Esc` / `P` | Pause |

On the mountain cam, use a touchpad or mouse: hover a lift, click to choose, drag to pan, scroll or pinch to zoom, and right-drag or `Q`/`E` to rotate.

## Development

```sh
npm install            # three.js, used for the inlined build
node tools/build.mjs   # writes index.html from src/
```

Sources live in `src/` and are concatenated in filename order into `src/template.html`:

| File | What it does |
| --- | --- |
| `00_util.js` | Math helpers, seeded random, simplex noise |
| `01_config.js` | Resort layout: lifts, runs, features, gear |
| `02_terrain_gen.js` | Heightfield: volcano, ridges, gullies, carved run profiles |
| `03_world.js` | Height/normal queries, kickers, rails, colliders |
| `04_scatter.js` | Roads, village, forest, rocks, lamps, tokens, gates |
| `05_geo.js` | Low-poly geometry builder, shared shader patches |
| `06_terrain_mesh.js` | LOD terrain chunks and the snow shader |
| `07_vegetation.js` | Instanced trees with near/far LOD, rocks |
| `08_structures.js` | Lifts, buildings, park features, signs, river |
| `09_rider.js` | Procedural rider rig and ragdoll |
| `10_physics.js` | Input and rider physics, tricks, grinds, crashes |
| `11_sky.js` | Sky dome, day cycle, weather, snowfall, distant ranges |
| `12_fx.js` | Particles, snow trail, tokens, glows |
| `13_audio.js` | Synthesized sound effects and lo-fi music |
| `14_camera.js` | Camera modes and blending |
| `15_post.js` | HDR target, lift outline, speed blur, grading |
| `16_mapview.js` | Mountain cam overlays, labels, clouds, picking |
| `17_ui.js` | Menus, HUD, panels |
| `18_game.js` | Boot, state machine, run sessions, saves, main loop |

Headless checks (Node 22, Playwright with the bundled Chromium):

```sh
node tools/test_terrain.mjs   # run grades, cut/fill, writes a hillshade to tools/map.png
node tools/test_physics.mjs   # autopilot rides every run top to bottom
node tools/shot.mjs "title||3000" "map|Game.openMap()|5000"   # screenshots to tools/out/
```

Progress and settings save to the browser's local storage.
