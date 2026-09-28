// ─────────────────────────────────────────────────────────────────────────────
//  Aircraft configuration
//
//  To swap the procedural jet for your own model, drop a .glb/.gltf file into
//  `public/models/` and point `url` at it. If the file is missing (or fails to
//  load) the built-in procedural fighter is used automatically.
//
//  Local aircraft axes used by the scene:  nose → -Z,  up → +Y,  right wing → +X
//  Use `rotation` / `scale` / `offset` to bring any model into that frame.
// ─────────────────────────────────────────────────────────────────────────────
export const AIRCRAFT = {
  url: 'models/fighter-jet.glb',

  // Target length (nose → nozzles) in scene units. The model is auto-scaled to it.
  length: 16,

  // Euler rotation (radians) applied to the loaded model, e.g. [0, Math.PI, 0]
  // if your model's nose points toward +Z.
  rotation: [0, 0, 0],

  // Extra offset after auto-centering, in scene units.
  offset: [0, 0, 0],

  // Engine nozzle exits in aircraft space (after scaling). Exhaust, lights and
  // heat-haze attach here. Tweak these to match your model's engines.
  nozzles: [
    [-0.62, -0.02, 8.35],
    [0.62, -0.02, 8.35],
  ],
  nozzleRadius: 0.44,

  // Wingtips (for vortex trails and navigation lights) and the cockpit
  // (for the close-up camera in the About section).
  wingtips: [
    [-7.05, 0.05, 4.2],
    [7.05, 0.05, 4.2],
  ],
  cockpit: [0, 0.75, -4.6],
};

export const BRAND = {
  callsign: 'RS-01',
};
