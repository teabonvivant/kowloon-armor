import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial,
  Points, PointsMaterial, SphereGeometry, Vector3, DataTexture, RGBAFormat, LinearFilter } from 'three';
import type { Scene } from 'three';

interface Burst { readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>; readonly smoke: Points<BufferGeometry, PointsMaterial>; readonly velocities: readonly Vector3[]; age: number; readonly big: boolean }
const smokePixels = new Uint8Array(32 * 32 * 4);
for (let row = 0; row < 32; row++) for (let column = 0; column < 32; column++) {
  const offset = (row * 32 + column) * 4;
  smokePixels[offset] = smokePixels[offset + 1] = smokePixels[offset + 2] = 255;
  smokePixels[offset + 3] = Math.round(Math.max(0, 1 - Math.hypot(column - 15.5, row - 15.5) / 15.5) ** 1.5 * 255);
}
const smokeTexture = new DataTexture(smokePixels, 32, 32, RGBAFormat);
smokeTexture.magFilter = LinearFilter; smokeTexture.needsUpdate = true;
export class Effects {
  private readonly bursts: Burst[] = [];
  private readonly sphere = new SphereGeometry(1, 10, 8);
  private readonly dustPositions = new Float32Array(96 * 3).fill(-1000);
  private readonly dustLife = new Float32Array(96);
  private readonly dustMotion = new Float32Array(96 * 3);
  private readonly dustCloud: Points<BufferGeometry, PointsMaterial>;
  private dustIndex = 0;
  private readonly damageLife = new Float32Array(128);
  private readonly damageCloud: Points<BufferGeometry, PointsMaterial>;
  private damageIndex = 0;
  constructor(private readonly scene: Scene) {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(this.dustPositions, 3));
    this.dustCloud = new Points(geometry, new PointsMaterial({ map: smokeTexture, color: 0xa99e83, size: 1.6, opacity: .4, transparent: true, depthWrite: false }));
    this.dustCloud.name = 'track-dust'; this.dustCloud.frustumCulled = false; this.dustCloud.visible = false;
    scene.add(this.dustCloud);
    const smoke = new BufferGeometry(); smoke.setAttribute('position', new Float32BufferAttribute(new Float32Array(128 * 3).fill(-1000), 3));
    this.damageCloud = new Points(smoke, new PointsMaterial({ map: smokeTexture, color: 0x424a49, size: 4.8, opacity: .55, transparent: true, depthWrite: false }));
    this.damageCloud.name = 'damage-smoke-pool'; this.damageCloud.frustumCulled = false; this.damageCloud.visible = false;
    scene.add(this.damageCloud);
  }
  damage(at: Vector3, destroyed: boolean): void {
    const index = this.damageIndex++ % 128;
    this.damageCloud.geometry.getAttribute('position').setXYZ(index, at.x + (Math.random() - .5) * 1.2, 2.6, at.z + (Math.random() - .5) * 1.2);
    this.damageLife[index] = destroyed ? 4.5 : 2.8;
  }
  dust(at: Vector3, yaw: number, speed: number): void {
    for (const side of [-1, 1]) {
      const index = this.dustIndex++ % 96, offset = index * 3;
      const direction = speed < 0 ? -1 : 1;
      const positions = this.dustCloud.geometry.getAttribute('position');
      positions.setXYZ(index, at.x + Math.sin(yaw) * 2.8 * direction + Math.cos(yaw) * side * 1.8, .35,
        at.z + Math.cos(yaw) * 2.8 * direction - Math.sin(yaw) * side * 1.8);
      this.dustLife[index] = 1.2;
      this.dustMotion[offset] = Math.sin(yaw) * direction * 1.4 + side * .3;
      this.dustMotion[offset + 1] = .55; this.dustMotion[offset + 2] = Math.cos(yaw) * direction * 1.4;
    }
  }
  burst(at: Vector3, big = false): void {
    if (this.bursts.length >= 20) this.release(0);
    const mesh = new Mesh(this.sphere, new MeshBasicMaterial({ color: 0xffb35b, transparent: true,
      opacity: 0.9, blending: AdditiveBlending, depthWrite: false }));
    mesh.position.copy(at); this.scene.add(mesh);
    const coords: number[] = [], velocities: Vector3[] = [];
    for (let index = 0; index < 32; index++) {
      coords.push(at.x, at.y, at.z);
      velocities.push(new Vector3((Math.random() - 0.5) * 8, Math.random() * 7 + 1, (Math.random() - 0.5) * 8));
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(coords, 3));
    const smoke = new Points(geometry, new PointsMaterial({ map: smokeTexture, color: new Color(big ? 0x645a48 : 0xc9bd97),
      size: big ? 2.5 : 0.8, transparent: true, opacity: 0.7, depthWrite: false }));
    smoke.name = 'combat-smoke';
    this.scene.add(smoke); this.bursts.push({ mesh, smoke, velocities, age: 0, big });
  }
  update(dt: number): void {
    const damage = this.damageCloud.geometry.getAttribute('position'); let smoking = false;
    for (let index = 0; index < 128; index++) {
      if ((this.damageLife[index] ?? 0) <= 0) continue;
      this.damageLife[index] = Math.max(0, (this.damageLife[index] ?? 0) - dt);
      if (this.damageLife[index] === 0) damage.setXYZ(index, -1000, -1000, -1000);
      else { smoking = true; damage.setXYZ(index, damage.getX(index) + dt * .65, damage.getY(index) + dt * 1.7, damage.getZ(index) + dt * .25); }
    }
    if (smoking || this.damageCloud.visible) damage.needsUpdate = true;
    this.damageCloud.visible = smoking;
    const dust = this.dustCloud.geometry.getAttribute('position'); let visible = false;
    for (let index = 0; index < 96; index++) {
      const life = this.dustLife[index] ?? 0; if (life <= 0) continue;
      const remaining = Math.max(0, life - dt); this.dustLife[index] = remaining;
      if (remaining === 0) dust.setXYZ(index, -1000, -1000, -1000);
      else { visible = true; dust.setXYZ(index, dust.getX(index) + (this.dustMotion[index * 3] ?? 0) * dt,
        dust.getY(index) + .55 * dt, dust.getZ(index) + (this.dustMotion[index * 3 + 2] ?? 0) * dt); }
    }
    if (visible || this.dustCloud.visible) dust.needsUpdate = true;
    this.dustCloud.visible = visible;
    for (let index = this.bursts.length - 1; index >= 0; index--) {
      const burst = this.bursts[index]; if (!burst) continue;
      burst.age += dt;
      burst.mesh.scale.setScalar((burst.big ? 5 : 1.3) * Math.max(0.01, burst.age * 6));
      if (burst.mesh.material instanceof MeshBasicMaterial) burst.mesh.material.opacity = Math.max(0, 1 - burst.age * 4);
      const positions = burst.smoke.geometry.getAttribute('position');
      burst.velocities.forEach((v, i) => positions.setXYZ(i, positions.getX(i) + v.x * dt,
        positions.getY(i) + v.y * dt, positions.getZ(i) + v.z * dt));
      positions.needsUpdate = true;
      if (burst.smoke.material instanceof PointsMaterial) burst.smoke.material.opacity = Math.max(0, 0.7 - burst.age * 0.3);
      if (burst.age > 2.4) this.release(index);
    }
  }
  private release(index: number): void {
    const burst = this.bursts[index]; if (!burst) return;
    this.scene.remove(burst.mesh, burst.smoke); burst.mesh.material.dispose();
    burst.smoke.geometry.dispose(); burst.smoke.material.dispose(); this.bursts.splice(index, 1);
  }
  clear(): void { this.update(10); }
}
