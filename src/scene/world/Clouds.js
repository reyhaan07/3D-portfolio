import * as THREE from 'three';
import { NOISE } from '../glsl.js';

// A moving sea of cloud far below, a wispy mid layer, and instanced cloud
// billboards scattered through the flight volume. Everything scrolls with the
// distance travelled, so the world visibly streams past the aircraft.

const Z_MIN = -700;
const Z_RANGE = 820;

export class CloudSea {
  constructor() {
    this.uniforms = {
      uTravel: { value: 0 },
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color(0.0025, 0.0035, 0.0065) },
      uTop: { value: new THREE.Color(0.018, 0.022, 0.032) },
      uFlash: { value: 0 },
      uFlashPos: { value: new THREE.Vector2() },
      uOpacity: { value: 1 },
      uLayer: { value: 0 },
    };
    const makeMat = (layer) =>
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uLayer: { value: layer } },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTravel, uTime, uFlash, uOpacity, uLayer;
          uniform vec2 uFlashPos;
          uniform vec3 uSunDir, uSunColor, uHorizon, uDeep, uTop;
          varying vec3 vWorld;
          ${NOISE}
          float dens(vec2 p) {
            float base = fbm(p * 0.0045);
            float detail = fbm(p * 0.02 + 3.7);
            return smoothstep(0.32, 0.78, base * 0.8 + detail * 0.35);
          }
          void main() {
            vec2 p = vWorld.xz + vec2(uTime * 1.5, -uTravel * (uLayer > 0.5 ? 1.0 : 1.0));
            if (uLayer > 0.5) p = p * 1.6 + 400.0;
            float d = dens(p);
            float e = 6.0;
            float dx = dens(p + vec2(e, 0.0)) - d;
            float dz = dens(p + vec2(0.0, e)) - d;
            vec3 n = normalize(vec3(-dx * 14.0, 1.0, -dz * 14.0));
            float diff = clamp(dot(n, normalize(uSunDir + vec3(0.0, 0.35, 0.0))), 0.0, 1.0);
            vec3 col = mix(uDeep, uTop, d);
            col += uSunColor * diff * d * 0.08;

            vec3 view = normalize(vWorld - cameraPosition);
            float mu = max(dot(view, uSunDir), 0.0);
            col += uSunColor * pow(mu, 8.0) * d * 0.14;

            float fd = length(uFlashPos - vWorld.xz);
            col += vec3(0.55, 0.65, 1.0) * uFlash * exp(-fd / 70.0) * (0.3 + d * 1.6);

            float dist = length(vWorld.xz - cameraPosition.xz);
            float fog = 1.0 - exp(-dist * 0.0022);
            col = mix(col, uHorizon, clamp(fog, 0.0, 1.0));
            float a = uLayer > 0.5 ? smoothstep(0.35, 0.9, d) * 0.3 : 1.0;
            a *= uOpacity * (uLayer > 0.5 ? (1.0 - smoothstep(600.0, 1400.0, dist)) : 1.0);
            gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
          }`,
        transparent: layer > 0,
        depthWrite: layer === 0,
      });

    this.geometry = new THREE.PlaneGeometry(3200, 3200, 1, 1);
    this.geometry.rotateX(-Math.PI / 2);
    this.lower = new THREE.Mesh(this.geometry, makeMat(0));
    this.lower.position.y = -48;
    this.upper = new THREE.Mesh(this.geometry, makeMat(1));
    this.upper.position.y = -30;
    this.upper.renderOrder = 1;
    this.group = new THREE.Group();
    this.group.add(this.lower, this.upper);
    this.group.traverse((o) => (o.frustumCulled = false));
    this.nextFlash = 3;
    this.flash = 0;
  }

  update(dt, time, travel, camera, sky, weight) {
    this.group.position.x = camera.position.x;
    this.group.position.z = camera.position.z;
    for (const m of [this.lower.material, this.upper.material]) {
      m.uniforms.uTravel.value = travel;
      m.uniforms.uTime.value = time;
      m.uniforms.uSunDir.value.copy(sky.uSunDir.value);
      m.uniforms.uSunColor.value.copy(sky.uSunColor.value).multiplyScalar(sky.uSunStrength.value * 0.4);
      m.uniforms.uHorizon.value.copy(sky.uHorizon.value);
      m.uniforms.uOpacity.value = weight;
    }
    // Occasional distant lightning inside the cloud deck.
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this.nextFlash = 5 + Math.random() * 9;
      this.flash = 1;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const r = 300 + Math.random() * 500;
      this.flashPos = [camera.position.x + Math.cos(ang) * r, camera.position.z + Math.sin(ang) * r];
      this.flashFlicker = 0;
    }
    if (this.flash > 0) {
      this.flashFlicker += dt;
      this.flash = Math.max(0, this.flash - dt * 2.4);
      const f = this.flash * (0.6 + 0.4 * Math.sin(this.flashFlicker * 60)) * weight;
      for (const m of [this.lower.material, this.upper.material]) {
        m.uniforms.uFlash.value = f * 2.5;
        m.uniforms.uFlashPos.value.set(this.flashPos[0], this.flashPos[1]);
      }
    }
    this.group.visible = weight > 0.01;
  }

  dispose() {
    this.geometry.dispose();
    this.lower.material.dispose();
    this.upper.material.dispose();
  }
}

export class CloudPuffs {
  constructor(count) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const offsets = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const lane = Math.random();
      // Mostly below and to the sides, a few crossing the flight path.
      const x = lane < 0.18 ? (Math.random() - 0.5) * 60 : side * (35 + Math.random() * 240);
      const y = lane < 0.18 ? -14 - Math.random() * 18 : -36 + Math.random() * 52;
      offsets.set([x, y, Z_MIN + Math.random() * Z_RANGE], i * 3);
      scales[i] = 45 + Math.random() * 90;
      seeds[i] = Math.random();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.instanceCount = count;
    this.base = base;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTravel: { value: 0 },
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uShade: { value: new THREE.Color(0.005, 0.0065, 0.01) },
        uLit: { value: new THREE.Color(0.022, 0.027, 0.036) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute float aScale;
        attribute float aSeed;
        uniform float uTravel;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying float vSeed;
        varying float vFade;
        varying float vSun;
        varying float vDist;
        const float Z_MIN = ${Z_MIN.toFixed(1)};
        const float Z_RANGE = ${Z_RANGE.toFixed(1)};
        void main() {
          vec3 c = aOffset;
          float zz = mod(c.z - Z_MIN + uTravel * (0.92 + aSeed * 0.16), Z_RANGE);
          c.z = Z_MIN + zz;
          float edge = smoothstep(0.0, 0.12, zz / Z_RANGE) * (1.0 - smoothstep(0.86, 1.0, zz / Z_RANGE));
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float dist = length(mv.xyz);
          vDist = dist;
          vFade = edge * smoothstep(18.0, 70.0, dist);
          vSun = max(dot(normalize(c - cameraPosition), uSunDir), 0.0);
          float rot = aSeed * 6.2831;
          vec2 p = position.xy;
          p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;
          mv.xy += p * aScale * vec2(1.6, 0.8);
          vUv = uv;
          vSeed = aSeed;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uOpacity;
        uniform vec3 uSunColor, uHorizon, uShade, uLit;
        varying vec2 vUv;
        varying float vSeed, vFade, vSun, vDist;
        ${NOISE}
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p * vec2(1.0, 1.25));
          float n = fbm(vUv * 3.2 + vSeed * 17.0 + vec2(uTime * 0.01, 0.0));
          float shape = smoothstep(0.5, 0.12, r + (n - 0.5) * 0.45);
          if (shape < 0.003) discard;
          float lit = smoothstep(-0.3, 0.4, -p.y + (n - 0.5) * 0.4);
          vec3 col = mix(uShade, uLit, lit);
          col += uSunColor * pow(vSun, 8.0) * (1.0 - shape) * 0.3; // silver lining
          col += uSunColor * 0.02 * lit;
          float fog = 1.0 - exp(-vDist * 0.0026);
          col = mix(col, uHorizon, fog);
          gl_FragColor = vec4(col, shape * vFade * 0.42 * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(time, travel, sky, weight) {
    const u = this.material.uniforms;
    u.uTravel.value = travel;
    u.uTime.value = time;
    u.uSunDir.value.copy(sky.uSunDir.value);
    u.uSunColor.value.copy(sky.uSunColor.value).multiplyScalar(sky.uSunStrength.value * 0.4);
    u.uHorizon.value.copy(sky.uHorizon.value);
    u.uOpacity.value = weight;
    this.mesh.visible = weight > 0.01;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.base.dispose();
    this.material.dispose();
  }
}
