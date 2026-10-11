import { clampInput } from './input-config';

export type LocalInput = {
  readonly throttle: number; readonly steer: number;
  readonly aimX: number; readonly aimY: number;
  readonly fire: boolean; readonly brake: boolean; readonly scope: boolean;
  readonly toggleCamera: boolean; readonly pause: boolean;
};

const PLAY_KEYS = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight',
  'ArrowUp', 'ArrowDown', 'Space', 'KeyV', 'Escape', 'ShiftLeft', 'ShiftRight',
  'KeyH', 'KeyB', 'KeyM', 'KeyF',
]);

export class LocalControls {
  private readonly keys = new Set<string>();
  private readonly edges = new Set<string>();
  private readonly abort = new AbortController();
  private mouseFire = false;
  private dragging = false;
  private mouseX = 0;
  private mouseY = 0;
  sensitivity = 1;
  invertY = false;

  constructor(private readonly element: HTMLElement) {
    if (element.tabIndex < 0) element.tabIndex = 0;
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', this.keyDown, options);
    window.addEventListener('keyup', this.keyUp, options);
    element.addEventListener('pointerdown', this.pointerDown, options);
    element.addEventListener('contextmenu', this.contextMenu, options);
    window.addEventListener('pointermove', this.pointerMove, options);
    window.addEventListener('pointerup', this.pointerUp, options);
    window.addEventListener('pointercancel', this.pointerUp, options);
    window.addEventListener('blur', () => this.reset(), options);
    document.addEventListener('pointerlockchange', () => {
      this.reset();
      if (!document.pointerLockElement) this.element.dispatchEvent(new CustomEvent('tank-pause'));
    }, options);
  }

  private acceptsKeyboard(target: EventTarget | null): boolean {
    return target === this.element || target === document.body || target === document.documentElement;
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (!this.acceptsKeyboard(event.target) || !PLAY_KEYS.has(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
    if (!event.repeat) this.edges.add(event.code);
    if (event.code === 'KeyH' && !event.repeat) {
      this.element.dispatchEvent(new CustomEvent('tank-controls', { bubbles: true }));
    }
    if (event.code === 'KeyF' && !event.repeat) this.element.dispatchEvent(new CustomEvent('tank-recentre'));
    if (event.code === 'KeyM' && !event.repeat && document.body.classList.contains('in-battle')) {
      if (document.pointerLockElement === this.element) document.exitPointerLock();
      else if (this.element.requestPointerLock) {
        Promise.resolve(this.element.requestPointerLock()).catch(() => this.element.dispatchEvent(new CustomEvent('tank-pointer-error')));
      }
    }
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (this.acceptsKeyboard(event.target) && PLAY_KEYS.has(event.code)) event.preventDefault();
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    this.element.focus({ preventScroll: true });
    this.mouseFire = event.button === 0 || this.mouseFire;
    this.dragging = event.button === 2 || this.dragging;
    event.preventDefault();
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.dragging && document.pointerLockElement !== this.element) return;
    this.mouseX += event.movementX;
    this.mouseY += event.movementY;
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (event.button === 0 || event.type === 'pointercancel') this.mouseFire = false;
    if (event.button === 2 || event.type === 'pointercancel') this.dragging = false;
  };

  private readonly contextMenu = (event: MouseEvent): void => event.preventDefault();

  sample(dt: number): LocalInput {
    if (!this.acceptsKeyboard(document.activeElement)) this.keys.clear();
    const held = (code: string): number => Number(this.keys.has(code));
    const pointerScale = this.sensitivity * 0.0015 / Math.max(1 / 120, dt);
    const frame: LocalInput = {
      throttle: held('KeyW') - held('KeyS'),
      steer: held('KeyD') - held('KeyA'),
      aimX: clampInput(held('KeyE') + held('ArrowRight') - held('KeyQ') - held('ArrowLeft') + this.mouseX * pointerScale),
      aimY: clampInput(held('ArrowUp') - held('ArrowDown') + this.mouseY * pointerScale * (this.invertY ? 1 : -1)),
      fire: this.keys.has('Space') || this.mouseFire,
      brake: this.keys.has('KeyB'),
      scope: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      toggleCamera: this.edges.has('KeyV'), pause: this.edges.has('Escape'),
    };
    this.mouseX = 0;
    this.mouseY = 0;
    this.edges.clear();
    return frame;
  }

  reset(): void {
    this.keys.clear(); this.edges.clear();
    this.mouseFire = false; this.dragging = false; this.mouseX = 0; this.mouseY = 0;
  }

  dispose(): void { this.abort.abort(); this.reset(); }
}
