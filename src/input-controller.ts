import { centeredAxis, clampInput } from './input-config';
import type { ControllerConfig } from './input-config';
import type { LocalInput } from './input-keys';

export const NEUTRAL_INPUT: LocalInput = {
  throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false,
  brake: false, scope: false, toggleCamera: false, pause: false,
} as const;

export function connectedPads(): readonly Gamepad[] {
  if (typeof navigator.getGamepads !== 'function') return [];
  try {
    return Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => pad !== null && pad.connected);
  } catch (error) {
    if (error instanceof DOMException) return [];
    throw error;
  }
}

function source(pads: readonly Gamepad[], index: number, main: number): Gamepad | undefined {
  return pads.find((pad) => pad.index === (index < 0 ? main : index));
}

function rawAxis(pad: Gamepad | undefined, index: number): number {
  return clampInput(pad?.axes[index] ?? 0);
}

function activeButtons(pad: Gamepad | undefined): Set<number> {
  return new Set(pad?.buttons.flatMap((button, index) => button.pressed || button.value > 0.6 ? [index] : []) ?? []);
}

export class ControllerPoller {
  private signature = '';
  private calibrated = false;
  private armed = false;
  private idleSeen = false;
  private throttleRest = 0;
  private previousButtons = new Set<number>();
  private blockedButtons = new Set<number>();
  private needsReset = false;
  status = '接駁 USB 搖桿後，按一下搖桿上的按鈕。';

  private sync(config: ControllerConfig, pads: readonly Gamepad[]): void {
    const identities = [config.controllerIndex, config.throttleControllerIndex,
      config.lookControllerIndex, config.buttonControllerIndex]
      .map((index) => {
        const pad = source(pads, index, config.controllerIndex);
        return pad ? `${pad.index}:${pad.id}` : 'missing';
      });
    const signature = JSON.stringify([identities, config.axisSteer, config.axisThrottle,
      config.axisAimX, config.axisAimY, config.throttleMode,
      config.invertThrottle, config.invertSteer, config.invertAimX, config.invertAimY]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.calibrated = false;
      this.needsReset = true;
    }
    if (this.needsReset) {
      this.armed = false;
      this.idleSeen = false;
      this.previousButtons.clear();
      this.blockedButtons = activeButtons(source(pads, config.buttonControllerIndex, config.controllerIndex));
      this.needsReset = false;
    }
  }

  calibrate(config: ControllerConfig, pads: readonly Gamepad[]): Partial<ControllerConfig> | null {
    this.sync(config, pads);
    const drive = source(pads, config.controllerIndex, config.controllerIndex);
    const throttle = source(pads, config.throttleControllerIndex, config.controllerIndex);
    const look = source(pads, config.lookControllerIndex, config.controllerIndex);
    if (!drive || !throttle || !look) {
      this.status = '未找到所選裝置。請接駁搖桿並按一下按鈕，再選擇裝置。';
      return null;
    }
    this.calibrated = true;
    this.armed = false;
    this.idleSeen = false;
    this.throttleRest = rawAxis(throttle, config.axisThrottle);
    this.status = '中立位置已校準。先將油門收至零，再推動油門開始駕駛。';
    return {
      neutralSteer: rawAxis(drive, config.axisSteer),
      neutralThrottle: this.throttleRest,
      neutralAimX: rawAxis(look, config.axisAimX),
      neutralAimY: rawAxis(look, config.axisAimY),
    };
  }

  sample(config: ControllerConfig, pads: readonly Gamepad[]): LocalInput {
    this.sync(config, pads);
    if (!config.enabled) {
      this.status = '搖桿輸入已停用；可使用鍵盤及滑鼠。';
      this.reset();
      return NEUTRAL_INPUT;
    }
    const drive = source(pads, config.controllerIndex, config.controllerIndex);
    const throttlePad = source(pads, config.throttleControllerIndex, config.controllerIndex);
    const look = source(pads, config.lookControllerIndex, config.controllerIndex);
    const buttonPad = source(pads, config.buttonControllerIndex, config.controllerIndex);
    if (!drive || !throttlePad || !look || !buttonPad) {
      this.status = pads.length ? '所選裝置未連接，請在控制設定重新選擇。' : '未偵測到搖桿；接駁後請按一下裝置上的按鈕。';
      return NEUTRAL_INPUT;
    }
    const pressed = activeButtons(buttonPad);
    for (const index of this.blockedButtons) if (!pressed.has(index)) this.blockedButtons.delete(index);
    const held = (index: number): boolean => pressed.has(index) && !this.blockedButtons.has(index);
    const edge = (index: number): boolean => held(index) && !this.previousButtons.has(index);
    const buttons = {
      fire: held(config.buttonFire), brake: held(config.buttonBrake), scope: held(config.buttonScope),
      toggleCamera: edge(config.buttonCamera), pause: edge(config.buttonPause),
    };
    this.previousButtons = pressed;
    if (!this.calibrated) {
      this.status = '搖桿已連接。請放開搖桿、收起油門，再按「校準中立位置」。';
      return { ...NEUTRAL_INPUT, ...buttons };
    }
    const sign = (inverted: boolean): number => inverted ? -1 : 1;
    const axis = (pad: Gamepad, index: number, center: number, inverted: boolean): number =>
      index < 0 ? 0 : centeredAxis(rawAxis(pad, index), center, config.deadzone) * sign(inverted);
    const rawThrottle = rawAxis(throttlePad, config.axisThrottle);
    let throttle = config.axisThrottle < 0 ? 0 : config.throttleMode === 'slider'
      ? Math.max(0, ((rawThrottle * sign(config.invertThrottle) + 1) / 2 - config.deadzone) / (1 - config.deadzone))
      : axis(throttlePad, config.axisThrottle, config.neutralThrottle, config.invertThrottle);
    if (Math.abs(throttle) < 0.025 && !this.idleSeen) {
      this.idleSeen = true;
      this.throttleRest = rawThrottle;
    }
    if (this.idleSeen && Math.abs(rawThrottle - this.throttleRest) > Math.max(0.06, config.deadzone)) this.armed = true;
    if (!this.armed) throttle = 0;
    if (config.throttleMode === 'slider' && held(config.buttonReverse)) throttle = -throttle;
    this.status = this.armed ? '搖桿已啟用，控制輸入正常。' : '已校準。將油門收至零，再推動油門即可駕駛。';
    return {
      throttle: clampInput(throttle),
      steer: axis(drive, config.axisSteer, config.neutralSteer, config.invertSteer),
      aimX: clampInput(axis(look, config.axisAimX, config.neutralAimX, config.invertAimX) * config.sensitivity),
      aimY: clampInput(-axis(look, config.axisAimY, config.neutralAimY, config.invertAimY) * config.sensitivity),
      ...buttons,
    };
  }

  reset(): void { this.needsReset = true; }
}
