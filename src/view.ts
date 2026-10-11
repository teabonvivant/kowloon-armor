import { ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HemisphereLight,
  PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import type { Game } from './game';
import { wallFraction } from './math';
import { createWorld } from './render/world';

export class View {
  readonly scene = new Scene(); readonly camera = new PerspectiveCamera(50, 1, 0.2, 1000);
  readonly renderer: WebGLRenderer; readonly world = createWorld();
  private readonly sun = new DirectionalLight(0xffe1b8, 3.3);
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private orbit = 0; private shake = 0; private elapsed = 0;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace; this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new Color(0x899a9e); this.scene.fog = new FogExp2(0x899a9e, 0.005);
    this.scene.add(new HemisphereLight(0xb7d3df, 0x514734, 3.3));
    const fill = new DirectionalLight(0xc4d5e3, 1.4);
    fill.position.set(12, 18, -30); this.scene.add(fill);
    this.sun.position.set(-45, 85, 65); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 250 });
    this.sun.shadow.bias = -0.0007; this.sun.shadow.normalBias = 0.15;
    this.scene.add(this.sun, this.sun.target, this.world.group);
    this.camera.position.set(15, 8, 115); this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault();
      document.dispatchEvent(new CustomEvent('graphics-lost')); });
  }
  resize(): void {
    this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  rotate(): void { this.orbit += Math.PI / 3; }
  recoil(): void { if (!this.reducedMotion) this.shake = 0.28; }
  quality(level: string): void {
    this.renderer.setPixelRatio(level === 'low' ? 1 : Math.min(devicePixelRatio, level === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = level !== 'low'; this.resize();
  }
  render(game: Game, dt: number): void {
    this.elapsed += dt;
    const actor = game.player, p = actor.visual.root.position;
    const desired = new Vector3(), look = new Vector3();
    let fov = 50;
    if (game.phase === 'garage') {
      const angle = 2.35 + this.orbit + (this.reducedMotion ? 0 : Math.sin(this.elapsed * 0.08) * 0.08);
      const distance = innerWidth < 768 ? 23 : 17;
      desired.set(p.x + Math.sin(angle) * distance, 6.6, p.z + Math.cos(angle) * distance);
      const clearance = wallFraction(p.x, p.z, desired.x - p.x, desired.z - p.z, game.world.obstacles);
      if (clearance < 1) { desired.x = p.x + (desired.x - p.x) * Math.max(.15, clearance - .08);
        desired.z = p.z + (desired.z - p.z) * Math.max(.15, clearance - .08); }
      look.copy(p).add(new Vector3(innerWidth > 1100 ? -1.2 : 0, 1.3, 0));
      fov = 48;
    } else if (game.scope || game.cameraMode === 'gunner') {
      desired.copy(p).add(new Vector3(-Math.sin(actor.aim) * 5.8, 2.65, -Math.cos(actor.aim) * 5.8));
      look.copy(game.aimPoint); fov = game.scope ? 22 : 42;
    } else if (game.cameraMode === 'driver') {
      desired.copy(p).add(new Vector3(-Math.sin(actor.yaw) * 2.4, 1.5, -Math.cos(actor.yaw) * 2.4));
      look.copy(p).add(new Vector3(-Math.sin(actor.yaw) * 100, 1.5, -Math.cos(actor.yaw) * 100)); fov = 70;
    } else {
      desired.copy(p).add(new Vector3(Math.sin(actor.aim) * 15, 8.2, Math.cos(actor.aim) * 15));
      const distance = wallFraction(p.x, p.z, desired.x - p.x, desired.z - p.z, game.world.obstacles);
      if (distance < 1) { desired.x = p.x + (desired.x - p.x) * Math.max(0.15, distance - 0.07);
        desired.z = p.z + (desired.z - p.z) * Math.max(0.15, distance - 0.07); }
      look.copy(game.aimPoint);
    }
    actor.visual.root.visible = game.phase === 'garage' || (game.cameraMode === 'chase' && !game.scope);
    this.camera.position.lerp(desired, game.phase === 'garage' ? 1 - Math.exp(-dt * 4) : 1 - Math.exp(-dt * 12));
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake > 0) this.camera.position.y += (Math.random() - 0.5) * this.shake;
    this.camera.lookAt(look); this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();
    this.sun.position.set(p.x - 45, 85, p.z + 65); this.sun.target.position.copy(p);
    this.renderer.render(this.scene, this.camera);
  }
}
