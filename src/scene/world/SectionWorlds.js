import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE } from '../glsl.js';

// Environments that materialise around the aircraft as the visitor scrolls:
//   Hangar  (Skills)   – a structural tunnel the jet flies through
//   Gates   (Projects) – holographic mission waypoints
//   Radar   (Training) – a sweeping radar/flight-training display below the jet
//   Beacon  (Contact)  – a distant comms tower the aircraft is homing on

const wrapZ = (z, min, range) => min + ((((z - min) % range) + range) % range);

// ── Hangar ──────────────────────────────────────────────────────────────────
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,190,120,0.55)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(150,180,210,0.18)';
  g.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32, 256);
    g.moveTo(0, i * 32);
    g.lineTo(256, i * 32);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,200,140,0.8)';
  g.fillRect(124, 0, 8, 256); // centre line
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Hangar {
  constructor() {
    this.group = new THREE.Group();
    this.count = 11;
    this.spacing = 36;
    this.range = this.count * this.spacing;
    this.min = -this.range + 60;

    const W = 21; // half width
    const FLOOR = -9;
    const H = 15;
    const box = (sx, sy, sz, x, y, z, rz = 0) => {
      const b = new THREE.BoxGeometry(sx, sy, sz);
      b.rotateZ(rz);
      b.translate(x, y, z);
      return b;
    };
    const slope = Math.atan2(5, W - 7);
    const frameGeo = mergeGeometries([
      box(1.4, H - FLOOR, 2.2, -W, (H + FLOOR) / 2, 0),
      box(1.4, H - FLOOR, 2.2, W, (H + FLOOR) / 2, 0),
      box(Math.hypot(W - 7, 5) + 1, 1.2, 2.2, -(W + 7) / 2, H + 2.4, 0, slope),
      box(Math.hypot(W - 7, 5) + 1, 1.2, 2.2, (W + 7) / 2, H + 2.4, 0, -slope),
      box(14.4, 1.2, 2.2, 0, H + 4.9, 0),
      box(3, 3, 2.4, -W + 1, FLOOR + 1.5, 0),
      box(3, 3, 2.4, W - 1, FLOOR + 1.5, 0),
    ]);
    const stripGeo = mergeGeometries([
      box(0.18, H - FLOOR - 4, 0.3, -W + 0.8, (H + FLOOR) / 2, -1.2),
      box(0.18, H - FLOOR - 4, 0.3, W - 0.8, (H + FLOOR) / 2, -1.2),
      box(12, 0.18, 0.3, 0, H + 4.2, -1.2),
    ]);
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1f25, metalness: 0.75, roughness: 0.42, envMapIntensity: 0.8 });
    this.stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 2.0) });
    this.frames = new THREE.InstancedMesh(frameGeo, this.frameMat, this.count);
    this.strips = new THREE.InstancedMesh(stripGeo, this.stripMat, this.count);
    this.frames.castShadow = true;
    this.frames.receiveShadow = true;
    this.frames.frustumCulled = this.strips.frustumCulled = false;

    this.gridTex = gridTexture();
    this.gridTex.repeat.set(5, 5);
    // Diffuse-only floor: a glossy floor would mirror the aircraft's rim light straight into the lens.
    this.floorMat = new THREE.MeshLambertMaterial({
      color: 0x101318,
      emissive: 0xffffff,
      emissiveMap: this.gridTex,
      emissiveIntensity: 0.8,
      transparent: true,
    });
    this.floorGeo = new THREE.PlaneGeometry(W * 2 + 2, 200 * 2);
    this.floorGeo.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(this.floorGeo, this.floorMat);
    this.floor.receiveShadow = true;
    this.floorY = FLOOR;
    this.gridTex.repeat.set(1, 400 / 42);
    this.group.add(this.frames, this.strips, this.floor);
    this._m = new THREE.Matrix4();
    this.weight = 0;
  }

  update(travel, cameraZ, weight) {
    this.weight = weight;
    this.group.visible = weight > 0.01;
    if (!this.group.visible) return;
    const rise = (1 - weight) * -70;
    for (let i = 0; i < this.count; i++) {
      const z = wrapZ(i * this.spacing + travel, this.min, this.range) + cameraZ;
      const stagger = Math.max(0, 1 - weight * 1.6 + (i % 4) * 0.08);
      this._m.makeTranslation(0, rise * stagger, z);
      this.frames.setMatrixAt(i, this._m);
      this.strips.setMatrixAt(i, this._m);
    }
    this.frames.instanceMatrix.needsUpdate = true;
    this.strips.instanceMatrix.needsUpdate = true;
    this.floor.position.set(0, this.floorY + rise * 0.6, cameraZ - 160);
    this.gridTex.offset.y = (travel % 42) / 42;
    this.floorMat.opacity = weight;
    this.stripMat.color.setRGB(2.2 * weight, 1.8 * weight, 1.4 * weight);
  }

  dispose() {
    [this.frames.geometry, this.strips.geometry, this.floorGeo, this.frameMat, this.stripMat, this.floorMat, this.gridTex].forEach((d) => d.dispose());
  }
}

// ── Mission gates ───────────────────────────────────────────────────────────
export class MissionGates {
  constructor() {
    this.group = new THREE.Group();
    const s = 11;
    const L = 3.2;
    const pts = [];
    for (const [cx, cy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const x = cx * s;
      const y = cy * s * 0.62;
      pts.push(x, y, 0, x - cx * L, y, 0, x, y, 0, x, y - cy * L, 0);
    }
    // Centre diamond marker.
    const d = 1.1;
    pts.push(0, d + s * 0.8, 0, d, s * 0.8, 0, d, s * 0.8, 0, 0, s * 0.8 - d, 0, 0, s * 0.8 - d, 0, -d, s * 0.8, 0, -d, s * 0.8, 0, 0, d + s * 0.8, 0);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.mat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.gates = [];
    this.count = 5;
    this.spacing = 90;
    this.range = this.count * this.spacing;
    for (let i = 0; i < this.count; i++) {
      const g = new THREE.LineSegments(this.geo, this.mat);
      g.userData.x = Math.sin(i * 2.1) * 6;
      g.userData.y = Math.cos(i * 1.3) * 2.5;
      g.frustumCulled = false;
      this.group.add(g);
      this.gates.push(g);
    }
  }

  update(time, travel, cameraZ, weight) {
    this.group.visible = weight > 0.01;
    if (!this.group.visible) return;
    this.gates.forEach((g, i) => {
      const z = wrapZ(i * this.spacing + travel, -this.range + 30, this.range);
      const t = (z + this.range - 30) / this.range;
      g.position.set(g.userData.x, g.userData.y, z + cameraZ);
      g.rotation.z = Math.sin(time * 0.5 + i) * 0.05;
      g.scale.setScalar(0.85 + 0.15 * Math.sin(time * 2 + i));
      g.visible = t > 0.05 && t < 0.97;
    });
    this.mat.opacity = weight * (0.75 + 0.25 * Math.sin(time * 6));
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ── Radar ──────────────────────────────────────────────────────────────────
export class Radar {
  constructor() {
    this.geo = new THREE.CircleGeometry(115, 128);
    this.geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTravel: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.35, 1.0, 0.75) } },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uTravel, uOpacity;
        uniform vec3 uColor;
        varying vec2 vP;
        ${NOISE}
        #define PI 3.14159265
        float line(float v, float w) { float fw = fwidth(v); return 1.0 - smoothstep(w, w + fw * 1.5, abs(v)); }
        void main() {
          float r = length(vP);
          float R = 115.0;
          if (r > R) discard;
          float ang = atan(vP.x, -vP.y);
          float sweepA = mod(uTime * 1.1, 2.0 * PI) - PI;
          float diff = mod(sweepA - ang + 2.0 * PI, 2.0 * PI);
          float trail = exp(-diff * 2.2);

          float rings = line(mod(r + 11.5, 23.0) - 11.5, 0.12);
          float spokes = 0.0;
          for (int i = 0; i < 6; i++) {
            float a = float(i) * PI / 6.0;
            spokes += line(dot(vP, vec2(cos(a), sin(a))), 0.08) * 0.6;
          }
          float ticks = line(mod(degrees(ang) + 2.5, 5.0) - 2.5, 0.25) * smoothstep(R - 6.0, R - 1.0, r);
          float rim = line(r - R + 1.0, 0.5);

          // Blips: fixed contacts in world space that glow as the sweep passes.
          vec2 wp = vP + vec2(0.0, -uTravel * 0.25);
          vec2 cell = floor(wp / 18.0);
          float h = hash12(cell);
          vec2 bp = (cell + 0.2 + 0.6 * vec2(hash12(cell + 7.1), hash12(cell + 3.3))) * 18.0 - vec2(0.0, -uTravel * 0.25);
          float blipAng = atan(bp.x, -bp.y);
          float bdiff = mod(sweepA - blipAng + 2.0 * PI, 2.0 * PI);
          float blip = step(0.9, h) * smoothstep(1.4, 0.2, length(vP - bp)) * exp(-bdiff * 1.2);

          // Flight-training route: dashed curve ahead of the aircraft.
          float route = line(vP.x - 26.0 * sin(vP.y * 0.025 + uTravel * 0.004), 0.12);
          route *= step(0.6, fract((vP.y + uTravel * 0.25) / 4.0)) * step(vP.y, 0.0) * smoothstep(-100.0, -20.0, vP.y) * smoothstep(0.0, -30.0, vP.y);

          float grid = (rings * 0.55 + spokes * 0.25 + ticks + rim) * (0.35 + 0.65 * trail);
          vec3 col = uColor * (grid * 0.9 + trail * 0.18 * smoothstep(R, 0.0, r) + blip * 3.0);
          col += vec3(1.0, 0.7, 0.35) * route * 0.8;
          float edge = smoothstep(R, R - 12.0, r);
          gl_FragColor = vec4(col * uOpacity * edge, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      extensions: {},
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.group = new THREE.Group();
    this.group.add(this.mesh);

    // Rings pulsing out from the aircraft's position on the scope.
    this.pingGeo = new THREE.RingGeometry(0.96, 1, 96);
    this.pingGeo.rotateX(-Math.PI / 2);
    this.pingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.0, 1.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ping = new THREE.Mesh(this.pingGeo, this.pingMat);
    this.group.add(this.ping);
  }

  update(time, travel, jetPos, weight) {
    this.group.visible = weight > 0.01;
    if (!this.group.visible) return;
    this.group.position.set(jetPos.x * 0.6, -18 - (1 - weight) * 30, jetPos.z * 0.6);
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uTravel.value = travel;
    this.mat.uniforms.uOpacity.value = weight;
    const p = (time * 0.45) % 1;
    this.ping.scale.setScalar(2 + p * 60);
    this.ping.position.set(jetPos.x - this.group.position.x, 0.2, jetPos.z - this.group.position.z);
    this.pingMat.opacity = (1 - p) * weight * 0.8;
  }

  dispose() {
    [this.geo, this.mat, this.pingGeo, this.pingMat].forEach((d) => d.dispose());
  }
}

// ── Comms beacon ────────────────────────────────────────────────────────────
export class Beacon {
  constructor(glowTexture) {
    this.group = new THREE.Group();
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.6, roughness: 0.5 });
    const mast = new THREE.CylinderGeometry(0.8, 4, 120, 8, 1, true);
    mast.translate(0, 60, 0);
    const dish = new THREE.SphereGeometry(7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2);
    dish.rotateX(-Math.PI / 2.4);
    dish.translate(0, 92, -2);
    const tower = new THREE.Mesh(mergeGeometries([mast, dish]), towerMat);
    this.group.add(tower);

    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.4) });
    const ringGeo = new THREE.TorusGeometry(2.4, 0.12, 6, 32);
    ringGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 30 + i * 18;
      ring.scale.setScalar(1.6 - i * 0.25);
      this.group.add(ring);
    }

    // Vertical light beam.
    const beamGeo = new THREE.CylinderGeometry(1.2, 3.5, 600, 24, 1, true);
    beamGeo.translate(0, 420, 0);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vY; varying vec3 vN; varying vec3 vV;
        void main() {
          vY = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity, uTime;
        varying float vY; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(abs(dot(vN, vV)), 2.0);
          float a = f * pow(1.0 - vY, 1.5) * uOpacity * (0.85 + 0.15 * sin(uTime * 3.0));
          gl_FragColor = vec4(vec3(1.0, 0.75, 0.45) * a * 1.4, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.group.add(this.beam);

    // Transmission waves expanding from the top.
    this.waveGeo = new THREE.RingGeometry(0.97, 1, 128);
    this.waveGeo.rotateX(-Math.PI / 2);
    this.waves = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 1.0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const w = new THREE.Mesh(this.waveGeo, m);
      w.position.y = 96;
      this.group.add(w);
      this.waves.push(w);
    }

    this.lightMat = new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(2.4, 1.7, 1.1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.light = new THREE.Sprite(this.lightMat);
    this.light.position.y = 122;
    this.light.scale.setScalar(26);
    this.group.add(this.light);

    this.disposables = [towerMat, mast, dish, tower.geometry, ringMat, ringGeo, beamGeo, this.beamMat, this.waveGeo, this.lightMat, ...this.waves.map((w) => w.material)];
    this.group.traverse((o) => (o.frustumCulled = false));
  }

  update(time, weight, cameraPos) {
    this.group.visible = weight > 0.01;
    if (!this.group.visible) return;
    const e = weight * weight * (3 - 2 * weight);
    this.group.position.set(cameraPos.x + 70, -60, cameraPos.z - THREE.MathUtils.lerp(1300, 420, e));
    this.beamMat.uniforms.uOpacity.value = weight;
    this.beamMat.uniforms.uTime.value = time;
    this.waves.forEach((w, i) => {
      const p = (time * 0.18 + i / this.waves.length) % 1;
      w.scale.setScalar(4 + p * 260);
      w.material.opacity = (1 - p) * (1 - p) * weight * 0.9;
    });
    const pulse = 0.6 + 0.4 * Math.pow(0.5 + 0.5 * Math.sin(time * 2.4), 4);
    this.light.scale.setScalar(18 + pulse * 22);
    this.lightMat.opacity = weight;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
