import * as THREE from 'three';
import { AIRCRAFT } from '../../config.js';
import { buildProceduralJet } from './ProceduralJet.js';

async function modelExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    // Dev servers answer unknown paths with index.html, so check the type too.
    const type = res.headers.get('content-type') || '';
    return res.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

async function loadGLTF(url, renderer) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Draco and Meshopt compressed models both work; decoders ship with the build
  // and are only downloaded when a compressed model actually needs them.
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const draco = new DRACOLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  draco.dispose();
  const model = gltf.scene;

  model.rotation.set(...AIRCRAFT.rotation);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = AIRCRAFT.length / Math.max(size.z, 1e-6);
  const wrapper = new THREE.Group();
  model.position.sub(center);
  wrapper.add(model);
  wrapper.scale.setScalar(scale);
  wrapper.position.set(...AIRCRAFT.offset);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
        if (m[key]) m[key].anisotropy = Math.min(8, maxAniso);
      }
      if ('envMapIntensity' in m) m.envMapIntensity = 1.3;
    }
  });

  const group = new THREE.Group();
  group.name = 'CustomAircraft';
  group.add(wrapper);
  return {
    group,
    nozzleInnerMat: null,
    turbineMat: null,
    dispose() {
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
          m.dispose();
        }
      });
    },
  };
}

/**
 * Returns the aircraft plus the anchor points the effects attach to.
 * Uses `public/<AIRCRAFT.url>` when present, otherwise the procedural jet.
 */
export async function loadAircraft(renderer) {
  const url = import.meta.env.BASE_URL + AIRCRAFT.url;
  let result = null;
  if (AIRCRAFT.url && (await modelExists(url))) {
    try {
      result = await loadGLTF(url, renderer);
    } catch (err) {
      console.warn('[aircraft] Custom model failed to load, using procedural jet.', err);
    }
  }
  if (!result) result = buildProceduralJet();

  const v = (a) => new THREE.Vector3(...a);
  return {
    ...result,
    anchors: {
      nozzles: AIRCRAFT.nozzles.map(v),
      nozzleRadius: AIRCRAFT.nozzleRadius,
      wingtips: AIRCRAFT.wingtips.map(v),
      cockpit: v(AIRCRAFT.cockpit),
    },
  };
}
