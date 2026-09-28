import * as THREE from 'three';
import { loadAircraft } from './aircraft/loadAircraft.js';
import { EngineExhaust } from './effects/EngineExhaust.js';
import { ExhaustParticles, VortexRibbon } from './effects/Trails.js';
import { Sky, createSkyMaterial } from './world/Sky.js';
import { CloudSea, CloudPuffs } from './world/Clouds.js';
import { Dust, SpeedStreaks, DistantLights } from './world/Particles.js';
import { Hangar, MissionGates, Radar, Beacon } from './world/SectionWorlds.js';
import { Pipeline } from './post/Pipeline.js';
import { blendShot, SHOTS } from './shots.js';
import { nextLowerTier } from '../quality.js';

const damp = THREE.MathUtils.damp;
const UP = new THREE.Vector3(0, 1, 0);

// Incommensurate frequencies so the flight never visibly repeats.
function choreography(t, out) {
  out.x = 0.62 * Math.sin(0.11 * t) + 0.38 * Math.sin(0.263 * t + 1.3);
  out.y = 0.6 * Math.sin(0.13 * t + 0.4) + 0.4 * Math.sin(0.31 * t + 2.1);
  out.z = 0.72 * Math.sin(0.071 * t + 0.9) + 0.28 * Math.sin(0.19 * t + 0.2);
  return out;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Experience {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts { tier, reducedMotion, onTelemetry, onFatal }
   */
  constructor(canvas, { tier, reducedMotion = false, onTelemetry, onFatal }) {
    this.canvas = canvas;
    this.tier = tier;
    this.reducedMotion = reducedMotion;
    this.onTelemetry = onTelemetry;
    this.onFatal = onFatal;
    this.scrollTarget = 0;
    this.scroll = 0;
    this.mouse = new THREE.Vector2();
    this.mouseSmooth = new THREE.Vector2();
    this.time = Math.random() * 40; // start somewhere different on every visit
    this.flightTime = 18 + Math.random() * 30;
    this.travel = 0;
    this.shot = blendShot(0);
    this.env = { ...SHOTS[0] };
    this.running = false;
    this.disposed = false;
    this.frameTimes = [];
    this.slowFrames = 0;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, tier.maxPixelRatio);
  }

  async init() {
    const { tier } = this;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !tier.post,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer = renderer;
    renderer.setPixelRatio(this.pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x05070b, 1);
    if (tier.shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }

    this.canvas.addEventListener('webglcontextlost', this._onContextLost = (e) => {
      e.preventDefault();
      this.stop();
      this.onFatal?.('context-lost');
    });

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(40, 1, 0.3, 2400));
    camera.position.set(0, 3.5, 18);

    // Sky + reflections.
    this.sky = new Sky();
    scene.add(this.sky.mesh);
    this._buildEnvironmentMap();

    // Lights.
    this.hemi = new THREE.HemisphereLight(0x5a6f8a, 0x0a0d12, 0.55);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc8a0, 2.2);
    if (tier.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(tier.shadows, tier.shadows);
      const sc = this.sun.shadow.camera;
      sc.left = -13;
      sc.right = 13;
      sc.top = 13;
      sc.bottom = -13;
      sc.near = 1;
      sc.far = 140;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 3;
    }
    scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight(0xa8d0ff, 3.2);
    scene.add(this.rim, this.rim.target);
    this.under = new THREE.DirectionalLight(0x6b7a90, 0.5); // bounce from the cloud deck
    this.under.position.set(0, -1, 0.2);
    scene.add(this.under, this.under.target);

    // World.
    this.cloudSea = new CloudSea();
    this.cloudPuffs = new CloudPuffs(tier.clouds);
    this.dust = new Dust(Math.round(1800 * tier.particles));
    this.streaks = new SpeedStreaks(Math.round(70 * tier.particles));
    this.distant = new DistantLights(Math.round(30 + 30 * tier.particles));
    this.glowTex = glowTexture();
    this.hangar = new Hangar();
    this.gates = new MissionGates();
    this.radar = new Radar();
    this.beacon = new Beacon(this.glowTex);
    scene.add(
      this.cloudSea.group,
      this.cloudPuffs.mesh,
      this.dust.points,
      this.streaks.lines,
      this.distant.points,
      this.hangar.group,
      this.gates.group,
      this.radar.group,
      this.beacon.group,
    );

    // Aircraft.
    this.jetRig = new THREE.Group();
    scene.add(this.jetRig);
    this.aircraft = await loadAircraft(renderer);
    if (this.disposed) return;
    this.jetRig.add(this.aircraft.group);
    const { anchors } = this.aircraft;
    this.exhaust = new EngineExhaust({ nozzles: anchors.nozzles, radius: anchors.nozzleRadius, tier });
    this.jetRig.add(this.exhaust.group);
    this.particles = new ExhaustParticles(Math.round(420 * tier.particles) + 60);
    scene.add(this.particles.points);
    this.vortices = anchors.wingtips.map(() => new VortexRibbon(tier.particles > 0.5 ? 48 : 28));
    this.vortices.forEach((v) => scene.add(v.mesh));
    this._buildNavLights(anchors);

    this.pipeline = tier.post ? new Pipeline(renderer, scene, camera, tier) : null;

    // Scratch objects.
    this.jetPos = new THREE.Vector3(0, 0, -40);
    this.jetPrev = this.jetPos.clone();
    this.vel = new THREE.Vector3(0, 0, 0);
    this.accel = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.roll = 0;
    this.pitch = 0;
    this.envelope = { Cx: 0, Cy: -2.5, Cz: -20, Ax: 14, Ay: 3, Az: 12 };
    this.camTarget = new THREE.Vector3(0, 0, -40);
    this.lookTarget = new THREE.Vector3(0, 0, -40);
    this._c = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._basis = { right: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3() };
    this._emit = anchors.nozzles.map(() => new THREE.Vector3());
    this._tip = new THREE.Vector3();
    this._proj = new THREE.Vector3();
    this.throttle = 0.7;

    this.resize();
    // Settle the simulation so the first visible frame is already mid-flight.
    for (let i = 0; i < 90; i++) this._simulate(1 / 60, true);
    this.camera.position.copy(this.camTarget);
    this.camera.lookAt(this.lookTarget);

    // Warm up shaders/programs before the first real frame.
    renderer.compile(scene, camera);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this._onVisibility = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  _buildEnvironmentMap() {
    // Reflections come from the same sky plus a few soft "studio" strips that
    // give the metal crisp highlights.
    const envScene = new THREE.Scene();
    const skyMat = createSkyMaterial();
    skyMat.uniforms.uStars.value = 0;
    skyMat.uniforms.uHorizon.value.setRGB(0.1, 0.12, 0.16);
    skyMat.uniforms.uZenith.value.setRGB(0.025, 0.035, 0.06);
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat);
    envScene.add(skyMesh);
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.35, 1.5), side: THREE.DoubleSide });
    const warmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.95, 0.5), side: THREE.DoubleSide });
    const stripGeo = new THREE.PlaneGeometry(60, 4);
    const addStrip = (mat, pos, look) => {
      const m = new THREE.Mesh(stripGeo, mat);
      m.position.copy(pos);
      m.lookAt(look);
      envScene.add(m);
    };
    addStrip(stripMat, new THREE.Vector3(0, 30, 10), new THREE.Vector3(0, 0, 0));
    addStrip(stripMat, new THREE.Vector3(-25, 12, 25), new THREE.Vector3(0, 0, 0));
    addStrip(warmMat, new THREE.Vector3(-12, 3, -40), new THREE.Vector3(0, 0, 0));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();
    skyMesh.geometry.dispose();
    skyMat.dispose();
    stripMat.dispose();
    warmMat.dispose();
    stripGeo.dispose();
  }

  _buildNavLights(anchors) {
    const make = (color, pos, scale) => {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      s.scale.setScalar(scale);
      this.jetRig.add(s);
      return s;
    };
    const [l, r] = anchors.wingtips;
    this.navLights = {
      left: make(new THREE.Color(4, 0.3, 0.2), l, 0.9),
      right: make(new THREE.Color(0.3, 4, 0.8), r, 0.9),
      tail: make(new THREE.Color(3, 3, 3), new THREE.Vector3(0, 0.3, 7.9), 0.7),
      strobeL: make(new THREE.Color(8, 8, 8), l.clone().add(new THREE.Vector3(0, 0, 0.4)), 1.6),
      strobeR: make(new THREE.Color(8, 8, 8), r.clone().add(new THREE.Vector3(0, 0, 0.4)), 1.6),
    };
  }

  setScroll(s) {
    this.scrollTarget = s;
  }

  setPointer(x, y) {
    if (this.reducedMotion) return;
    this.mouse.set(x, y);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline?.setSize(w, h, this.pixelRatio);
    this.portrait = w / h < 0.9;
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  stop() {
    this.running = false;
    this.renderer?.setAnimationLoop(null);
  }

  /** Advance the simulation without rendering (used for poster/screenshot capture). */
  warp(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) {
      this._simulate(step, false);
      this._render(step, true);
    }
  }

  _frame() {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(raw, 1 / 20);
    this._simulate(dt, false);
    this._render(dt);
    this._adapt(raw);
  }

  _simulate(dt, warmup) {
    const motion = this.reducedMotion ? 0.35 : 1;
    this.time += dt;
    this.flightTime += dt * motion;

    this.scroll = warmup ? this.scrollTarget : damp(this.scroll, this.scrollTarget, 3, dt);
    const shot = blendShot(this.scroll, this.shot);

    // Environment weights follow the scroll directly (already smoothed).
    this.env = shot;
    this.travel += shot.speed * dt * motion;

    // Flight envelope glides more slowly so the jet flies, rather than jumps, to its new stage.
    const E = this.envelope;
    for (const k of ['Cx', 'Cy', 'Cz', 'Ax', 'Ay', 'Az']) E[k] = damp(E[k], shot[k], warmup ? 60 : 1.1, dt);

    const L = choreography(this.flightTime, this._c);
    this.jetPrev.copy(this.jetPos);
    this.jetPos.set(E.Cx + E.Ax * L.x, E.Cy + E.Ay * L.y, E.Cz + E.Az * L.z);

    // Velocity / acceleration in the flight frame, smoothed.
    const inst = this._v.subVectors(this.jetPos, this.jetPrev).divideScalar(Math.max(dt, 1e-4));
    const prevVel = this._w.copy(this.vel);
    this.vel.lerp(inst, 1 - Math.exp(-4 * dt));
    const acc = prevVel.sub(this.vel).multiplyScalar(-1 / Math.max(dt, 1e-4));
    this.accel.lerp(acc, 1 - Math.exp(-2.5 * dt));

    // Heading: true velocity is frame velocity plus airspeed toward -Z.
    const air = shot.speed * motion + 1e-3;
    const dir = this._w.set(this.vel.x * 2.4, this.vel.y * 2.0, this.vel.z - air).normalize();
    this.forward.lerp(dir, 1 - Math.exp(-3 * dt)).normalize();

    const bankTarget = THREE.MathUtils.clamp(-this.accel.x * 0.35 - this.vel.x * 0.02, -0.55, 0.55);
    const wobble = Math.sin(this.flightTime * 0.37) * 0.05 + Math.sin(this.flightTime * 1.3) * 0.012;
    this.roll = damp(this.roll, bankTarget + wobble, 2.2, dt);
    this.pitch = damp(this.pitch, Math.sin(this.flightTime * 0.21) * 0.03, 1.5, dt);

    this._m.lookAt(new THREE.Vector3(), this.forward, UP); // rig +Z (tail) points opposite the heading
    this._q.setFromRotationMatrix(this._m);
    this.jetRig.quaternion.copy(this._q);
    this.jetRig.rotateZ(this.roll);
    this.jetRig.rotateX(this.pitch);
    this.jetRig.position.copy(this.jetPos);
    this.jetRig.position.y += Math.sin(this.time * 1.7) * 0.05; // turbulence

    // Throttle responds to the aircraft surging ahead or easing back.
    const surge = THREE.MathUtils.clamp(-this.vel.z * 0.09, -0.4, 0.5);
    const tgt = THREE.MathUtils.clamp(0.62 + surge + (shot.speed - 50) * 0.01, 0.25, 1);
    this.throttle = damp(this.throttle, tgt, 2, dt);

    this._updateCamera(dt, shot, warmup);
  }

  _headingBasis() {
    const b = this._basis;
    const f = this._w.copy(this.forward);
    f.y *= 0.5;
    f.normalize();
    b.back.copy(f).negate();
    b.right.crossVectors(f, UP).normalize();
    b.up.crossVectors(b.right, f).normalize();
    return b;
  }

  _updateCamera(dt, s, warmup) {
    const b = this._headingBasis();
    const E = this.envelope;
    const centre = new THREE.Vector3(E.Cx, E.Cy, E.Cz);

    // Free camera.
    const free = new THREE.Vector3(s.camX, s.camY, s.camZ).add(centre);
    free.addScaledVector(this._v.subVectors(this.jetPos, centre), s.follow);
    // Jet-locked camera.
    const locked = this.jetPos.clone().addScaledVector(b.right, s.jx).addScaledVector(b.up, s.jy).addScaledVector(b.back, s.jz);
    const camPos = free.lerp(locked, s.lock);

    this.mouseSmooth.x = damp(this.mouseSmooth.x, this.mouse.x, 2.5, dt);
    this.mouseSmooth.y = damp(this.mouseSmooth.y, this.mouse.y, 2.5, dt);
    const parallax = 1 - s.lock * 0.5;
    camPos.addScaledVector(b.right, this.mouseSmooth.x * 2.2 * parallax);
    camPos.addScaledVector(b.up, -this.mouseSmooth.y * 1.2 * parallax);

    // Aim.
    const cockpit = this.aircraft.anchors.cockpit.clone().applyQuaternion(this.jetRig.quaternion).add(this.jetPos);
    const jetAim = this.jetPos.clone().lerp(cockpit, s.cockpit);
    const aim = centre.clone().lerp(jetAim, s.look).addScaledVector(this.forward, s.ahead);
    aim.addScaledVector(b.right, this.mouseSmooth.x * 0.8);

    const k = warmup ? 60 : 2.6;
    this.camTarget.set(damp(this.camTarget.x, camPos.x, k, dt), damp(this.camTarget.y, camPos.y, k, dt), damp(this.camTarget.z, camPos.z, k, dt));
    this.lookTarget.set(damp(this.lookTarget.x, aim.x, k * 1.3, dt), damp(this.lookTarget.y, aim.y, k * 1.3, dt), damp(this.lookTarget.z, aim.z, k * 1.3, dt));

    const cam = this.camera;
    cam.position.copy(this.camTarget);
    // Gentle handheld drift.
    cam.position.x += Math.sin(this.time * 0.5) * 0.12;
    cam.position.y += Math.sin(this.time * 0.37 + 1) * 0.1;
    cam.lookAt(this.lookTarget);
    cam.rotateZ(THREE.MathUtils.degToRad(s.dutch) + this.roll * 0.06);

    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov;
    }
    // Frame the jet beside the copy on wide screens; centre it on portrait screens.
    const fx = this.portrait ? 0 : s.frameX;
    const fy = this.portrait ? Math.max(0, s.frameY) + 0.06 : s.frameY;
    const w = this.width || 1;
    const h = this.height || 1;
    cam.setViewOffset(w, h, -fx * w, fy * h, w, h);
    cam.updateProjectionMatrix();
  }

  _render(dt, skipDraw = false) {
    const s = this.env;
    const sky = this.sky.uniforms;
    const r = this.renderer;
    const cam = this.camera;

    // Lighting and sky follow the section.
    sky.uSunStrength.value = s.sun;
    sky.uSunDir.value.set(-0.35, -0.03 + 0.07 * THREE.MathUtils.clamp((s.sun - 1) / 0.8, 0, 1), -1).normalize();
    sky.uStars.value = s.stars;
    const dawn = THREE.MathUtils.clamp((s.sun - 1) / 0.8, 0, 1);
    sky.uHorizon.value.setRGB(0.02 + 0.02 * dawn, 0.028 + 0.008 * dawn, 0.045);
    r.toneMappingExposure = s.exposure;
    this.sky.update(cam, this.time, this.travel);

    // Key light: high moonlight from above-left-behind so the upper surfaces read clearly.
    this.sun.position.copy(this.jetPos).add(this._w.set(-62, 48, -14));
    this.sun.target.position.copy(this.jetPos);
    this.sun.intensity = 0.9 + s.sun * 0.4;
    // Rim light always sits behind the aircraft relative to the camera.
    const rimDir = this._v.subVectors(this.jetPos, cam.position).normalize();
    this.rim.position.copy(this.jetPos).addScaledVector(rimDir, 40).add(this._w.set(0, 6, 0));
    this.rim.target.position.copy(this.jetPos);
    this.rim.intensity = 2.2 + s.hangar * 0.3;
    this.under.target.position.copy(this.jetPos);
    this.hemi.intensity = 0.45 + s.hangar * 0.35;

    // World.
    const tier = this.tier;
    this.cloudSea.update(dt, this.time, this.travel, cam, sky, Math.min(1, s.clouds + 0.25) * (1 - s.hangar * 0.85));
    this.cloudPuffs.update(this.time, this.travel, sky, s.clouds);
    this.dust.update(this.time, this.travel, cam.position, this.pixelRatio, sky, 1);
    this.streaks.update(this.travel, cam.position, s.speed, 0.6 + s.hangar * 0.6);
    this.distant.update(this.time, this.travel, this.pixelRatio, 1 - s.hangar);
    this.hangar.update(this.travel, 0, s.hangar);
    this.gates.update(this.time, this.travel, 0, s.gates);
    this.radar.update(this.time, this.travel, this.jetPos, s.radar);
    this.beacon.update(this.time, s.beacon, cam.position);

    // Aircraft effects.
    this.exhaust.update(dt, this.time, this.throttle);
    const inner = this.aircraft.nozzleInnerMat;
    if (inner) inner.emissiveIntensity = 0.4 + this.throttle * 1.2;
    this.jetRig.updateMatrixWorld();
    const q = this.jetRig.quaternion;
    const back = this._w.set(0, 0, 1).applyQuaternion(q);
    this.aircraft.anchors.nozzles.forEach((n, i) => this._emit[i].copy(n).applyMatrix4(this.jetRig.matrixWorld));
    this.particles.material.uniforms.uPixelRatio.value = this.pixelRatio;
    this.particles.update(dt, this._emit, back, s.speed, this.throttle);
    const g = Math.min(1, Math.abs(this.roll) * 1.4 + this.accel.length() * 0.2);
    this.aircraft.anchors.wingtips.forEach((tip, i) => {
      this._tip.copy(tip).applyMatrix4(this.jetRig.matrixWorld);
      this.vortices[i].update(dt, this._tip, s.speed, cam.position, 0.02 + g * 0.12);
    });
    const blink = (this.time % 1.2) < 0.06;
    this.navLights.strobeL.visible = this.navLights.strobeR.visible = blink;
    this.navLights.tail.material.opacity = 0.6 + 0.4 * Math.sin(this.time * 3);

    // Lens: focus on the aircraft, heat haze behind the nozzles.
    const lens = this.pipeline?.lensUniforms;
    const distToJet = cam.position.distanceTo(this.jetPos);
    if (lens) {
      lens.uFocus.value = distToJet;
      lens.uFocusRange.value = 10 + distToJet * 0.35;
      lens.uMaxBlur.value = s.dof * Math.min(this.pixelRatio, 1.5);
      const a = this._proj.copy(this.exhaust.heatAnchor).applyMatrix4(this.jetRig.matrixWorld).project(cam);
      lens.uHeatA.value.set(a.x * 0.5 + 0.5, a.y * 0.5 + 0.5);
      const tail = this._proj.copy(this.exhaust.heatAnchor).add(new THREE.Vector3(0, 0, 9)).applyMatrix4(this.jetRig.matrixWorld).project(cam);
      lens.uHeatB.value.set(tail.x * 0.5 + 0.5, tail.y * 0.5 + 0.5);
      lens.uHeatWidth.value = THREE.MathUtils.clamp(6 / distToJet, 0.004, 0.08);
      lens.uHeat.value = a.z < 1 ? this.throttle : 0;
    }

    if (skipDraw) return;
    if (this.pipeline) this.pipeline.render(dt, this.time);
    else r.render(this.scene, cam);

    this._emitTelemetry(distToJet);
  }

  _emitTelemetry(dist) {
    if (!this.onTelemetry) return;
    const p = this._proj.copy(this.jetPos).project(this.camera);
    const visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
    const heading = (Math.atan2(this.forward.x, -this.forward.z) * 180) / Math.PI;
    this.onTelemetry({
      x: (p.x * 0.5 + 0.5) * this.width,
      y: (-p.y * 0.5 + 0.5) * this.height,
      visible,
      size: THREE.MathUtils.clamp((this.height * 9) / Math.max(dist, 1), 40, 360),
      range: dist,
      altitude: 31000 + this.jetPos.y * 55 + Math.sin(this.flightTime * 0.05) * 400,
      speed: this.env.speed * 8.6 - this.vel.z * 6,
      heading: (heading + 360 + 270) % 360,
      roll: (this.roll * 180) / Math.PI,
      pitch: (this.pitch * 180) / Math.PI + this.vel.y * 2,
      g: 1 + Math.abs(this.roll) * 0.9 + this.accel.length() * 0.15,
      throttle: this.throttle,
      scroll: this.scroll,
      tier: this.tier.name,
    });
  }

  // Adaptive quality: drop pixel ratio first, then effects, then a whole tier.
  _adapt(raw) {
    if (raw > 0.5) return; // tab switch / hitch, ignore
    this.frameTimes.push(raw);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 40) {
      this.slowFrames++;
      if (this.pixelRatio > 0.8) {
        this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.2);
        this.resize();
      } else if (this.slowFrames > 4) {
        const lower = nextLowerTier(this.tier);
        if (lower) this._downgrade(lower);
      }
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
    }
  }

  _downgrade(tier) {
    this.tier = tier;
    if (!tier.post && this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
    if (!tier.shadows && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.cloudPuffs.mesh.geometry.instanceCount = Math.min(this.cloudPuffs.mesh.geometry.instanceCount, tier.clouds);
    this.slowFrames = 0;
    this.pixelRatio = Math.min(this.pixelRatio + 0.25, tier.maxPixelRatio);
    this.resize();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    const parts = [
      this.sky, this.cloudSea, this.cloudPuffs, this.dust, this.streaks, this.distant,
      this.hangar, this.gates, this.radar, this.beacon, this.exhaust, this.particles,
      this.aircraft, this.pipeline, ...(this.vortices || []),
    ];
    parts.forEach((p) => p?.dispose?.());
    if (this.navLights) Object.values(this.navLights).forEach((s) => s.material.dispose());
    this.glowTex?.dispose();
    this.envRT?.dispose();
    this.renderer?.dispose();
  }
}
