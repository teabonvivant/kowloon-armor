import type { Input } from './input';
import { HOTAS_PRESET, XBOX_PRESET } from './input-config';
import { buildControlFields } from './input-settings-fields';

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text; element.className = className;
  return element;
}

function action(text: string, handler: () => void, primary = false): HTMLButtonElement {
  const button = textElement('button', text, primary ? 'btn btn-primary' : 'btn');
  button.type = 'button'; button.addEventListener('click', handler);
  return button;
}

type AxisReadout = { readonly meter: HTMLMeterElement; readonly value: HTMLOutputElement };
type DeviceReadout = { readonly axes: readonly AxisReadout[]; readonly buttons: HTMLElement };

export function mountControllerSettings(host: HTMLElement, input: Input, onClose: () => void): () => void {
  const previousFocus = document.activeElement;
  const previousLabel = host.getAttribute('aria-labelledby');
  const abort = new AbortController();
  const panel = document.createElement('section');
  panel.className = 'settings-panel'; panel.tabIndex = -1;
  if (!(host instanceof HTMLDialogElement)) {
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
  }
  panel.setAttribute('aria-labelledby', 'controller-settings-title');
  if (host instanceof HTMLDialogElement) host.setAttribute('aria-labelledby', 'controller-settings-title');
  const header = document.createElement('header'); header.className = 'settings-header';
  const title = textElement('h2', '駕駛艙控制設定'); title.id = 'controller-settings-title';
  const close = action('返回', onClose); close.setAttribute('aria-label', '關閉控制設定');
  header.append(title, close);
  const intro = textElement('p', 'USB 飛行搖桿／HOTAS 支援分開選擇搖桿及油門。先按一下裝置按鈕，再按實際軸號設定。');
  const feedback = textElement('p', input.saveStatus); feedback.setAttribute('role', 'status');
  const fields = buildControlFields(input, () => { feedback.textContent = input.saveStatus; });
  fields.refresh(input.devices);
  const presets = document.createElement('div'); presets.className = 'settings-actions';
  presets.append(
    action('HOTAS 預設', () => { input.setSettings(HOTAS_PRESET); fields.refresh(input.devices); feedback.textContent = input.saveStatus; }),
    action('Xbox 手掣預設', () => { input.setSettings(XBOX_PRESET); fields.refresh(input.devices); feedback.textContent = input.saveStatus; }),
  );
  const calibration = document.createElement('div'); calibration.className = 'device-card';
  const calibrationTitle = textElement('h3', '中立校準');
  const instructions = textElement('p', '放開所有會回中的搖桿，滑動油門收至零，再按校準。之後把油門從零推前，才會啟用行駛；每次接駁或更改軸設定均需重新校準。');
  const status = textElement('p', input.status); status.setAttribute('role', 'status');
  calibration.append(calibrationTitle, instructions, action('校準中立位置', () => {
    input.calibrate(); status.textContent = input.status; feedback.textContent = input.saveStatus;
  }, true), status);
  const liveHeading = textElement('h3', '裝置即時訊號');
  const liveHelp = textElement('p', '以下軸及按鈕編號由 0 開始。推動搖桿或按下按鈕，對照數值後填入上方；-1 表示停用。');
  const live = document.createElement('div'); live.className = 'device-readouts';
  const keyboard = textElement('p', '鍵盤預設：W／S 前進後退 · A／D 轉向 · Q／E 轉炮塔 · ↑／↓ 炮管高低 · Space 開火 · B 煞車 · Shift 瞄準 · C 獨立觀察 · V 視角 · Esc 暫停。自訂按鍵請在「遊戲設定 → 鍵盤按鍵設定」查看。滑鼠左鍵開火，按住右鍵拖動瞄準。', 'keyboard-reference');
  panel.append(header, intro, presets, fields.root, feedback, calibration, liveHeading, liveHelp, live, keyboard);
  host.replaceChildren(panel);
  input.reset();
  close.focus({ preventScroll: true });
  const readouts = new Map<number, DeviceReadout>();
  let signature = '';
  let frame = 0;
  let active = true;
  let previousRefresh = 0;
  const renderDevices = (pads: readonly Gamepad[]): void => {
    const nextSignature = JSON.stringify(pads.map((pad) => [pad.index, pad.id, pad.axes.length]));
    if (nextSignature !== signature) {
      signature = nextSignature; live.replaceChildren(); readouts.clear();
      if (!pads.length) live.append(textElement('p', '尚未偵測到裝置。請接駁 USB 搖桿、按一下按鈕，並保持此視窗在前景。', 'device-card'));
      for (const pad of pads) {
        const card = document.createElement('article'); card.className = 'device-card';
        card.append(textElement('h4', `裝置 #${pad.index}`), textElement('p', pad.id));
        const axes: AxisReadout[] = [];
        const rows = document.createElement('div'); rows.className = 'axis-readouts';
        for (let index = 0; index < pad.axes.length; index++) {
          const row = document.createElement('div'); row.className = 'axis-readout';
          const meter = document.createElement('meter'); meter.min = -1; meter.max = 1; meter.value = 0;
          meter.setAttribute('aria-label', `裝置 ${pad.index} 軸 ${index}`);
          const value = document.createElement('output');
          row.append(textElement('span', `軸 ${index}`), meter, value); rows.append(row);
          axes.push({ meter, value });
        }
        const buttons = textElement('p', '按鈕：未按下');
        card.append(rows, buttons); live.append(card); readouts.set(pad.index, { axes, buttons });
      }
      fields.refresh(pads);
    }
    for (const pad of pads) {
      const readout = readouts.get(pad.index);
      if (!readout) continue;
      for (const [index, axis] of readout.axes.entries()) {
        const value = pad.axes[index] ?? 0;
        axis.meter.value = value; axis.value.value = `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
      }
      const pressed = pad.buttons.flatMap((button, index) => button.pressed || button.value > 0.6 ? [String(index)] : []);
      readout.buttons.textContent = pressed.length ? `按鈕：${pressed.join(' · ')}` : '按鈕：未按下';
    }
  };
  const update = (time: number): void => {
    if (!active) return;
    if (time - previousRefresh >= 80) {
      previousRefresh = time; renderDevices(input.devices);
      if (status.textContent !== input.status) status.textContent = input.status;
    }
    frame = requestAnimationFrame(update);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return; }
    if (event.code !== 'Tab') return;
    const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  window.addEventListener('keydown', onKeyDown, { capture: true, signal: abort.signal });
  renderDevices(input.devices);
  frame = requestAnimationFrame(update);
  return (): void => {
    active = false; cancelAnimationFrame(frame); abort.abort(); input.reset(); panel.remove();
    if (host instanceof HTMLDialogElement) {
      if (previousLabel === null) host.removeAttribute('aria-labelledby');
      else host.setAttribute('aria-labelledby', previousLabel);
    }
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  };
}
