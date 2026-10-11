import type { Input } from './input';
import type { ControllerConfig } from './input-config';

const AXES = [
  ['axisSteer', '車身轉向軸', 'invertSteer'],
  ['axisThrottle', '前進／後退軸', 'invertThrottle'],
  ['axisAimX', '炮塔左右軸', 'invertAimX'],
  ['axisAimY', '炮管高低軸', 'invertAimY'],
] as const;
const BUTTONS = [
  ['buttonFire', '開火按鈕'], ['buttonBrake', '煞車按鈕'],
  ['buttonScope', '瞄準鏡按鈕'], ['buttonCamera', '切換視角按鈕'],
  ['buttonReverse', '倒車按鈕（滑動油門）'], ['buttonPause', '暫停按鈕'],
] as const;
const DEVICES = [
  ['controllerIndex', '主要搖桿'], ['throttleControllerIndex', '油門裝置'],
  ['lookControllerIndex', '炮塔控制裝置'], ['buttonControllerIndex', '按鈕裝置'],
] as const;

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'settings-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function option(text: string, value: string): HTMLOptionElement {
  const element = document.createElement('option');
  element.textContent = text; element.value = value;
  return element;
}

export function buildControlFields(input: Input, changed: () => void): {
  readonly root: HTMLElement;
  readonly refresh: (pads: readonly Gamepad[]) => void;
} {
  const root = document.createElement('div');
  root.className = 'settings-grid';
  const refreshers: (() => void)[] = [];
  const selectors = new Map<(typeof DEVICES)[number][0], HTMLSelectElement>();
  let deviceSignature = '';
  const update = (partial: Partial<ControllerConfig>): void => { input.setSettings(partial); changed(); };
  for (const [key, title] of DEVICES) {
    const select = document.createElement('select');
    select.addEventListener('change', () => update({ [key]: Number(select.value) }));
    selectors.set(key, select); root.append(field(title, select));
    refreshers.push(() => { select.value = String(input.settings[key]); });
  }
  const mode = document.createElement('select');
  mode.append(option('置中搖桿：前進／後退', 'centered'), option('滑動油門：零至全速', 'slider'));
  mode.addEventListener('change', () => {
    if (mode.value === 'centered' || mode.value === 'slider') update({ throttleMode: mode.value });
  });
  root.append(field('油門形式', mode));
  refreshers.push(() => { mode.value = input.settings.throttleMode; });
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.addEventListener('change', () => update({ enabled: enabled.checked }));
  root.append(field('啟用 USB 搖桿輸入', enabled));
  refreshers.push(() => { enabled.checked = input.settings.enabled; });
  for (const [key, title, invertKey] of AXES) {
    const group = document.createElement('div');
    group.className = 'settings-axis-binding';
    const axis = document.createElement('input');
    axis.type = 'number'; axis.min = '-1'; axis.max = '63'; axis.step = '1';
    axis.addEventListener('change', () => update({ [key]: Number(axis.value) }));
    const invert = document.createElement('input');
    invert.type = 'checkbox';
    invert.setAttribute('aria-label', `${title}反向`);
    invert.addEventListener('change', () => update({ [invertKey]: invert.checked }));
    group.append(field(`${title}（-1 停用）`, axis), field('反向', invert));
    root.append(group);
    refreshers.push(() => { axis.value = String(input.settings[key]); invert.checked = input.settings[invertKey]; });
  }
  for (const [key, title] of BUTTONS) {
    const control = document.createElement('input');
    control.type = 'number'; control.min = '-1'; control.max = '127'; control.step = '1';
    control.addEventListener('change', () => update({ [key]: Number(control.value) }));
    root.append(field(`${title}（-1 停用）`, control));
    refreshers.push(() => { control.value = String(input.settings[key]); });
  }
  for (const [key, title, minimum, maximum, step] of [
    ['deadzone', '中立死區', 0.02, 0.45, 0.01],
    ['sensitivity', '炮塔靈敏度', 0.25, 2, 0.05],
  ] as const) {
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = String(minimum); slider.max = String(maximum); slider.step = String(step);
    const value = document.createElement('output');
    slider.addEventListener('input', () => { update({ [key]: Number(slider.value) }); value.value = Number(slider.value).toFixed(2); });
    const label = field(title, slider); label.append(value); root.append(label);
    refreshers.push(() => { slider.value = String(input.settings[key]); value.value = input.settings[key].toFixed(2); });
  }
  return {
    root,
    refresh: (pads): void => {
      const signature = JSON.stringify([pads.map((pad) => [pad.index, pad.id]), DEVICES.map(([key]) => input.settings[key])]);
      if (signature !== deviceSignature) {
        deviceSignature = signature;
        for (const [key, select] of selectors) {
          select.replaceChildren();
          if (key !== 'controllerIndex') select.append(option('使用主要搖桿', '-1'));
          for (const pad of pads) select.append(option(`#${pad.index} ${pad.id}`, String(pad.index)));
          const selected = input.settings[key];
          if (selected >= 0 && !pads.some((pad) => pad.index === selected)) select.append(option(`#${selected} 未連接`, String(selected)));
        }
      }
      for (const refresh of refreshers) refresh();
    },
  };
}
