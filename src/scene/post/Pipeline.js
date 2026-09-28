import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { NOISE } from '../glsl.js';

// Render → Lens (depth of field + engine heat haze) → Bloom → Tone map → Grade.

class LensPass extends Pass {
  constructor(camera, { dof, heat }) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      defines: { USE_DOF: dof ? 1 : 0, USE_HEAT: heat ? 1 : 0 },
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uFocus: { value: 30 },
        uFocusRange: { value: 18 },
        uMaxBlur: { value: 5 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uHeatA: { value: new THREE.Vector2(0.5, 0.5) },
        uHeatB: { value: new THREE.Vector2(0.5, 0.5) },
        uHeatWidth: { value: 0.02 },
        uHeat: { value: 0 },
        uAspect: { value: 1 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor, tDepth;
        uniform float uNear, uFar, uFocus, uFocusRange, uMaxBlur, uTime, uHeat, uHeatWidth, uAspect;
        uniform vec2 uResolution, uHeatA, uHeatB;
        varying vec2 vUv;
        ${NOISE}
        float viewDepth(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return -perspectiveDepthToViewZ(d, uNear, uFar);
        }
        float coc(float z) { return clamp(abs(z - uFocus) / uFocusRange, 0.0, 1.0); }
        void main() {
          vec2 uv = vUv;
          #if USE_HEAT
          {
            vec2 pa = uv - uHeatA, ba = uHeatB - uHeatA;
            pa.x *= uAspect; ba.x *= uAspect;
            float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
            float d = length(pa - ba * h);
            float w = uHeatWidth * (0.6 + h * 1.6);
            float m = smoothstep(w, 0.0, d) * (1.0 - h) * smoothstep(0.0, 0.08, h) * uHeat;
            vec2 n = vec2(vnoise(uv * 90.0 + vec2(0.0, uTime * 14.0)), vnoise(uv * 90.0 + vec2(uTime * 11.0, 7.0))) - 0.5;
            uv += n * m * 0.012;
          }
          #endif
          vec4 col = texture2D(tColor, uv);
          #if USE_DOF
          {
            float c = coc(viewDepth(uv)) * uMaxBlur;
            if (c > 0.35) {
              vec2 px = 1.0 / uResolution;
              vec3 acc = col.rgb;
              float wsum = 1.0;
              const float GOLDEN = 2.39996323;
              for (int i = 0; i < 16; i++) {
                float fi = float(i) + 0.5;
                float r = sqrt(fi / 16.0) * c;
                float a = fi * GOLDEN;
                vec2 o = vec2(cos(a), sin(a)) * r * px;
                vec2 suv = uv + o;
                float sc = coc(viewDepth(suv)) * uMaxBlur;
                float w = smoothstep(r - 0.5, r + 0.5, sc); // ignore sharp samples behind blur
                acc += texture2D(tColor, suv).rgb * w;
                wsum += w;
              }
              col.rgb = acc / wsum;
            }
          }
          #endif
          gl_FragColor = col;
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tColor.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  setSize(w, h) {
    this.material.uniforms.uResolution.value.set(w, h);
    this.material.uniforms.uAspect.value = w / h;
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uAberration: { value: 0.0018 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uAberration;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.13) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberration * 8.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // Subtle split-tone: cool shadows, warm highlights.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col += (vec3(-0.01, 0.0, 0.018) * (1.0 - l) + vec3(0.02, 0.008, -0.012) * l) * 0.8;
      col += (h(vUv * 1000.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Pipeline {
  constructor(renderer, scene, camera, tier) {
    this.renderer = renderer;
    this.tier = tier;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
      samples: 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.lens = null;
    if (tier.dof || tier.heat) {
      this.lens = new LensPass(camera, { dof: tier.dof, heat: tier.heat });
      this.composer.addPass(this.lens);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * tier.bloomScale, size.y * tier.bloomScale), 0.42, 0.18, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  get lensUniforms() {
    return this.lens?.material.uniforms ?? null;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.setSize(w * pixelRatio * this.tier.bloomScale * 2, h * pixelRatio * this.tier.bloomScale * 2);
    this.lens?.setSize(w * pixelRatio, h * pixelRatio);
  }

  render(dt, time) {
    this.grade.uniforms.uTime.value = time % 100;
    if (this.lens) this.lens.material.uniforms.uTime.value = time;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.passes.forEach((p) => p.dispose?.());
    this.composer.renderTarget1.depthTexture?.dispose();
    this.composer.renderTarget2.depthTexture?.dispose();
    this.composer.dispose();
  }
}
