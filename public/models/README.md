# Aircraft model

The site ships with a **procedural fighter jet** built in code
(`src/scene/aircraft/ProceduralJet.js`), so no model file is required.

## Using your own model

1. Export your aircraft as **`.glb`** (binary glTF). Draco or Meshopt compression is
   supported, and so are KHR texture transforms and PBR materials.
2. Save it here as **`public/models/fighter-jet.glb`**, or change `AIRCRAFT.url` in
   `src/config.js`.
3. Adjust the settings in `src/config.js`:
   - `rotation`: make the nose point toward **−Z** with **+Y** up. For example, use
     `[0, Math.PI, 0]` if the nose faces +Z.
   - `length`: the model is auto-scaled so nose-to-tail equals this value (default `16`).
   - `nozzles`, `nozzleRadius`: where the afterburner plumes, engine light and heat
     haze attach.
   - `wingtips`: where the navigation lights and wingtip vortex trails attach.
   - `cockpit`: where the About-section close-up camera aims.

The loader detects the file automatically. If the file is missing or fails to load,
the procedural jet is used instead, so the site never breaks.

### Tips for a fast model

- Keep it under roughly 150k triangles and 5 MB.
- Compress it: `npx gltf-transform optimize in.glb fighter-jet.glb --compress meshopt --texture-compress webp`
- Keep textures at 2048 px or smaller.
