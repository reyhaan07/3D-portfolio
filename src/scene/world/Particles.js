import * as THREE from 'three';

// Floating dust/ice crystals and faint speed streaks that stream past the
// camera. All motion happens in the vertex shader; the CPU only updates uniforms.

const BOX = new THREE.Vector3(140, 70, 260); // extents of the wrap volume

export class Dust {
  constructor(count) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX.x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * BOX.y;
      pos[i * 3 + 2] = Math.random() * BOX.z;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTravel: { value: 0 },
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: BOX },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color(0.75, 0.82, 0.95) },
        uSunColor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTravel, uTime, uPixelRatio;
        uniform vec3 uCenter, uBox, uSunDir;
        varying float vAlpha;
        varying float vSun;
        void main() {
          vec3 p = position;
          p.z = mod(p.z + uTravel * (0.9 + aSeed * 0.2), uBox.z);
          vec3 w = uCenter + vec3(p.x, p.y + sin(uTime * 0.3 + aSeed * 40.0) * 0.8, p.z - uBox.z * 0.8);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          float d = -mv.z;
          float edge = smoothstep(0.0, 0.15, p.z / uBox.z) * (1.0 - smoothstep(0.85, 1.0, p.z / uBox.z));
          vAlpha = edge * smoothstep(1.5, 8.0, d) * (1.0 - smoothstep(60.0, 140.0, d)) * (0.35 + aSeed * 0.65);
          vSun = pow(max(dot(normalize(w - cameraPosition), uSunDir), 0.0), 6.0);
          gl_PointSize = (0.6 + aSeed * 1.6) * uPixelRatio * (60.0 / d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uSunColor;
        uniform float uOpacity;
        varying float vAlpha;
        varying float vSun;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
          gl_FragColor = vec4((uColor * 0.5 + uSunColor * vSun * 2.0) * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  update(time, travel, center, pixelRatio, sky, weight = 1) {
    const u = this.material.uniforms;
    u.uTravel.value = travel;
    u.uTime.value = time;
    u.uCenter.value.copy(center);
    u.uPixelRatio.value = pixelRatio;
    u.uSunDir.value.copy(sky.uSunDir.value);
    u.uSunColor.value.copy(sky.uSunColor.value);
    u.uOpacity.value = weight;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

export class SpeedStreaks {
  constructor(count) {
    // Each streak is a line segment; the tail vertex is flagged with aEnd = 1.
    const pos = new Float32Array(count * 6);
    const end = new Float32Array(count * 2);
    const seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 30;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r * 0.6;
      const z = Math.random() * 160;
      const s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
      seed[i * 2] = seed[i * 2 + 1] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTravel: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uLen: { value: 6 },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aEnd;
        attribute float aSeed;
        uniform float uTravel, uLen;
        uniform vec3 uCenter;
        varying float vA;
        void main() {
          vec3 p = position;
          float span = 160.0;
          float z = mod(p.z + uTravel * (1.4 + aSeed * 0.6), span);
          vec3 w = uCenter + vec3(p.x, p.y, z - span * 0.75 - aEnd * uLen * (0.6 + aSeed));
          float t = z / span;
          vA = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.7, 1.0, t)) * (1.0 - aEnd) * (0.3 + aSeed * 0.7);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.55, 0.65, 0.8) * vA * 0.1 * uOpacity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
  }

  update(travel, center, speed, weight = 1) {
    const u = this.material.uniforms;
    u.uTravel.value = travel;
    u.uCenter.value.copy(center);
    u.uLen.value = 2 + speed * 0.12;
    u.uOpacity.value = weight;
  }

  dispose() {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}

// Far-off blinking aviation beacons and the navigation lights of distant traffic,
// giving parallax at the horizon.
export class DistantLights {
  constructor(count = 46) {
    const pos = new Float32Array(count * 3);
    const data = new Float32Array(count * 2);
    const color = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      pos.set([side * (90 + Math.random() * 420), -44 + Math.random() * 70, -900 + Math.random() * 1000], i * 3);
      data.set([Math.random() * 10, 0.4 + Math.random() * 1.6], i * 2);
      const kind = Math.random();
      const c = kind < 0.55 ? [1.0, 0.25, 0.18] : kind < 0.85 ? [1.0, 0.85, 0.65] : [0.6, 0.85, 1.0];
      color.set(c, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 2));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTravel: { value: 0 }, uTime: { value: 0 }, uPixelRatio: { value: 1 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec2 aData;
        attribute vec3 aColor;
        uniform float uTravel, uTime, uPixelRatio;
        varying vec3 vColor;
        varying float vA;
        void main() {
          vec3 p = position;
          float z = mod(p.z + 900.0 + uTravel * 0.35, 1000.0);
          p.z = z - 900.0;
          float blink = pow(0.5 + 0.5 * sin(uTime * aData.y * 2.0 + aData.x), 12.0);
          vA = (0.25 + blink) * smoothstep(0.0, 0.1, z / 1000.0) * (1.0 - smoothstep(0.85, 1.0, z / 1000.0));
          vColor = aColor;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uPixelRatio * (2.0 + blink * 3.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vColor * smoothstep(0.5, 0.0, d) * vA * 3.0 * uOpacity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  update(time, travel, pixelRatio, weight = 1) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uTravel.value = travel;
    u.uPixelRatio.value = pixelRatio;
    u.uOpacity.value = weight;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
