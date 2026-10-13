import { ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HemisphereLight,
  PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { Game } from './game';
import { wallFraction } from './math';
import { createWorld } from './render/world';
import { AdaptiveResolution } from './resolution';
import { FrameDiagnostics } from './operations';

export class View {
  readonly scene = new Scene(); readonly camera = new PerspectiveCamera(50, 1, 0.2, 1000);
  readonly renderer: WebGLRenderer; readonly world = createWorld();
  scopeZoom = 2;
  highContrast = false;
  chaseDistance = 15; chaseFov = 50; shakeStrength = 1;
  diagnosticsEnabled = false;
  readonly frameDiagnostics = new FrameDiagnostics();
  private adaptiveEnabled = false;
  private readonly resolution = new AdaptiveResolution();
  private baseRatio = 1;
  private readonly ambient = new HemisphereLight(0xb7d3df, 0x514734, 2.6);
  private readonly zone = new Mesh(new RingGeometry(.94, 1, 64), new MeshBasicMaterial({ color: 0xe8a65a, transparent: true, opacity: .75, depthWrite: false }));
  private readonly sun = new DirectionalLight(0xffdfb0, 4.1);
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly desired = new Vector3();
  private readonly look = new Vector3();
  private readonly aim = new Vector3();
  private orbit = 0; private shake = 0; private elapsed = 0;
  private garageOffset = { horizontal: 0, vertical: 0 };
  private garageFov = 48;
  private framingDirty = true; private cameraInGarage = false;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace; this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new Color(0x8cabb8); this.scene.fog = new FogExp2(0x8cabb8, 0.0033);
    this.scene.add(this.ambient);
    const fill = new DirectionalLight(0xc4d5e3, 1.4);
    fill.position.set(12, 18, -30); this.scene.add(fill);
    this.sun.position.set(-45, 85, 65); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 250 });
    this.sun.shadow.bias = -0.0007; this.sun.shadow.normalBias = 0.15;
    this.scene.add(this.sun, this.sun.target, this.world.group);
    this.zone.rotation.x = -Math.PI / 2; this.zone.visible = false; this.scene.add(this.zone);
    this.camera.position.set(15, 8, 115); this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault();
      document.dispatchEvent(new CustomEvent('graphics-lost')); });
  }
  resize(): void {
    this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.frameGarage();
  }
  frameGarage(): void {
    const stage = document.querySelector('.showroom')?.getBoundingClientRect();
    if (stage) {
      this.garageOffset = { horizontal: innerWidth / 2 - (stage.left + stage.width / 2), vertical: innerHeight / 2 - (stage.top + window.scrollY + stage.height / 2) };
      this.garageFov = Math.min(78, 2 * Math.atan(Math.tan(24 * Math.PI / 180) * Math.max(1, innerHeight / Math.max(220, stage.width) * .6)) * 180 / Math.PI);
    }
    this.framingDirty = true;
  }
  rotate(): void { this.orbit += Math.PI / 3; }
  reduceMotion(enabled: boolean): void {
    this.reducedMotion = enabled || matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.toggle('reduce-motion', this.reducedMotion);
  }
  recoil(): void { if (!this.reducedMotion) this.shake = 0.28 * this.shakeStrength; }
  lighting(preset: 'day' | 'dusk'): void {
    const dusk = preset === 'dusk', sky = dusk ? 0x666a85 : 0x8cabb8;
    this.scene.background = new Color(sky); this.scene.fog = new FogExp2(sky, dusk ? .0038 : .0033);
    this.sun.color.setHex(dusk ? 0xffac72 : 0xffdfb0); this.sun.intensity = dusk ? 2.6 : 4.1;
    this.ambient.color.setHex(dusk ? 0x9bace2 : 0xb7d3df); this.ambient.intensity = dusk ? 2.1 : 2.6;
  }
  adaptive(enabled: boolean): void {
    this.adaptiveEnabled = enabled; this.resolution.reset(); this.renderer.setPixelRatio(this.baseRatio);
  }
  sampleFrame(seconds: number, playing: boolean): void {
    this.frameDiagnostics.sample(seconds, playing && this.diagnosticsEnabled);
    if (this.adaptiveEnabled && playing && this.resolution.sample(seconds)) this.renderer.setPixelRatio(this.baseRatio * this.resolution.scale);
  }
  get renderScale(): number { return this.resolution.scale; }
  quality(level: string): void {
    this.baseRatio = level === 'low' ? 1 : Math.min(devicePixelRatio, level === 'high' ? 2 : 1.5);
    this.resolution.reset(); this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.shadowMap.enabled = level !== 'low';
    const size = level === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    this.resize();
  }
  render(game: Game, dt: number): void {
    this.elapsed += dt;
    const actor = game.player, p = actor.visual.root.position;
    const desired = this.desired, look = this.look;
    game.getAimPoint(this.aim);
    let fov = this.chaseFov;
    const inGarage = game.phase === 'garage';
    if (this.framingDirty || inGarage !== this.cameraInGarage) {
      if (inGarage) this.camera.setViewOffset(innerWidth, innerHeight, this.garageOffset.horizontal, this.garageOffset.vertical, innerWidth, innerHeight);
      else this.camera.clearViewOffset();
      this.cameraInGarage = inGarage; this.framingDirty = false;
    }
    if (game.phase === 'garage') {
      const angle = 2.35 + this.orbit + (this.reducedMotion ? 0 : Math.sin(this.elapsed * 0.08) * 0.08);
      const distance = innerWidth < 768 ? 23 : 17;
      desired.set(p.x + Math.sin(angle) * distance, 6.6, p.z + Math.cos(angle) * distance);
      const clearance = wallFraction(p.x, p.z, desired.x - p.x, desired.z - p.z, game.world.obstacles);
      if (clearance < 1) { desired.x = p.x + (desired.x - p.x) * Math.max(.15, clearance - .08);
        desired.z = p.z + (desired.z - p.z) * Math.max(.15, clearance - .08); }
      look.set(innerWidth > 1100 ? -1.2 : 0, 1.3, 0).add(p);
      fov = this.garageFov;
    } else if (!game.observing && (game.scope || game.cameraMode === 'gunner')) {
      desired.set(-Math.sin(actor.aim) * 5.8, 2.65, -Math.cos(actor.aim) * 5.8).add(p);
      look.copy(this.aim); fov = game.scope ? 50 / this.scopeZoom : 42;
    } else if (!game.observing && game.cameraMode === 'driver') {
      desired.set(-Math.sin(actor.yaw) * 2.4, 1.5, -Math.cos(actor.yaw) * 2.4).add(p);
      look.set(-Math.sin(actor.yaw) * 100, 1.5, -Math.cos(actor.yaw) * 100).add(p); fov = 70;
    } else {
      const yaw = game.observing ? game.observationYaw : actor.aim;
      desired.set(Math.sin(yaw) * this.chaseDistance, 8.2, Math.cos(yaw) * this.chaseDistance).add(p);
      const distance = wallFraction(p.x, p.z, desired.x - p.x, desired.z - p.z, game.world.obstacles);
      if (distance < 1) { desired.x = p.x + (desired.x - p.x) * Math.max(0.15, distance - 0.07);
        desired.z = p.z + (desired.z - p.z) * Math.max(0.15, distance - 0.07); }
      if (game.observing) look.set(-Math.sin(yaw) * 100, 3, -Math.cos(yaw) * 100).add(p);
      else look.copy(this.aim);
    }
    actor.visual.root.visible = game.phase === 'garage' || game.observing || (game.cameraMode === 'chase' && !game.scope);
    const goal = game.mode === 'campaign' && game.phase !== 'garage' ? game.mission?.objective : undefined;
    this.zone.visible = !!goal && goal.kind !== 'clear';
    if (goal && goal.kind !== 'clear') {
      this.zone.position.set(goal.center[0], .06, goal.center[1]); this.zone.scale.setScalar(goal.radius);
      this.zone.material.color.setHex(game.objective.contested ? this.highContrast ? 0xffcf5a : 0xf36a5b : game.objective.inside ? this.highContrast ? 0x64e5ff : 0x84c7b0 : 0xe8a65a);
    }
    const stop = game.mode === 'drive' && !game.training && game.phase !== 'garage' ? game.tour.destination : undefined;
    if (stop) { this.zone.visible = true; this.zone.position.set(stop.x, .06, stop.z); this.zone.scale.setScalar(10); this.zone.material.color.setHex(0xffd18b); }
    this.camera.position.lerp(desired, game.phase === 'garage' ? 1 - Math.exp(-dt * 4) : 1 - Math.exp(-dt * 12));
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake > 0) this.camera.position.y += (Math.random() - 0.5) * this.shake;
    this.camera.lookAt(look);
    if (Math.abs(fov - this.camera.fov) > .01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10); this.camera.updateProjectionMatrix();
    }
    this.sun.position.set(p.x - 45, 85, p.z + 65); this.sun.target.position.copy(p);
    this.renderer.render(this.scene, this.camera);
  }
}
