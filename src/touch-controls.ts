import type { Preferences } from './preferences';
import type { InputFrame } from './input';
import { TouchState, wantsTouch } from './touch-state';
import type { TouchRole } from './touch-state';

export class TouchControls {
  readonly state = new TouchState();
  private readonly root = document.createElement('div');
  private readonly abort = new AbortController();
  private readonly coarse = window.matchMedia('(pointer: coarse)');
  private touched = false;
  private playing = false;
  private mode: Preferences['controlMode'] = 'auto';
  private density: Preferences['hudDensity'] = 'compact';
  private sensitivity = 1;
  private invert = false;
  private autoBrake = true;
  private driveCenter = { x: 0, y: 0, radius: 50 };
  private landscape = innerWidth > innerHeight;

  constructor(private readonly canvas: HTMLElement) {
    this.root.id = 'touch-controls'; this.root.hidden = true;
    this.root.innerHTML = `<div class="touch-drive"><div id="touch-stick" role="group" aria-label="駕駛搖桿：上前進、下倒車、左右轉彎"><span>駕駛</span><i></i></div><button data-touch-hold="brake" aria-label="按住煞車">煞車</button></div>
      <div class="touch-actions"><button id="touch-scope" aria-pressed="false">瞄準鏡</button><button id="touch-observe" aria-pressed="false">觀察</button><button id="touch-fire" data-touch-hold="fire" aria-label="按住開火"><strong>開火</strong><small>就緒</small></button><button id="touch-recentre" aria-label="炮塔回正">回正</button></div>`;
    document.body.append(this.root);
    const options = { signal: this.abort.signal };
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' && !this.touched) { this.touched = true; this.refresh(); }
    }, { ...options, capture: true });
    this.coarse.addEventListener('change', () => { this.reset(); this.refresh(); }, options);
    this.root.addEventListener('pointerdown', this.down, options);
    this.canvas.addEventListener('pointerdown', this.down, options);
    window.addEventListener('pointermove', this.move, { ...options, passive: false });
    window.addEventListener('pointerup', this.up, options);
    window.addEventListener('pointercancel', this.up, options);
    document.addEventListener('lostpointercapture', this.up, options);
    this.root.addEventListener('contextmenu', event => event.preventDefault(), options);
    this.root.addEventListener('click', event => {
      if (!this.playing || !this.enabled) return;
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (target?.id === 'touch-scope') this.state.scope = !this.state.scope;
      if (target?.id === 'touch-observe') this.state.observe = !this.state.observe;
      if (target?.id === 'touch-recentre') this.canvas.dispatchEvent(new CustomEvent('tank-recentre'));
      this.buttons();
    }, options);
    window.addEventListener('resize', () => {
      const landscape = innerWidth > innerHeight;
      if (landscape !== this.landscape && this.enabled) {
        this.reset(); this.canvas.dispatchEvent(new CustomEvent('tank-pause'));
      }
      this.landscape = landscape;
    }, options);
    this.refresh();
  }
  get enabled(): boolean { return wantsTouch(this.mode, this.coarse.matches, this.touched); }
  configure(preferences: Preferences): void {
    this.mode = preferences.controlMode; this.density = preferences.hudDensity;
    this.sensitivity = preferences.touchSensitivity; this.invert = preferences.touchInvert;
    this.autoBrake = preferences.touchAutoBrake;
    document.body.classList.toggle('touch-left', preferences.touchHand === 'left');
    this.reset(); this.refresh();
  }
  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing; if (!playing) this.reset(); this.refresh();
  }
  private refresh(): void {
    document.body.classList.toggle('touch-enabled', this.enabled);
    document.body.classList.toggle('compact-hud', this.enabled || this.density === 'compact');
    this.root.hidden = !this.enabled || !this.playing;
  }
  private readonly down = (event: PointerEvent): void => {
    if (!this.enabled || !this.playing || document.querySelector('dialog[open]')) return;
    const target = event.target instanceof Element ? event.target : null;
    const stick = target?.closest<HTMLElement>('#touch-stick');
    const hold = target?.closest<HTMLElement>('[data-touch-hold]');
    const aiming = event.target === this.canvas && event.pointerType === 'touch';
    const role: TouchRole | undefined = stick ? 'drive' : hold?.dataset['touchHold'] as TouchRole | undefined ?? (aiming ? 'aim' : undefined);
    if (!role || event.button !== 0) return;
    let center = this.driveCenter;
    if (stick) {
      const rect = stick.getBoundingClientRect();
      center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, radius: rect.width / 2 };
    }
    const start = role === 'drive' ? center : { x: event.clientX, y: event.clientY };
    if (!this.state.begin(event.pointerId, role, start.x, start.y)) return;
    if (role === 'drive') this.driveCenter = center;
    event.preventDefault();
    const owner = stick ?? hold ?? this.canvas;
    owner.setPointerCapture(event.pointerId);
    owner.classList.add('pressed');
    this.move(event);
  };
  private readonly move = (event: PointerEvent): void => {
    const role = this.state.move(event.pointerId, event.clientX, event.clientY, this.driveCenter.radius);
    if (!role) return;
    event.preventDefault();
    if (role === 'drive') {
      const deltaX = event.clientX - this.driveCenter.x, deltaY = event.clientY - this.driveCenter.y;
      const scale = Math.min(1, this.driveCenter.radius / Math.max(1, Math.hypot(deltaX, deltaY)));
      const knob = this.root.querySelector<HTMLElement>('#touch-stick i')!;
      knob.style.transform = `translate(${deltaX * scale * .65}px, ${deltaY * scale * .65}px)`;
    }
  };
  private readonly up = (event: PointerEvent): void => {
    const role = this.state.end(event.pointerId, event.type !== 'pointerup');
    if (!role) return;
    if (role === 'drive') this.root.querySelector<HTMLElement>('#touch-stick i')!.style.transform = '';
    const owner = role === 'drive' ? this.root.querySelector('#touch-stick') : this.root.querySelector(`[data-touch-hold="${role}"]`);
    owner?.classList.remove('pressed');
  };
  private buttons(): void {
    this.root.querySelector('#touch-scope')!.setAttribute('aria-pressed', String(this.state.scope));
    this.root.querySelector('#touch-observe')!.setAttribute('aria-pressed', String(this.state.observe));
  }
  sample(scopeScale: number): InputFrame {
    return this.state.sample(this.sensitivity, this.invert, scopeScale * .5, this.autoBrake);
  }
  reset(): void {
    this.state.reset(); this.buttons();
    this.root.querySelector<HTMLElement>('#touch-stick i')!.style.transform = '';
    for (const element of this.root.querySelectorAll('.pressed')) element.classList.remove('pressed');
  }
  dispose(): void { this.abort.abort(); this.reset(); this.root.remove(); }
}
