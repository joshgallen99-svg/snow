# Kitakaze Peak

A low-poly snowboarding game in a single self-contained HTML file, built with three.js. The resort is modelled on a Japanese volcano resort like Grand Hirafu: one snow-capped cone, runs fanning down through birch and fir forest to a village in the valley, a second base to the east, and an off-limits ravine on the west flank.

**Play:** open `index.html` in a modern browser. Everything (three.js included) is inlined, so it works offline. Google Fonts load if you're online and fall back to system fonts if you're not.

## What's in it

- **The whole mountain, generated in code.** A volcanic cone with radial ribs, a summit bowl, a rock-walled couloir, the east spur ridge, the ravine, a river through the valley and hills beyond. About 60,000 instanced fir and birch trees, rocks, a village of hotels and chalets with snowy roofs, icicles and lit windows, mountain huts, snowcats and a bridge.
- **Nine real 3D lifts.** A 10-person gondola, high-speed quads, a hooded six-pack, a vintage pair chair, T-bars and a beginner platter. Towers are placed to keep cable clearance over the terrain and stay out of the runs. Chairs and cabins run around the loop with sagging cables.
- **Seventeen runs**, rated green, red and black (Japanese trail-map convention). They mix tight forest cruisers, banked turns, rollers, side hits, kickers, a terrain park with boxes and rails, fallen-log jibs, moguls, glades, powder pillows, natural halfpipe gullies, deep powder, a cornice drop and cliff bands.
- **The back side.** The Kita Back Quad climbs the north face to three more runs: Ura Bowl (steep pillowy powder), Snake Gully (a winding natural halfpipe) and the Kita Traverse, a cat track that switchbacks right across both of them. On the front, the Kogane Traverse weaves back and forth across Center Course and Wonderland. Where runs cross, the traverse makes a bench you can drop onto and air off.
- **Live mountain cam.** The trail map is a real camera over the resort with thin trail-map lines: solid for groomed runs, dotted for ungroomed, orange for the park, yellow bands for night skiing and a red dotted line for the boundary. Hover a lift to light it up with a white and black outline. Locked areas sit under cloud that lifts as you open new terrain.
- **The rider.** Dressed in black by default: a padded jacket with zipper and pockets, baggy pants, a round helmet, a face mask and red mirror goggles that reflect the sky, plus gloves, boots and bindings with straps and buckles. Change boards, jackets, pants, helmets and goggle lenses in the gear locker.
- **Riding.** Carving with edge grip and skids, tucking, ollies and nollies with charge and a pop at kicker lips, nose and tail presses and butter spins, spins, flips, corks, rodeos and mistys, ten grabs that tweak the longer you hold them, and combos that chain across the ground, air and rails. On rails and boxes: 50-50s, boardslides, nose and tail presses, noseslides and tailslides, 90 and 180 switch-ups, spins on and spins out. Touching a rail snaps you on and brings up a balance bar whose needle wanders on its own: keep it in the middle with A and D or slip off, and jump off with Space. Releasing Space right at the edge of a kicker lip gives a perfect pop with extra speed and height, and you fall a little faster than you rise. Bad landings or head-on hits put you into a verlet ragdoll that also collides with trees and buildings. Glancing hits slide you along obstacles, buildings and lift stations have their real box shapes, box rails have solid sides (ride up the ramp or ollie on), and steps too tall to ride up act as walls.
- **Deep snow that compacts.** A layer of fresh snow sits on the ground around you: about 13 cm on groomers, 30 cm off-piste and 60 cm in powder. Your board presses a groove into it, with a lip where the snow is pushed aside. Skids smear a wide path, landings punch a bigger print, a crash leaves a body-shaped hole, and trees and rocks have wells around them. Deep powder bogs you down when you're slow and lets you plane when you're fast.
- **Snow detail.** Corduroy on the groomers, sun glitter that packed snow doesn't have, wind ripples, fine grain up close and needle litter under the trees. Brushing low branches knocks their snow loose.
- **Snow spray.** Particles are lit, noise-eroded puffs and sparkling chunks, emitted per metre travelled so the amount doesn't depend on frame rate. Carves throw a sheet off the edge, skids scrape a wide fan, powder kicks up a rooster tail that hangs in the air and drifts with the wind, the nose pushes a bow wave in deep snow, butters smear snow around the pivot, rails shed flecks, and landings and crashes throw out chunks that settle on the surface under a rolling cloud.
- **Life on the mountain.** About 120 skiers and riders carve down the runs and step aside for you, chairs carry passengers, and T-bars drag skiers up the track. Up near the treeline the firs turn into rime-caked snow monsters.
- **Lights.** Lanterns along the village streets, festoon strings over the main street and lodge decks, door lamps, LED floods at every lift station, light towers along the park, amber lights on lift towers, and snowcats with headlights and beacons. Lights glow from far away and throw beams in falling snow.
- **Mood.** A day/night cycle with dawn, golden hour and floodlit, moonlit night skiing. Weather moves between bluebird, overcast, snowing and whiteout. The generative lo-fi soundtrack shifts with the time of day, alongside wind, carving and skid audio.
- **Modes and progression.** Free ride or time trial (gates, splits, best times, optional ghost of your best run). Snowflake collectibles hover and spin on every run and unlock boards and outfits in the gear locker. Opening lifts depends on how many runs you've ridden.
- **Speed.** The view widens up to about 93° and tucks low as you speed up, with edge blur, speed lines, ice crystals whipping past, a roaring and whistling wind and board chatter.
- **Cameras.** A chase cam that glides in the air instead of bobbing and holds steady while you spin, an optional side-on jump cam, slow-motion orbit (`C`), and lift ride shots.

## Controls

| Key | Action |
| --- | --- |
| `A` `D` / `←` `→` | Carve. In the air: spin |
| `W` / `↑` | Tuck. In the air: frontflip |
| `S` / `↓` | Skid / brake. In the air: backflip |
| `Space` | Hold to crouch, release to ollie. Jump off rails |
| `Q` / `F` | Nose or tail press. Add `A`/`D` to butter-spin. On a rail: noseslide, tailslide, presses |
| `W` / `S` on a rail | 180 switch-up / switch between 50-50 and boardslide |
| `J` `K` `L` `I` | Indy, Melon, Tail and Nose grabs. Two at once: Method, Japan, Stalefish, Mute, Crail, Truck Driver |
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
| `12b_snow.js` | The deformable fresh-snow layer and its compaction map |
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
node tools/test_tricks.mjs    # butters, presses, switch-ups, spin-ons, combo grabs, corks
node tools/scene.mjs '[["run","summitbowl",300,16],["sim",1],["shot","powder"]]'   # stepped scene screenshots
node tools/shot.mjs "title||3000" "map|Game.openMap()|5000"   # screenshots to tools/out/
```

Progress and settings save to the browser's local storage.
