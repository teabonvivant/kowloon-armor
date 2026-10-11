import { clampInput, controllerSchema, loadControllerConfig, saveControllerConfig } from './input-config';
import type { ControllerConfig } from './input-config';
import { connectedPads, ControllerPoller, NEUTRAL_INPUT } from './input-controller';
import { LocalControls } from './input-keys';

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
};

export class Input {
  private config = loadControllerConfig();
  private readonly local: LocalControls;
  private readonly controller = new ControllerPoller();
  private readonly abort = new AbortController();
  private focused = true;
  private persistenceStatus = '設定會自動儲存在這部電腦。';

  constructor(element: HTMLElement) {
    this.local = new LocalControls(element);
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
    const blend = (key: number, pad: number): number => clampInput(key === 0 ? pad : key);
    return {
      throttle: blend(keyboard.throttle, gamepad.throttle),
      steer: blend(keyboard.steer, gamepad.steer),
      aimX: blend(keyboard.aimX, gamepad.aimX),
      aimY: blend(keyboard.aimY, gamepad.aimY),
      fire: keyboard.fire || gamepad.fire, brake: keyboard.brake || gamepad.brake,
      scope: keyboard.scope || gamepad.scope,
      toggleCamera: keyboard.toggleCamera || gamepad.toggleCamera,
      pause: keyboard.pause || gamepad.pause,
    };
  }

  reset(): void { this.local.reset(); this.controller.reset(); }
  dispose(): void { this.abort.abort(); this.local.dispose(); }
}
