// One cinematic "shot" per page section. Scrolling blends continuously between
// neighbouring shots, so the whole page reads as a single flight.
//
//  C*      centre of the jet's flight envelope (flight-frame units)
//  A*      amplitude of the jet's free flight around that centre
//  cam*    free camera position relative to C; `follow` lets it drift with the jet
//  lock    0 = free cinematic camera, 1 = camera rides with the jet at `j*`
//  j*      camera offset in the jet's heading frame (right, up, back)
//  look    how much the camera aims at the jet (vs. the envelope centre)
//  cockpit aim at the cockpit instead of the jet's centre
//  ahead   push the aim point forward along the heading (units)
//  frameX/Y shift the image so the jet sits beside the text (fraction of view)
//  speed   airspeed: how fast the world streams past

const base = {
  Cx: 0, Cy: -2.5, Cz: -20,
  Ax: 14, Ay: 3, Az: 12,
  camX: 0, camY: 4.5, camZ: 34, follow: 0.15,
  lock: 0, jx: 0, jy: 3, jz: 24,
  look: 0.3, cockpit: 0, ahead: 0,
  fov: 40, frameX: 0, frameY: -0.1, dutch: 0,
  dof: 1.6, speed: 55,
  clouds: 1, hangar: 0, gates: 0, radar: 0, beacon: 0,
  sun: 1, stars: 1, exposure: 1,
};

export const SHOTS = [
  // 0 · HOME — the jet roams the sky, crossing behind the title.
  { ...base },

  // 1 · ABOUT — camera slides alongside the cockpit.
  {
    ...base,
    Cx: 0, Cy: 0, Cz: -8, Ax: 2.2, Ay: 1.0, Az: 2.0,
    lock: 1, jx: 9.5, jy: 3.4, jz: -6.5,
    look: 1, cockpit: 0.85, ahead: 0,
    fov: 36, frameY: 0, frameX: 0.2, dof: 2.6, dutch: -2,
  },

  // 2 · SKILLS — inside a structural hangar tunnel.
  {
    ...base,
    Cx: 0, Cy: -0.5, Cz: -20, Ax: 3.5, Ay: 1.4, Az: 5,
    camX: -5, camY: 2, camZ: 42, follow: 0.8,
    lock: 0.75, jx: -7.5, jy: 1.2, jz: 21,
    look: 0.95, cockpit: 0, ahead: 4,
    fov: 48, frameY: 0, frameX: -0.2, dof: 2, speed: 38, dutch: 3,
    clouds: 0.2, hangar: 1, sun: 0.7,
  },

  // 3 · PROJECTS — mission chase through waypoint gates.
  {
    ...base,
    Cx: 0, Cy: 2, Cz: -26, Ax: 6, Ay: 2, Az: 8,
    camX: 0, camY: 8, camZ: 30, follow: 0.7,
    lock: 0.85, jx: 0, jy: 5.5, jz: 25,
    look: 0.9, ahead: 10,
    fov: 44, frameY: 0.22, dof: 1.6, speed: 62,
    clouds: 0.85, gates: 1,
  },

  // 4 · TRAINING — top-down over the radar scope.
  {
    ...base,
    Cx: 0, Cy: 0, Cz: -22, Ax: 12, Ay: 1, Az: 7,
    camX: 0, camY: 46, camZ: 26, follow: 0.55,
    lock: 0.25, jx: 0, jy: 34, jz: 16,
    look: 0.9, ahead: 0,
    fov: 44, frameY: 0, frameX: 0.2, dof: 1.2, speed: 50,
    clouds: 0.55, radar: 1,
  },

  // 5 · CONTACT — homing on the comms beacon at first light.
  {
    ...base,
    Cx: 0, Cy: 0, Cz: -30, Ax: 5, Ay: 2, Az: 5,
    camX: -3, camY: 3, camZ: 50, follow: 0.8,
    lock: 0.85, jx: -3.5, jy: 2.4, jz: 22,
    look: 0.7, ahead: 70,
    fov: 46, frameX: -0.12, frameY: 0.1, dof: 1, speed: 50,
    clouds: 1, beacon: 1, sun: 1.8, stars: 0.35, exposure: 1.0,
  },
];

const KEYS = Object.keys(base);
const smooth = (t) => t * t * (3 - 2 * t);

export function blendShot(s, out = {}) {
  const max = SHOTS.length - 1;
  const c = Math.min(Math.max(s, 0), max);
  const i = Math.min(Math.floor(c), max - 1);
  const f = smooth(c - i);
  const a = SHOTS[i];
  const b = SHOTS[i + 1];
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}
