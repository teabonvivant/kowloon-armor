import { clampInput, controllerSchema, loadControllerConfig, saveControllerConfig } from './input-config';
import type { ControllerConfig } from './input-config';
import { connectedPads, ControllerPoller, NEUTRAL_INPUT } from './input-controller';
import { LocalControls } from './input-keys';
import type { KeyBindings } from './key-bindings';
import { TouchControls } from './touch-controls';

export type { ControllerConfig } from './input-config';

export type InputFrame = {
  readonly throttle: number;
  readonly steer: number;
  readonly aimX: number;
  readonly aimY: number;
  readonly fire: boolean;
  readonly brake: boolean;
  readonly scope: boolean;
  readonly toggleCamera: boolean;
  readonly pause: boolean;
  readonly pointerX?: number;
  readonly pointerY?: number;
  readonly observe?: boolean;
};

export class Input {
  private config = loadControllerConfig();
  private readonly local: LocalControls;
  readonly touch: TouchControls;
  private readonly controller = new ControllerPoller();
  private readonly abort = new AbortController();
  private focused = true;
  private persistenceStatus = '設定會自動儲存在這部電腦。';
  scopeSensitivity = 1;

  constructor(element: HTMLElement, touch?: TouchControls) {
    this.local = new LocalControls(element);
    this.touch = touch ?? new TouchControls(element);
    window.addEventListener('blur', () => { this.focused = false; this.reset(); }, { signal: this.abort.signal });
    window.addEventListener('focus', () => { this.focused = true; }, { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    }, { signal: this.abort.signal });
  }

  get devices(): readonly Gamepad[] { return connectedPads(); }
  get status(): string {
    return typeof navigator.getGamepads === 'function'
      ? this.controller.status
      : '這個瀏覽器未支援搖桿。請用 Windows 版 Chrome 或 Edge 開啟。';
  }
  get settings(): ControllerConfig { return this.config; }
  get saveStatus(): string { return this.persistenceStatus; }
  setPointer(sensitivity: number, invertY: boolean): void {
    this.local.sensitivity = sensitivity; this.local.invertY = invertY;
  }
  setKeyboard(bindings: KeyBindings, scopeMode: 'hold' | 'toggle'): void {
    this.local.bindings = { ...bindings }; this.local.scopeMode = scopeMode; this.local.reset();
  }

  setSettings(partial: Partial<ControllerConfig>): void {
    const result = controllerSchema.safeParse({ ...this.config, ...partial });
    if (!result.success) { this.persistenceStatus = '設定值超出範圍，未有儲存。'; return; }
    this.config = result.data;
    this.persistenceStatus = saveControllerConfig(this.config)
      ? '控制設定已自動儲存。'
      : '設定已套用；瀏覽器未允許儲存，下次開啟需重新設定。';
  }

  calibrate(): void {
    const neutral = this.controller.calibrate(this.config, this.devices);
    if (neutral !== null) this.setSettings(neutral);
  }

  sample(dt: number): InputFrame {
    if (!this.focused || document.hidden) return NEUTRAL_INPUT;
    const keyboard = this.local.sample(dt);
    const gamepad = this.controller.sample(this.config, this.devices);
    const touch = this.touch.sample(this.scopeSensitivity);
    const blend = (key: number, pad: number): number => clampInput(key === 0 ? pad : key);
    return {
      throttle: blend(touch.throttle, blend(keyboard.throttle, gamepad.throttle)),
      steer: blend(touch.steer, blend(keyboard.steer, gamepad.steer)),
      aimX: blend(keyboard.aimX, gamepad.aimX),
      aimY: blend(keyboard.aimY, gamepad.aimY),
      fire: keyboard.fire || gamepad.fire || touch.fire, brake: keyboard.brake || gamepad.brake || touch.brake && keyboard.throttle === 0 && gamepad.throttle === 0,
      scope: keyboard.scope || gamepad.scope || touch.scope,
      toggleCamera: keyboard.toggleCamera || gamepad.toggleCamera,
      pause: keyboard.pause || gamepad.pause,
      pointerX: (touch.pointerX ?? 0) + (keyboard.pointerX ?? 0) * ((keyboard.scope || gamepad.scope) && !keyboard.observe ? this.scopeSensitivity : 1),
      pointerY: (touch.pointerY ?? 0) + (keyboard.pointerY ?? 0) * ((keyboard.scope || gamepad.scope) && !keyboard.observe ? this.scopeSensitivity : 1), observe: keyboard.observe || touch.observe || false,
    };
  }

  reset(): void { this.local.reset(); this.controller.reset(); this.touch.reset(); }
  dispose(): void { this.abort.abort(); this.local.dispose(); this.touch.dispose(); }
}
