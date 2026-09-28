import * as THREE from 'three';

// Exhaust particles and wingtip vortex ribbons. Both live in "flight frame"
// space: air (and anything left in it) streams past the aircraft toward +Z.

const particleVertex = /* glsl */ `
attribute float aAge;
attribute float aSeed;
uniform float uPixelRatio;
varying float vAge;
varying float vSeed;
varying float vNear;
void main() {
  vAge = aAge;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = mix(0.2, 1.3, sqrt(aAge)) * (0.6 + aSeed * 0.8);
  vNear = smoothstep(3.0, 14.0, -mv.z); // never smear sprites across the lens
  gl_PointSize = min(size * uPixelRatio * (320.0 / -mv.z), 90.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`;

const particleFragment = /* glsl */ `
varying float vAge;
varying float vSeed;
varying float vNear;
void main() {
  if (vAge >= 1.0 || vNear <= 0.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float soft = smoothstep(0.5, 0.0, d);
  vec3 hot = vec3(1.3, 0.62, 0.22);
  vec3 smoke = vec3(0.07, 0.08, 0.1);
  float heat = exp(-vAge * 14.0);
  vec3 col = mix(smoke, hot, heat);
  float a = soft * (1.0 - vAge) * mix(0.3, 0.8, heat) * (0.5 + 0.5 * vSeed) * vNear;
  gl_FragColor = vec4(col * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
}
`;

export class ExhaustParticles {
  constructor(count) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1);
    this.life = new Float32Array(count).fill(1);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) this.seed[i] = Math.random();
    this.cursor = 0;
    this.carry = 0;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ageAttr = new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAge', this.ageAttr);
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this._tmp = new THREE.Vector3();
  }

  /** @param emitters world positions; @param back world-space rearward unit vector */
  update(dt, emitters, back, airSpeed, throttle) {
    const rate = this.count / 1.4; // particles per second at full throttle
    this.carry += rate * dt * (0.4 + throttle * 0.6);
    let n = Math.floor(this.carry);
    this.carry -= n;
    while (n-- > 0) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const e = emitters[i % emitters.length];
      const j = (Math.random() - 0.5) * 0.25;
      this.pos[i * 3] = e.x + j;
      this.pos[i * 3 + 1] = e.y + (Math.random() - 0.5) * 0.25;
      this.pos[i * 3 + 2] = e.z + Math.random() * 0.4;
      const ex = 10 + Math.random() * 8;
      this.vel[i * 3] = back.x * ex + (Math.random() - 0.5) * 1.5;
      this.vel[i * 3 + 1] = back.y * ex + (Math.random() - 0.5) * 1.5;
      this.vel[i * 3 + 2] = back.z * ex;
      this.age[i] = 0;
      this.life[i] = 0.5 + Math.random() * 1.1;
    }
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] = Math.min(1, this.age[i] + dt / this.life[i]);
      const drag = Math.exp(-dt * 2.2);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + dt * 0.6;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + airSpeed) * dt;
    }
    this.posAttr.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

export class VortexRibbon {
  constructor(length = 56, width = 0.09) {
    this.n = length;
    this.width = width;
    this.history = Array.from({ length }, () => new THREE.Vector3());
    this.primed = false;
    const verts = new Float32Array(length * 2 * 3);
    const alpha = new Float32Array(length * 2);
    const idx = [];
    for (let i = 0; i < length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(verts, 3).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    geo.setIndex(idx);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aAlpha; varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity; varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * vA * uIntensity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this._side = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
  }

  update(dt, head, airSpeed, cameraPos, intensity) {
    const h = this.history;
    if (!this.primed) {
      h.forEach((p, i) => p.copy(head).add(new THREE.Vector3(0, 0, i * 0.5)));
      this.primed = true;
    }
    for (const p of h) p.z += airSpeed * dt;
    // Emit at a fixed rate so the trail length is frame-rate independent.
    this.acc = (this.acc || 0) + dt;
    if (this.acc >= 1 / 40) {
      this.acc = 0;
      h.unshift(h.pop().copy(head));
    } else {
      h[0].copy(head);
    }

    const v = this.posAttr.array;
    const a = this.alphaAttr.array;
    for (let i = 0; i < this.n; i++) {
      const p = h[i];
      const q = h[Math.min(this.n - 1, i + 1)];
      const r = h[Math.max(0, i - 1)];
      this._dir.subVectors(q, r).normalize();
      this._toCam.subVectors(cameraPos, p).normalize();
      this._side.crossVectors(this._dir, this._toCam).normalize();
      const t = i / (this.n - 1);
      const w = this.width * (0.4 + t * 2.2);
      v[i * 6] = p.x + this._side.x * w;
      v[i * 6 + 1] = p.y + this._side.y * w;
      v[i * 6 + 2] = p.z + this._side.z * w;
      v[i * 6 + 3] = p.x - this._side.x * w;
      v[i * 6 + 4] = p.y - this._side.y * w;
      v[i * 6 + 5] = p.z - this._side.z * w;
      const fade = Math.sin(Math.min(1, t * 6) * Math.PI * 0.5) * (1 - t);
      a[i * 2] = a[i * 2 + 1] = fade;
    }
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.material.uniforms.uIntensity.value = intensity;
    this.mesh.visible = intensity > 0.01;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
