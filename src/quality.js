// Device capability detection. Runs before three.js is downloaded so that
// devices that cannot run the scene never pay for it.

const TIERS = {
  high: {
    name: 'high',
    maxPixelRatio: 1.75,
    shadows: 2048,
    post: true,
    dof: true,
    heat: true,
    bloomScale: 0.5,
    particles: 1,
    clouds: 70,
  },
  medium: {
    name: 'medium',
    maxPixelRatio: 1.25,
    shadows: 1024,
    post: true,
    dof: false,
    heat: true,
    bloomScale: 0.4,
    particles: 0.55,
    clouds: 42,
  },
  low: {
    name: 'low',
    maxPixelRatio: 1,
    shadows: 0,
    post: false,
    dof: false,
    heat: false,
    bloomScale: 0.3,
    particles: 0.28,
    clouds: 20,
  },
};

function probeWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { renderer, maxTex };
  } catch {
    return null;
  }
}

/**
 * @returns {{ tier: object|null, reason: string, reducedMotion: boolean }}
 *   `tier === null` means: show the static fallback.
 */
export function detectQuality() {
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (forced === 'static') return { tier: null, reason: 'forced', reducedMotion };

  const gl = probeWebGL();
  if (!gl) return { tier: null, reason: 'no-webgl2', reducedMotion };

  if (forced && TIERS[forced]) return { tier: { ...TIERS[forced] }, reason: 'forced', reducedMotion };

  const r = gl.renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(r)) {
    return { tier: null, reason: 'software-renderer', reducedMotion };
  }

  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  const saveData = navigator.connection?.saveData === true;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(screen.width, screen.height) < 700;
  const integrated = /intel|mali|adreno [1-5]|powervr|videocore/.test(r);

  let score = 3;
  if (coarse || smallScreen) score -= 1;
  if (cores <= 4) score -= 1;
  if (memory <= 4) score -= 1;
  if (integrated) score -= 0.5;
  if (saveData) score -= 2;
  if (gl.maxTex < 4096) score -= 1;

  const name = score >= 2.5 ? 'high' : score >= 1.5 ? 'medium' : 'low';
  return { tier: { ...TIERS[name] }, reason: 'auto', reducedMotion };
}

export function nextLowerTier(tier) {
  if (tier.name === 'high') return { ...TIERS.medium };
  if (tier.name === 'medium') return { ...TIERS.low };
  return null;
}
