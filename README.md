# RS-01: Reyhaan S · Aerospace 3D Portfolio

A cinematic, real-time WebGL portfolio. A detailed fighter jet flies through a dark
high-altitude environment behind a HUD-style interface, and the scene continues as
you scroll, turning the whole page into one continuous flight.

| Section  | Scene |
|----------|-------|
| Home     | The jet roams the sky, crossing behind the title, with clouds, dust, speed streaks and distant beacons streaming past |
| About    | The camera glides alongside the cockpit |
| Skills   | The jet flies through a lit structural hangar tunnel |
| Projects | A chase camera follows the jet through holographic mission gates, with a lock-on reticle |
| Training | A top-down view over a sweeping radar and flight-training scope |
| Contact  | The jet homes in on a comms beacon at first light |

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # → dist/  (static, deploy anywhere)
npm run preview
```

The build uses a relative base (`./`), so `dist/` works on GitHub Pages, Netlify,
Vercel or any sub-path without extra configuration.

## Editing content

All portfolio copy is plain semantic HTML in **`index.html`**: About, Skills,
Projects (the "mission" cards), Training and Contact. The content stays readable
without JavaScript or WebGL.

## Layers

```
background → 3D environment → fighter jet → atmospheric effects → HUD → portfolio content
 .stage       <canvas>                         post-processing       .hud   <main>
```

## Project structure

```
src/
  main.js                 boot sequence, scroll → flight progress, lazy-loads the 3D scene
  quality.js              device/GPU detection → high / medium / low / static
  config.js               aircraft model settings (swap in your own .glb here)
  styles.css              HUD + layout
  ui/hud.js               compass, altitude/speed tapes, lock-on reticle that tracks the jet
  scene/
    Experience.js         renderer, flight simulation, cinematic camera, lights, adaptive quality
    shots.js              one camera/flight/environment preset per section, blended by scroll
    aircraft/             procedural jet, panel-line skin shader, glTF loader
    effects/              afterburner plumes, exhaust particles, wingtip vortices
    world/                sky, cloud sea + volumetric-style cloud billboards, dust,
                          hangar, mission gates, radar, comms beacon
    post/Pipeline.js      depth of field + heat haze, bloom, ACES tone mapping, grade/grain
public/
  models/                 put fighter-jet.glb here (optional, see models/README.md)
  fallback/jet-poster.jpg static background for devices without WebGL
scripts/
  render-poster.mjs       re-renders the fallback poster from the live scene
  shoot.mjs               screenshots every section (development aid)
```

## How the flight works

- The world streams toward the camera at the current airspeed, so clouds, dust,
  streaks, hangar frames and beacons all show parallax and speed.
- The jet's path inside that moving frame is a sum of sine waves with
  incommensurate frequencies, so the flight never visibly loops. Banking, pitch and
  heading come from the jet's actual velocity and acceleration, and the throttle
  (plume length, engine light, heat haze) rises when the jet surges ahead.
- Each section defines a "shot" in `src/scene/shots.js`. The scroll position blends
  smoothly between neighbouring shots, and the flight envelope glides to its new
  position so the jet flies there instead of jumping.
- The mouse adds a gentle camera parallax. With `prefers-reduced-motion`, motion
  slows down and parallax is disabled.

## Performance

- The three.js bundle is lazy-loaded after the page and content have rendered.
- Quality tiers are chosen from the GPU, CPU cores, memory, screen size and
  Save-Data. Each tier scales pixel ratio, shadows, particle and cloud counts, depth
  of field, heat haze and bloom.
- Adaptive quality: if the frame rate stays low, the pixel ratio drops first, then
  effects, then a whole tier.
- Rendering pauses when the tab is hidden. All GPU resources are disposed on
  `pagehide`, and a lost WebGL context falls back gracefully.
- No textures are downloaded. The skin detail, clouds, sky and radar are procedural
  shaders.

Force a tier for testing: `?quality=high`, `?quality=medium`, `?quality=low` or
`?quality=static`.

## Fallback

Without WebGL2, on software renderers, or with `?quality=static`, the page shows
`public/fallback/jet-poster.jpg`, a frame rendered from the real scene, and all
content stays fully usable. To regenerate the poster after changing the scene:

```bash
npm run build && npx vite preview --port 4173 &
npm run poster            # needs Playwright + Chromium
```
