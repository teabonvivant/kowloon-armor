import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial,
  Points, PointsMaterial, SphereGeometry, Vector3 } from 'three';
import type { Scene } from 'three';

interface Burst { readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>; readonly smoke: Points<BufferGeometry, PointsMaterial>; readonly velocities: readonly Vector3[]; age: number; readonly big: boolean }
export class Effects {
  private readonly bursts: Burst[] = [];
  private readonly sphere = new SphereGeometry(1, 10, 8);
  constructor(private readonly scene: Scene) {}
  burst(at: Vector3, big = false): void {
    const mesh = new Mesh(this.sphere, new MeshBasicMaterial({ color: 0xffb35b, transparent: true,
      opacity: 0.9, blending: AdditiveBlending, depthWrite: false }));
    mesh.position.copy(at); this.scene.add(mesh);
    const coords: number[] = [], velocities: Vector3[] = [];
    for (let index = 0; index < 32; index++) {
      coords.push(at.x, at.y, at.z);
      velocities.push(new Vector3((Math.random() - 0.5) * 8, Math.random() * 7 + 1, (Math.random() - 0.5) * 8));
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(coords, 3));
    const smoke = new Points(geometry, new PointsMaterial({ color: new Color(big ? 0x645a48 : 0xc9bd97),
      size: big ? 2.5 : 0.8, transparent: true, opacity: 0.7, depthWrite: false }));
    this.scene.add(smoke); this.bursts.push({ mesh, smoke, velocities, age: 0, big });
  }
  update(dt: number): void {
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
      if (burst.age > 2.4) { this.scene.remove(burst.mesh, burst.smoke); burst.mesh.material.dispose();
        burst.smoke.geometry.dispose(); burst.smoke.material.dispose(); this.bursts.splice(index, 1); }
    }
  }
  clear(): void { this.update(10); }
}
