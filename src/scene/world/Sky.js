import * as THREE from 'three';
import { NOISE } from '../glsl.js';

// Dark high-altitude sky: deep blue zenith, a low warm band where the sun sits
// below the horizon, forward scattering around the sun, faint stars and high
// cirrus. Also used to build the environment map for reflections.

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(0.0012, 0.0022, 0.0055) },
      uHorizon: { value: new THREE.Color(0.02, 0.028, 0.045) },
      uGround: { value: new THREE.Color(0.003, 0.004, 0.007) },
      uSunDir: { value: new THREE.Vector3(-0.35, -0.03, -1).normalize() },
      uSunColor: { value: new THREE.Color(0.95, 0.5, 0.26) },
      uSunStrength: { value: 1 },
      uStars: { value: 1 },
      uTime: { value: 0 },
      uTravel: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGround, uSunColor;
      uniform vec3 uSunDir;
      uniform float uSunStrength, uStars, uTime, uTravel;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.65, h), 0.55));
        col = mix(col, uGround, smoothstep(0.0, -0.25, h));

        float mu = max(dot(d, uSunDir), 0.0);
        float band = exp(-abs(h - 0.02) * 9.0);
        vec3 sun = uSunColor * uSunStrength * 0.4;
        col += sun * band * (0.035 + 0.3 * pow(mu, 5.0));
        col += sun * pow(mu, 60.0) * 0.35 * smoothstep(-0.08, 0.02, h);
        col += sun * pow(mu, 2400.0) * 1.2 * smoothstep(0.0, 0.01, uSunDir.y);

        // High cirrus drifting as we travel.
        vec2 cp = d.xz / max(d.y + 0.12, 0.05) * 1.4 + vec2(0.0, -uTravel * 0.0006);
        float cir = smoothstep(0.52, 0.9, fbm(cp * vec2(0.6, 2.2)));
        col += (uHorizon * 0.8 + sun * 0.15 * pow(mu, 3.0)) * cir * smoothstep(0.02, 0.3, h) * 0.6;

        // Stars.
        vec3 sd = d * 420.0;
        vec3 cell = floor(sd);
        float s = hash13(cell);
        float star = step(0.9975, s) * smoothstep(0.08, 0.5, h) * (1.0 - cir);
        float tw = 0.7 + 0.3 * sin(uTime * (1.5 + s * 5.0) + s * 40.0);
        float dist = length(fract(sd) - 0.5);
        col += vec3(0.85, 0.9, 1.0) * star * tw * smoothstep(0.35, 0.0, dist) * 1.6 * uStars;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
       
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

export class Sky {
  constructor() {
    this.material = createSkyMaterial();
    this.geometry = new THREE.SphereGeometry(900, 48, 24);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
  get uniforms() {
    return this.material.uniforms;
  }
  update(camera, time, travel) {
    this.mesh.position.copy(camera.position);
    this.uniforms.uTime.value = time;
    this.uniforms.uTravel.value = travel;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
