import type { InputFrame } from './input';

export type TouchRole = 'drive' | 'aim' | 'fire' | 'brake';
export function wantsTouch(mode: 'auto' | 'touch' | 'desktop', coarse: boolean, touched: boolean): boolean {
  return mode === 'touch' || mode === 'auto' && (coarse || touched);
}
export function stickAxes(deltaX: number, deltaY: number, radius: number): { steer: number; throttle: number } {
  const length = Math.hypot(deltaX, deltaY), distance = length / Math.max(1, radius);
  if (distance <= .14) return { steer: 0, throttle: 0 };
  const amount = Math.min(1, (distance - .14) / .86);
  return { steer: deltaX / length * amount, throttle: -deltaY / length * amount };
}
export class TouchState {
  private readonly pointers = new Map<number, { role: TouchRole; x: number; y: number }>();
  private throttle = 0;
  private steer = 0;
  private deltaX = 0;
  private deltaY = 0;
  private releasedDrive = false;
  private fireQueued = false;
  scope = false;
  observe = false;

  begin(id: number, role: TouchRole, x: number, y: number): boolean {
    if (this.pointers.has(id) || [...this.pointers.values()].some(pointer => pointer.role === role)) return false;
    this.pointers.set(id, { role, x, y });
    if (role === 'drive') this.releasedDrive = false;
    if (role === 'fire') this.fireQueued = true;
    return true;
  }
  move(id: number, x: number, y: number, radius: number): TouchRole | undefined {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    if (pointer.role === 'drive') {
      const axes = stickAxes(x - pointer.x, y - pointer.y, radius);
      this.throttle = axes.throttle; this.steer = axes.steer;
    } else if (pointer.role === 'aim') {
      this.deltaX += x - pointer.x; this.deltaY += y - pointer.y;
      pointer.x = x; pointer.y = y;
    }
    return pointer.role;
  }
  end(id: number, cancelled = false): TouchRole | undefined {
    const role = this.pointers.get(id)?.role;
    this.pointers.delete(id);
    if (role === 'fire' && cancelled) this.fireQueued = false;
    if (role === 'drive') { this.throttle = 0; this.steer = 0; this.releasedDrive = true; }
    return role;
  }
  sample(sensitivity: number, invert: boolean, scopeScale: number, autoBrake: boolean): InputFrame {
    const held = (role: TouchRole): boolean => [...this.pointers.values()].some(pointer => pointer.role === role);
    const scale = .004 * sensitivity * (this.scope && !this.observe ? scopeScale : 1);
    const frame: InputFrame = { throttle: this.throttle, steer: this.steer, aimX: 0, aimY: 0,
      pointerX: this.deltaX * scale, pointerY: this.deltaY * scale * (invert ? 1 : -1),
      fire: held('fire') || this.fireQueued, brake: held('brake') || autoBrake && this.releasedDrive,
      scope: this.scope, observe: this.observe, toggleCamera: false, pause: false };
    this.deltaX = 0; this.deltaY = 0;
    this.fireQueued = false;
    return frame;
  }
  reset(): void {
    this.pointers.clear(); this.throttle = 0; this.steer = 0; this.deltaX = 0; this.deltaY = 0;
    this.releasedDrive = false; this.fireQueued = false; this.scope = false; this.observe = false;
  }
}
