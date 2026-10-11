import { dialogHeader } from './dialogs';
import { ACTIONS, BINDING_LABELS, DEFAULT_BINDINGS, keyLabel, remapBinding } from './key-bindings';
import type { KeyAction, KeyBindings } from './key-bindings';

export function mountKeyboardSettings(modal: HTMLDialogElement, initial: KeyBindings, save: (bindings: KeyBindings) => void): () => void {
  let bindings = { ...initial }, awaiting: KeyAction | undefined;
  const abort = new AbortController();
  modal.innerHTML = `${dialogHeader('KEYBOARD CONTROLS', '鍵盤按鍵設定')}
    <p class="dialog-intro">按一下按鍵，再按新的鍵。已使用的鍵會與原功能交換。Esc 固定為暫停；設定期間按 Esc 取消改鍵。</p>
    <div class="bindings-grid">${ACTIONS.map(action => `<div class="binding-row"><span>${BINDING_LABELS[action]}</span><button class="btn" data-bind="${action}" aria-label="更改${BINDING_LABELS[action]}按鍵">${keyLabel(bindings[action])}</button></div>`).join('')}</div>
    <p id="binding-status" role="status" class="control-tip">滑鼠左鍵開炮、右鍵拖動不受改鍵影響。</p>
    <div class="dialog-buttons"><button class="btn" id="reset-keys">恢復預設按鍵</button><button class="btn btn-primary" data-action="close">完成</button></div>`;
  const status = modal.querySelector<HTMLElement>('#binding-status');
  const render = (): void => {
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-bind]')) {
      const action = button.dataset['bind'] as KeyAction;
      button.textContent = awaiting === action ? '請按新的鍵…' : keyLabel(bindings[action]);
      button.classList.toggle('awaiting-key', awaiting === action);
    }
  };
  modal.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button?.dataset['bind']) { awaiting = button.dataset['bind'] as KeyAction; render(); }
    if (button?.id === 'reset-keys') {
      bindings = { ...DEFAULT_BINDINGS }; awaiting = undefined; save(bindings); render();
      if (status) status.textContent = '已恢復預設按鍵。';
    }
  }, { signal: abort.signal });
  modal.addEventListener('keydown', event => {
    if (!awaiting) return;
    event.preventDefault(); event.stopPropagation();
    if (event.code === 'Escape') { awaiting = undefined; render(); return; }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const updated = remapBinding(bindings, awaiting, event.code);
    if (!updated) { if (status) status.textContent = '請使用字母、數字、方向、Space 或 Shift 鍵。'; return; }
    const label = BINDING_LABELS[awaiting]; bindings = updated; awaiting = undefined; save(bindings); render();
    if (status) status.textContent = `${label}改為 ${keyLabel(event.code)}，相同按鍵已自動交換。`;
  }, { capture: true, signal: abort.signal });
  return () => abort.abort();
}
