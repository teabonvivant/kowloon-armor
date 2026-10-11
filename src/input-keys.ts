import { clampInput } from './input-config';
import { DEFAULT_BINDINGS } from './key-bindings';
import type { KeyAction, KeyBindings } from './key-bindings';

export type LocalInput = {
  readonly throttle: number; readonly steer: number;
  readonly aimX: number; readonly aimY: number;
  readonly fire: boolean; readonly brake: boolean; readonly scope: boolean;
  readonly toggleCamera: boolean; readonly pause: boolean;
  readonly pointerX?: number; readonly pointerY?: number; readonly observe?: boolean;
};

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
  bindings: KeyBindings = { ...DEFAULT_BINDINGS };
  scopeMode: 'hold' | 'toggle' = 'hold';
  private scopeLatched = false;

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
    if (!this.acceptsKeyboard(event.target) || event.ctrlKey || event.metaKey || event.altKey || !this.playKey(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
    if (!event.repeat) this.edges.add(event.code);
    if (event.code === this.bindings.controls && !event.repeat) {
      this.element.dispatchEvent(new CustomEvent('tank-controls', { bubbles: true }));
    }
    if (event.code === this.bindings.recentre && !event.repeat) this.element.dispatchEvent(new CustomEvent('tank-recentre'));
    if (event.code === this.bindings.pointer && !event.repeat && document.body.classList.contains('in-battle')) {
      if (document.pointerLockElement === this.element) document.exitPointerLock();
      else if (this.element.requestPointerLock) {
        Promise.resolve(this.element.requestPointerLock()).catch(() => this.element.dispatchEvent(new CustomEvent('tank-pointer-error')));
      }
    }
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (this.acceptsKeyboard(event.target) && this.playKey(event.code)) event.preventDefault();
  };

  private playKey(code: string): boolean {
    return code === 'Escape' || Object.values(this.bindings).includes(code) || this.alias('turretLeft') === code ||
      this.alias('turretRight') === code || this.alias('scope') === code;
  }

  private alias(action: KeyAction): string {
    const alternate = action === 'turretLeft' ? 'ArrowLeft' : action === 'turretRight' ? 'ArrowRight' : action === 'scope' ? 'ShiftRight' : '';
    return this.bindings[action] === DEFAULT_BINDINGS[action] && !Object.values(this.bindings).includes(alternate) ? alternate : '';
  }

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

  sample(_dt: number): LocalInput {
    if (!this.acceptsKeyboard(document.activeElement)) this.keys.clear();
    const held = (action: KeyAction): number => Number(this.keys.has(this.bindings[action]) || this.keys.has(this.alias(action)));
    const pressed = (action: KeyAction): boolean => this.edges.has(this.bindings[action]) || this.edges.has(this.alias(action));
    if (this.scopeMode === 'toggle' && pressed('scope')) this.scopeLatched = !this.scopeLatched;
    const pointerScale = this.sensitivity * .00165;
    const frame: LocalInput = {
      throttle: held('forward') - held('reverse'),
      steer: held('right') - held('left'),
      aimX: clampInput(held('turretRight') - held('turretLeft')),
      aimY: clampInput(held('elevate') - held('lower')),
      pointerX: this.mouseX * pointerScale,
      pointerY: this.mouseY * pointerScale * (this.invertY ? 1 : -1),
      observe: !!held('observe'),
      fire: !!held('fire') || this.mouseFire,
      brake: !!held('brake'),
      scope: this.scopeMode === 'toggle' ? this.scopeLatched : !!held('scope'),
      toggleCamera: pressed('camera'), pause: this.edges.has('Escape'),
    };
    this.mouseX = 0;
    this.mouseY = 0;
    this.edges.clear();
    return frame;
  }

  reset(): void {
    this.keys.clear(); this.edges.clear();
    this.mouseFire = false; this.dragging = false; this.mouseX = 0; this.mouseY = 0;
    this.scopeLatched = false;
  }

  dispose(): void { this.abort.abort(); this.reset(); }
}
