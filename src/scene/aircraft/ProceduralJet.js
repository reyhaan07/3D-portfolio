import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, liftingSurface, clean } from './geometry.js';
import { createSkinMaterial } from './panelMaterial.js';
import { BRAND } from '../../config.js';

// A fifth-generation-style fighter built entirely from code: blended lofted
// fuselage, chined nose, caret intakes, trapezoidal wings with LERX, canted twin
// tails, all-moving stabilators, twin nozzles with petals, gold canopy and stores.
// Aircraft space: nose → -Z, up → +Y, right → +X. Length ≈ 16.5 units.

function tailMarkingTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(210,215,222,0.55)';
  g.font = '600 92px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(BRAND.callsign, 256, 110);
  g.fillStyle = 'rgba(210,215,222,0.35)';
  g.font = '500 30px "JetBrains Mono", monospace';
  g.fillText('AEROSPACE · DEV', 256, 186);
  g.fillRect(96, 214, 320, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function turbineTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grd.addColorStop(0, '#fff4e0');
  grd.addColorStop(0.18, '#ffb36b');
  grd.addColorStop(0.45, '#6b2c12');
  grd.addColorStop(1, '#0b0706');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.translate(128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 28; i++) {
    g.rotate((Math.PI * 2) / 28);
    g.beginPath();
    g.moveTo(22, 0);
    g.quadraticCurveTo(70, 22, 124, 8);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildProceduralJet() {
  const group = new THREE.Group();
  group.name = 'ProceduralJet';
  const disposables = [];
  const track = (x) => (disposables.push(x), x);

  const skin = track(createSkinMaterial());
  const darkSkin = track(createSkinMaterial({ color: 0x353b43, roughness: 0.45, lineStrength: 0.4 }));
  const titanium = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x6f6a66,
      metalness: 1,
      roughness: 0.32,
      envMapIntensity: 1.4,
      iridescence: 0.35,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [200, 600],
    }),
  );
  const cavity = track(new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, metalness: 0.2, side: THREE.BackSide }));

  // ── Fuselage ────────────────────────────────────────────────────────────
  const fuselage = loft(
    [
      { z: -8.6, w: 0.015, ht: 0.015, hb: 0.015, y: -0.02, n: 2.0 },
      { z: -7.6, w: 0.3, ht: 0.24, hb: 0.2, y: -0.02, n: 2.1 },
      { z: -6.3, w: 0.6, ht: 0.4, hb: 0.36, y: 0.0, n: 2.2 },
      { z: -4.8, w: 0.82, ht: 0.52, hb: 0.46, y: 0.04, n: 2.4 },
      { z: -3.2, w: 1.1, ht: 0.58, hb: 0.52, y: 0.02, n: 2.6 },
      { z: -1.4, w: 1.55, ht: 0.6, hb: 0.56, y: 0.0, n: 2.9 },
      { z: 0.8, w: 1.72, ht: 0.56, hb: 0.6, y: 0.0, n: 3.1 },
      { z: 3.4, w: 1.74, ht: 0.5, hb: 0.56, y: 0.0, n: 3.1 },
      { z: 5.6, w: 1.62, ht: 0.44, hb: 0.5, y: 0.0, n: 3.0 },
      { z: 7.3, w: 1.42, ht: 0.38, hb: 0.44, y: 0.0, n: 2.9 },
    ],
    { radial: 64, rings: 110, capEnd: true },
  );

  // Dorsal spine hump behind the canopy.
  const spine = loft(
    [
      { z: -3.6, w: 0.05, ht: 0.02, hb: 0.02, y: 0.55, n: 2 },
      { z: -2.4, w: 0.48, ht: 0.24, hb: 0.05, y: 0.56, n: 2.4 },
      { z: 1.5, w: 0.62, ht: 0.2, hb: 0.05, y: 0.52, n: 2.6 },
      { z: 5.5, w: 0.45, ht: 0.1, hb: 0.05, y: 0.42, n: 2.4 },
      { z: 7.0, w: 0.3, ht: 0.02, hb: 0.02, y: 0.36, n: 2 },
    ],
    { radial: 40, rings: 50 },
  );

  // Caret intakes.
  const intakeStations = [
    { z: -3.3, w: 0.36, ht: 0.34, hb: 0.36, y: -0.14, n: 5 },
    { z: -1.2, w: 0.42, ht: 0.38, hb: 0.4, y: -0.14, n: 5 },
    { z: 1.8, w: 0.3, ht: 0.3, hb: 0.36, y: -0.12, n: 4 },
  ];
  const intakeR = loft(intakeStations, { radial: 28, rings: 20 });
  intakeR.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.12).setPosition(1.2, 0, 0));
  const intakeL = intakeR.clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  flipWinding(intakeL);

  // Wings.
  const wingDef = {
    rootLE: [1.2, 0.02, -1.6],
    rootChord: 7.2,
    tipLE: [7.05, 0.05, 3.55],
    tipChord: 1.35,
    rootThickness: 0.05,
    tipThickness: 0.035,
  };
  const wingR = liftingSurface(wingDef);
  const wingL = liftingSurface({ ...wingDef, mirror: true });

  // Leading-edge root extensions blending the chine into the wing.
  const lerxDef = {
    rootLE: [0.62, 0.0, -5.4],
    rootChord: 5.0,
    tipLE: [1.35, 0.02, -1.55],
    tipChord: 1.6,
    rootThickness: 0.03,
    tipThickness: 0.04,
    spanSegments: 6,
  };
  const lerxR = liftingSurface(lerxDef);
  const lerxL = liftingSurface({ ...lerxDef, mirror: true });

  // All-moving stabilators.
  const stabDef = {
    rootLE: [1.35, -0.02, 5.7],
    rootChord: 3.0,
    tipLE: [4.7, -0.02, 7.55],
    tipChord: 1.1,
    rootThickness: 0.045,
    tipThickness: 0.035,
    spanSegments: 8,
  };
  const stabR = liftingSurface(stabDef);
  const stabL = liftingSurface({ ...stabDef, mirror: true });

  // Canted twin vertical tails: built flat, then stood up and canted outwards.
  const tailDef = {
    rootLE: [0, 0, 3.4],
    rootChord: 3.9,
    tipLE: [3.4, 0, 6.05],
    tipChord: 1.35,
    rootThickness: 0.05,
    tipThickness: 0.035,
    spanSegments: 10,
  };
  const cant = THREE.MathUtils.degToRad(26);
  const tailMatrix = (side) =>
    new THREE.Matrix4()
      .makeTranslation(side * 1.28, 0.34, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(side * -cant))
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  const tailR = liftingSurface(tailDef).applyMatrix4(tailMatrix(1));
  const tailL = liftingSurface({ ...tailDef, mirror: true });
  // Mirrored geometry points span along -X; rotate it the other way.
  tailL.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(-1.28, 0.34, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(cant))
      .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)),
  );

  // Ventral strakes.
  const ventralDef = {
    rootLE: [0, 0, 4.8],
    rootChord: 2.0,
    tipLE: [0.7, 0, 5.9],
    tipChord: 0.9,
    rootThickness: 0.05,
    tipThickness: 0.04,
    spanSegments: 3,
    chordSegments: 10,
  };
  const ventralR = liftingSurface(ventralDef).applyMatrix4(
    new THREE.Matrix4().makeTranslation(0.95, -0.5, 0).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 - 0.35)),
  );
  const ventralL = liftingSurface({ ...ventralDef, mirror: true }).applyMatrix4(
    new THREE.Matrix4().makeTranslation(-0.95, -0.5, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 + 0.35)),
  );

  const bodyGeo = mergeGeometries(
    [fuselage, spine, intakeR, intakeL, wingR, wingL, lerxR, lerxL, stabR, stabL, tailR, tailL].map(clean),
  );
  const body = new THREE.Mesh(bodyGeo, skin);
  body.name = 'body';
  group.add(body);

  const trimGeo = mergeGeometries([ventralR, ventralL].map(clean));
  group.add(new THREE.Mesh(trimGeo, darkSkin));

  // Intake mouths (dark cavities).
  const mouthGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.9, 20, 1, true);
  mouthGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(mouthGeo, cavity);
    m.scale.set(0.9, 0.95, 1);
    m.position.set(side * 1.2, -0.14, -2.95);
    group.add(m);
  }
  track(mouthGeo);

  // Nose probe.
  const probeGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.9, 8);
  probeGeo.rotateX(Math.PI / 2);
  const probe = new THREE.Mesh(probeGeo, titanium);
  probe.position.set(0, -0.02, -9.0);
  group.add(probe);
  track(probeGeo);

  // ── Canopy ──────────────────────────────────────────────────────────────
  const canopyGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x3a2a12,
      metalness: 1,
      roughness: 0.22,
      envMapIntensity: 1.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      iridescence: 0.55,
      iridescenceIOR: 1.5,
    }),
  );
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.scale.set(0.5, 0.46, 2.15);
  canopy.position.set(0, 0.36, -4.55);
  canopy.name = 'canopy';
  group.add(canopy);
  track(canopyGeo);

  const frameGeo = new THREE.TorusGeometry(1, 0.035, 8, 64);
  frameGeo.rotateX(Math.PI / 2);
  const frame = new THREE.Mesh(frameGeo, darkSkin);
  frame.scale.set(0.5, 1, 2.15);
  frame.position.copy(canopy.position);
  group.add(frame);
  const bowGeo = new THREE.TorusGeometry(1, 0.03, 8, 32, Math.PI);
  const bow = new THREE.Mesh(bowGeo, darkSkin);
  bow.scale.set(0.5, 0.46, 1);
  bow.position.set(0, 0.36, -4.1);
  group.add(bow);
  track(frameGeo);
  track(bowGeo);

  // ── Engines ─────────────────────────────────────────────────────────────
  const nozzleOuterGeo = new THREE.CylinderGeometry(0.47, 0.6, 1.25, 40, 1, true);
  nozzleOuterGeo.rotateX(Math.PI / 2);
  const petalGeo = new THREE.BoxGeometry(0.2, 0.03, 0.6);
  const turbineGeo = new THREE.CircleGeometry(0.46, 40);
  const turbineMat = track(
    new THREE.MeshBasicMaterial({ map: track(turbineTexture()), color: new THREE.Color(1, 1, 1), toneMapped: true }),
  );
  const nozzleInnerMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.6, metalness: 0.7, side: THREE.BackSide, emissive: 0xff7a2a, emissiveIntensity: 0.4 }),
  );
  const nozzles = [];
  for (const side of [-1, 1]) {
    const n = new THREE.Group();
    n.position.set(side * 0.62, -0.02, 7.75);
    const outer = new THREE.Mesh(nozzleOuterGeo, titanium);
    const inner = new THREE.Mesh(nozzleOuterGeo, nozzleInnerMat);
    inner.scale.setScalar(0.97);
    n.add(outer, inner);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, titanium);
      petal.position.set(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0.55);
      petal.rotation.z = a + Math.PI / 2;
      petal.rotateX(-0.12);
      n.add(petal);
    }
    const turbine = new THREE.Mesh(turbineGeo, turbineMat);
    turbine.position.z = -0.2;
    n.add(turbine);
    group.add(n);
    nozzles.push(n);
  }
  track(nozzleOuterGeo);
  track(petalGeo);
  track(turbineGeo);

  // ── Stores: pylons + missiles ──────────────────────────────────────────
  const storeMat = track(new THREE.MeshStandardMaterial({ color: 0x9ea3a8, metalness: 0.5, roughness: 0.45, envMapIntensity: 1.1 }));
  const bandMat = track(new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.3, roughness: 0.5 }));
  const missileBody = new THREE.CylinderGeometry(0.085, 0.085, 2.6, 16);
  missileBody.rotateX(Math.PI / 2);
  const missileNose = new THREE.ConeGeometry(0.085, 0.45, 16);
  missileNose.rotateX(-Math.PI / 2);
  const finGeo = new THREE.BoxGeometry(0.34, 0.012, 0.3);
  const bandGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.12, 16);
  bandGeo.rotateX(Math.PI / 2);
  const pylonGeo = new THREE.BoxGeometry(0.06, 0.26, 1.4);
  for (const side of [-1, 1]) {
    const store = new THREE.Group();
    store.position.set(side * 3.7, -0.38, 2.4);
    const pylon = new THREE.Mesh(pylonGeo, darkSkin);
    pylon.position.y = 0.18;
    const bodyM = new THREE.Mesh(missileBody, storeMat);
    const nose = new THREE.Mesh(missileNose, storeMat);
    nose.position.z = -1.52;
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.z = -0.95;
    store.add(pylon, bodyM, nose, band);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeo, storeMat);
      fin.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
      fin.position.z = 1.1;
      const fin2 = fin.clone();
      fin2.scale.setScalar(0.6);
      fin2.position.z = -0.5;
      store.add(fin, fin2);
    }
    group.add(store);
  }
  [missileBody, missileNose, finGeo, bandGeo, pylonGeo].forEach(track);

  // ── Formation "slime" light strips ─────────────────────────────────────
  const stripMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.1, 0.6) }));
  const stripGeo = new THREE.BoxGeometry(0.02, 0.05, 0.9);
  for (const side of [-1, 1]) {
    const s1 = new THREE.Mesh(stripGeo, stripMat);
    s1.position.set(side * 1.02, 0.28, -3.2);
    s1.rotation.y = side * 0.16;
    const s2 = new THREE.Mesh(stripGeo, stripMat);
    s2.position.set(side * 1.72, 0.08, 4.0);
    group.add(s1, s2);
  }
  track(stripGeo);

  // ── Tail markings ───────────────────────────────────────────────────────
  const markTex = track(tailMarkingTexture());
  const markMat = track(
    new THREE.MeshStandardMaterial({ map: markTex, transparent: true, roughness: 0.5, metalness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  const markGeo = new THREE.PlaneGeometry(1.7, 0.85);
  track(markGeo);
  for (const side of [-1, 1]) {
    // Place on the outer face of each canted tail, readable (never mirrored).
    const spanDir = new THREE.Vector3(side * Math.sin(cant), Math.cos(cant), 0);
    const normal = new THREE.Vector3(side * Math.cos(cant), -Math.sin(cant), 0);
    const xAxis = new THREE.Vector3().crossVectors(spanDir, normal);
    const m = new THREE.Mesh(markGeo, markMat);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, spanDir, normal));
    m.position.set(side * 1.28, 0.34, 0).addScaledVector(spanDir, 1.3).addScaledVector(normal, 0.09);
    m.position.z = 5.85;
    group.add(m);
  }

  // Enable shadows on everything opaque.
  group.traverse((o) => {
    if (o.isMesh && !o.material.transparent) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  disposables.push(bodyGeo, trimGeo);

  return {
    group,
    nozzleInnerMat,
    turbineMat,
    dispose() {
      disposables.forEach((d) => d.dispose?.());
    },
  };
}

function flipWinding(geometry) {
  const idx = geometry.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  geometry.index.needsUpdate = true;
  geometry.computeVertexNormals();
}
