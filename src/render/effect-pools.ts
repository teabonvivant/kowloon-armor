import { AdditiveBlending, BoxGeometry, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute,
  InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, Points, ShaderMaterial,
  SphereGeometry, Vector3 } from 'three';
import type { Scene } from 'three';
import { flashEnvelope, particleEnvelope } from '../effect-math';

export interface Particle {
  age: number; life: number; delay: number; size: number; opacity: number; growth: number; gravity: number; drag: number;
  readonly position: Vector3; readonly velocity: Vector3; readonly color: Color; readonly scale: Vector3;
  readonly normal: Vector3; anchor: Object3D | null; readonly local: Vector3; readonly localNormal: Vector3;
  own: boolean; bounce: boolean;
}
function slot(): Particle {
  return { age: 0, life: 0, delay: 0, size: 1, opacity: 1, growth: 0, gravity: 0, drag: 0,
    position: new Vector3(), velocity: new Vector3(), color: new Color(), scale: new Vector3(1, 1, 1),
    normal: new Vector3(0, 1, 0), anchor: null, local: new Vector3(), localNormal: new Vector3(), own: false, bounce: false };
}
export class EffectPool {
  readonly slots: Particle[];
  readonly object: InstancedMesh<BufferGeometry, MeshBasicMaterial> | Points<BufferGeometry, ShaderMaterial>;
  private readonly opacity: Float32BufferAttribute | InstancedBufferAttribute;
  private readonly color: Float32BufferAttribute | null;
  private readonly size: Float32BufferAttribute | null;
  private cursor = 0; private disposed = false;
  private readonly pose = new Object3D();
  private readonly axis = new Vector3(0, 0, 1);
  limit: number;
  brightness = 1; ownVisibility = 1;
  constructor(scene: Scene, readonly capacity: number, readonly kind: 'smoke' | 'dust' | 'flash' | 'spark' | 'debris' | 'mark' | 'glow', name: string) {
    this.limit = capacity; this.slots = Array.from({ length: capacity }, slot);
    const points = kind === 'smoke' || kind === 'dust';
    this.opacity = points ? new Float32BufferAttribute(new Float32Array(capacity), 1) : new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.opacity.setUsage(DynamicDrawUsage);
    if (points) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage));
      this.color = new Float32BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
      this.size = new Float32BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
      geometry.setAttribute('tint', this.color); geometry.setAttribute('diameter', this.size); geometry.setAttribute('alpha', this.opacity);
      const material = new ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
        uniforms: { projectionScale: { value: 500 }, fogColor: { value: new Color(0x8cabb8) }, fogDensity: { value: .0033 } },
        vertexShader: `attribute vec3 tint; attribute float diameter; attribute float alpha;
          uniform float projectionScale; varying vec3 vTint; varying float vAlpha;
          #include <fog_pars_vertex>
          void main(){ vec4 mvPosition=modelViewMatrix*vec4(position,1.); vTint=tint;
            vAlpha=alpha*smoothstep(.5,3.5,-mvPosition.z); gl_Position=projectionMatrix*mvPosition;
            gl_PointSize=clamp(diameter*projectionScale/max(.5,-mvPosition.z),1.,180.);
            #include <fog_vertex>
          }`,
        fragmentShader: `varying vec3 vTint; varying float vAlpha;
          #include <fog_pars_fragment>
          void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);
            float edge=pow(max(0.,1.-r),1.6);float wisps=.84+.16*sin(p.x*14.+sin(p.y*11.));
            gl_FragColor=vec4(vTint,edge*wisps*vAlpha);if(gl_FragColor.a<.003)discard;
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }` });
      this.object = new Points(geometry, material);
    } else {
      this.color = null; this.size = null;
      const plane = kind === 'mark' || kind === 'glow';
      const geometry = plane ? new PlaneGeometry(1, 1) : kind === 'debris' ? new BoxGeometry(1, 1, 1) : new SphereGeometry(1, 8, 5);
      geometry.setAttribute('alpha', this.opacity);
      const material = new MeshBasicMaterial({ transparent: true, depthWrite: false, color: 0xffffff,
        ...(kind === 'flash' || kind === 'spark' || kind === 'glow' ? { blending: AdditiveBlending } : {}),
        polygonOffset: plane, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      material.onBeforeCompile = shader => {
        shader.vertexShader = `attribute float alpha; varying float vAlpha; varying vec2 vEffectUV; varying vec3 vEffectNormal;\n${shader.vertexShader}`
          .replace('#include <begin_vertex>', `#include <begin_vertex>\nvAlpha=alpha; vEffectUV=uv;
            mat3 im=mat3(instanceMatrix); vec3 ns=max(vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2])),vec3(.000001));
            vEffectNormal=normalMatrix*im*(normal/ns);`);
        shader.fragmentShader = `varying float vAlpha; varying vec2 vEffectUV; varying vec3 vEffectNormal;\n${shader.fragmentShader}`
          .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.a*=vAlpha;${plane ? 'diffuseColor.a*=pow(max(0.,1.-length(vEffectUV*2.-1.)),1.4);' : kind === 'flash' ? 'diffuseColor.a*=pow(abs(normalize(vEffectNormal).z),.85)*(.72+.28*sin(vEffectUV.y*31.+vEffectUV.x*19.));' : ''}`);
      };
      material.customProgramCacheKey = () => `effect-${plane ? 'plane' : kind === 'flash' ? 'flame' : 'solid'}-v2`;
      this.object = new InstancedMesh(geometry, material, capacity);
      this.object.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    this.object.name = name; this.object.frustumCulled = false; this.object.visible = false;
    scene.add(this.object);
  }
  take(at: Vector3, life: number): Particle | null {
    if (this.disposed || this.limit === 0) return null;
    const index = this.cursor++ % this.limit, p = this.slots[index]; if (!p) return null;
    p.age = 0; p.life = life; p.delay = 0; p.size = 1; p.opacity = 1; p.growth = 0; p.gravity = 0; p.drag = 0;
    p.position.copy(at); p.velocity.set(0, 0, 0); p.scale.set(1, 1, 1); p.normal.set(0, 1, 0);
    p.color.setHex(0xffffff); p.anchor = null; p.own = false; p.bounce = false;
    return p;
  }
  update(dt: number): void {
    if (dt <= 0 || !Number.isFinite(dt) || this.disposed) return;
    if (!this.object.visible && !this.slots.some(p => p.life > 0)) return;
    for (let index = 0; index < this.capacity; index++) {
      const p = this.slots[index]; if (!p || p.life <= 0) continue;
      p.age += dt;
      if (p.age >= p.life + p.delay || index >= this.limit) { p.life = 0; p.anchor = null; continue; }
      if (p.age < p.delay) continue;
      if (p.anchor) {
        p.anchor.updateWorldMatrix(true, false); p.position.copy(p.local).applyMatrix4(p.anchor.matrixWorld);
        p.normal.copy(p.localNormal).transformDirection(p.anchor.matrixWorld);
      } else {
        const elapsed = Math.min(dt, p.age - p.delay), drag = Math.exp(-p.drag * elapsed);
        p.velocity.multiplyScalar(drag); p.velocity.y -= p.gravity * elapsed;
        p.position.addScaledVector(p.velocity, elapsed);
        if (p.gravity > 0 && p.position.y < .035) {
          p.position.y = .035; p.velocity.x *= .35; p.velocity.z *= .35;
          p.velocity.y = p.bounce ? 0 : Math.abs(p.velocity.y) * .24; p.bounce = true;
        }
        if (this.kind === 'spark' && p.velocity.lengthSq() > .0001) p.normal.copy(p.velocity).normalize();
      }
    }
    this.sync();
  }
  sync(): void {
    if (this.disposed) return;
    if (this.object instanceof Points) this.object.geometry.setDrawRange(0, this.limit);
    else this.object.count = this.limit;
    let visible = false;
    const positions = this.object.geometry.getAttribute('position');
    for (let i = 0; i < this.capacity; i++) {
      const p = this.slots[i]; if (!p) continue;
      const age = p.age - p.delay, alive = p.life > 0 && age >= 0 && i < this.limit;
      const envelope = this.kind === 'flash' || this.kind === 'glow' ? flashEnvelope(age * .14 / Math.max(.001, p.life)) : this.kind === 'mark' ? Math.min(1, (p.life - age) / 4) : particleEnvelope(age, p.life);
      const alpha = alive ? Math.max(0, p.opacity * envelope * (p.own ? this.ownVisibility : 1)) : 0;
      visible ||= alpha > .001;
      this.opacity.setX(i, alpha * (this.kind === 'flash' || this.kind === 'spark' || this.kind === 'glow' ? this.brightness : 1));
      if (this.object instanceof Points) {
        positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
        const cool = this.kind === 'smoke' ? Math.min(.12, Math.max(0, age) * .04) : 0;
        this.color?.setXYZ(i, p.color.r + cool, p.color.g + cool, p.color.b + cool);
        this.size?.setX(i, alpha > 0 ? p.size + Math.max(0, age) * p.growth : 0);
      } else {
        this.pose.position.copy(p.position); this.pose.rotation.set(0, 0, 0);
        this.pose.quaternion.setFromUnitVectors(this.axis, p.normal);
        this.pose.scale.copy(p.scale).multiplyScalar(alpha > .001 ? p.size : 0);
        if (this.kind === 'flash') this.pose.scale.multiplyScalar(.75 + Math.max(0, age) * 4);
        if (this.kind === 'debris') { this.pose.rotation.x += age * 4; this.pose.rotation.z += age * 3; }
        this.pose.updateMatrix(); this.object.setMatrixAt(i, this.pose.matrix); this.object.setColorAt(i, p.color);
      }
    }
    this.opacity.needsUpdate = true; this.object.visible = visible;
    if (this.object instanceof Points) { positions.needsUpdate = true; if (this.color) this.color.needsUpdate = true; if (this.size) this.size.needsUpdate = true; }
    else { this.object.instanceMatrix.needsUpdate = true; if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true; }
  }
  clear(): void { for (const p of this.slots) { p.life = 0; p.anchor = null; } this.cursor = 0; this.sync(); }
  get active(): number { return this.slots.reduce((n, p) => n + Number(p.life > 0), 0); }
  dispose(): void {
    if (this.disposed) return; this.clear(); this.disposed = true;
    this.object.removeFromParent(); this.object.geometry.dispose(); this.object.material.dispose();
    if (this.object instanceof InstancedMesh) this.object.dispose();
  }
}
