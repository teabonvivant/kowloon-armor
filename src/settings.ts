import { dialogHeader } from './dialogs';
import { MISSIONS } from './data/missions';
import { BACKUP_LIMIT, exportProgress, parseProgressBackup } from './persistence';
import type { Progress, ProgressStatus } from './persistence';
import type { Preferences } from './preferences';

export type SettingsTab = 'display' | 'controls' | 'audio' | 'records';
interface SettingsActions {
  changed: (key: keyof Preferences) => void;
  getProgress: () => Progress;
  getStatus: () => ProgressStatus | 'unsaved';
  importProgress: (progress: Progress) => boolean;
  testAudio: () => void;
}
const tabs: readonly [SettingsTab, string][] = [['display', '畫面'], ['controls', '操作'], ['audio', '聲音'], ['records', '戰績']];
const selected = (condition: boolean): string => condition ? 'selected' : '';
const checked = (condition: boolean): string => condition ? 'checked' : '';

function recordsMarkup(progress: Progress, status: ProgressStatus | 'unsaved'): string {
  const messages = {
    ready: '戰績儲存在目前瀏覽器。匯出備份後，可帶到其他瀏覽器或離線檔案使用。',
    empty: '尚未完成演習。完成戰役、模擬對戰或無盡防線後，成績會自動保存。',
    recovered: '主紀錄損壞，已讀取上一次有效副本。請先匯出備份，再繼續演習。',
    invalid: '本機紀錄無法讀取。可匯入之前的備份；目前顯示新進度。',
    unavailable: '瀏覽器未允許讀取本機儲存。請允許網站資料，或使用匯出功能保存本次戰績。',
    unsaved: '最新戰績只保留在這個視窗，尚未寫入瀏覽器。離開前請匯出備份。',
  };
  return `<h3>你的演習紀錄</h3><p>沒有雲端同步。匯入時會保留兩邊較佳的進度及分數。</p>
    <div class="record-summary"><div><span>戰役完成</span><strong>${progress.completed} / 6</strong></div><div><span>演習勝場</span><strong>${progress.victories.toLocaleString()}</strong></div><div><span>基礎訓練</span><strong>${progress.trainingComplete ? '已完成' : '未完成'}</strong></div></div>
    <p class="storage-message" data-warning="${!['ready', 'empty'].includes(status)}">${messages[status]}</p>
    <div class="record-actions"><button class="btn btn-primary" id="export-progress">匯出戰績備份</button></div>
    <label class="import-field">匯入戰績備份 <input type="file" id="import-progress" accept=".json,application/json" aria-describedby="import-help import-status"></label>
    <p class="fine-print" id="import-help">只接受遊戲匯出的 JSON，最大 64 KB。先預覽，再合併；相同備份不會重複累加勝場。操作設定及 HOTAS 校準不包含在備份內。</p>
    <p id="import-status" class="form-error" role="status" aria-live="polite"></p><div id="import-preview" hidden></div>
    <table class="record-table"><caption class="small-label">戰役個人最佳</caption><thead><tr><th scope="col">任務</th><th scope="col">入門</th><th scope="col">標準</th><th scope="col">精英</th></tr></thead><tbody>
    ${MISSIONS.map(mission => `<tr><th scope="row">${String(mission.id).padStart(2, '0')} ${mission.name}</th>${['training', 'standard', 'veteran'].map(level => `<td>${progress.bestScores[`campaign:${mission.id}:${level}`]?.toLocaleString() ?? '未記錄'}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="fine-print">舊版未分難度的最佳分數仍保留於戰役地圖。</p>`;
}

export function mountSettings(modal: HTMLDialogElement, preferences: Preferences, actions: SettingsActions,
  initialTab: SettingsTab = 'display', paused = false): () => void {
  const abort = new AbortController();
  let pending: Progress | null = null, importRevision = 0;
  modal.innerHTML = `${dialogHeader('SYSTEM SETTINGS', '遊戲設定')}
    ${paused ? '<button class="text-button back-link" data-action="return-pause">← 返回暫停選單</button>' : ''}
    <div class="settings-tabs" role="tablist" aria-label="設定分類">${tabs.map(([id, label]) => `<button role="tab" id="tab-${id}" data-settings-tab="${id}" aria-controls="panel-${id}" aria-selected="${id === initialTab}" tabindex="${id === initialTab ? 0 : -1}">${label}</button>`).join('')}</div>
    <section id="panel-display" class="settings-section" role="tabpanel" aria-labelledby="tab-display" tabindex="0" ${initialTab === 'display' ? '' : 'hidden'}>
      <h3>保持視野清楚</h3><p>畫面較慢時選「流暢」。資訊大小會按小視窗限制，保留中央瞄準位置。</p>
      <div class="settings-grid">
        <label class="settings-field">畫面品質<select id="quality"><option value="low" ${selected(preferences.quality === 'low')}>流暢 · 關閉陰影</option><option value="medium" ${selected(preferences.quality === 'medium')}>平衡</option><option value="high" ${selected(preferences.quality === 'high')}>高畫質</option></select></label>
        <label class="settings-field">九龍光影<select id="lighting"><option value="day" ${selected(preferences.lighting === 'day')}>日間 · 清晰視野</option><option value="dusk" ${selected(preferences.lighting === 'dusk')}>黃昏 · 暖光街景</option></select></label>
        <div class="settings-field"><label><input id="adaptive-resolution" type="checkbox" ${checked(preferences.adaptiveResolution)}> 自動調整 3D 解像度</label><small>持續慢幀時降至最低 60%，穩定後回升；文字保持清晰。</small></div>
        <div class="settings-field"><label><input id="high-contrast" type="checkbox" ${checked(preferences.highContrast)}> 高對比敵我標記</label><small>敵軍琥珀菱形、我方青色箭頭，毋須只靠紅綠分辨。</small></div>
        <label class="settings-field">戰鬥資訊大小<select id="hud-scale"><option value="0.85" ${selected(preferences.hudScale === .85)}>精簡 · 85%</option><option value="1" ${selected(preferences.hudScale === 1)}>標準 · 100%</option><option value="1.15" ${selected(preferences.hudScale === 1.15)}>放大 · 115%</option></select></label>
        <div class="settings-field"><label><input id="reduce-motion" type="checkbox" ${checked(preferences.reducedMotion)}> 減少展示動態及開炮震動</label><small>也會遵循系統的減少動態效果設定。</small></div>
        <div class="settings-field settings-help"><button class="btn" data-action="fullscreen">切換全螢幕</button><small>瀏覽器亦可用 F11 切換。</small></div>
      </div>
    </section>
    <section id="panel-controls" class="settings-section" role="tabpanel" aria-labelledby="tab-controls" tabindex="0" ${initialTab === 'controls' ? '' : 'hidden'}>
      <h3>按你的習慣瞄準</h3><p>鍵盤、滑鼠和 HOTAS 可並用。手機可瀏覽及設定，駕駛需要鍵盤或控制器。</p>
      <div class="settings-grid">
        <label class="settings-field">滑鼠瞄準靈敏度 <output id="sensitivity-value" for="sensitivity">${preferences.sensitivity.toFixed(1)}×</output><input id="sensitivity" type="range" min=".3" max="2.5" step=".1" value="${preferences.sensitivity}"></label>
        <div class="settings-field"><label><input id="invert-y" type="checkbox" ${checked(preferences.invertY)}> 反向滑鼠垂直瞄準</label></div>
        <label class="settings-field">鍵盤瞄準鏡<select id="scope-mode"><option value="hold" ${selected(preferences.scopeMode === 'hold')}>按住使用</option><option value="toggle" ${selected(preferences.scopeMode === 'toggle')}>按一下切換</option></select></label>
        <label class="settings-field">瞄準鏡倍率<select id="scope-zoom">${[2, 3, 4].map(zoom => `<option value="${zoom}" ${selected(preferences.scopeZoom === zoom)}>${zoom} 倍${zoom === 2 ? ' · 廣視野' : ''}</option>`).join('')}</select></label>
      </div>
      <p class="fine-print">HOTAS 瞄準鏡維持按住操作；獨立觀察時炮塔保持方向。</p>
      <div class="dialog-buttons"><button class="btn btn-primary" data-action="keyboard">鍵盤按鍵設定</button><button class="btn" data-action="controller">HOTAS 設定</button></div>
    </section>
    <section id="panel-audio" class="settings-section" role="tabpanel" aria-labelledby="tab-audio" tabindex="0" ${initialTab === 'audio' ? '' : 'hidden'}>
      <h3>九龍戰場聲景</h3><p>分層炮聲、建築遮擋與街谷回響；原創配樂隨附近敵軍及受擊升溫。短提示音表示裝填完成。</p>
      <div class="settings-grid"><label class="settings-field">遊戲音量 <output id="volume-value" for="volume">${Math.round(preferences.volume * 100)}%</output><input id="volume" type="range" min="0" max="1" step=".05" value="${preferences.volume}"></label>
      <label class="settings-field">配樂音量 <output id="music-volume-value" for="music-volume">${Math.round(preferences.musicVolume * 100)}%</output><input id="music-volume" type="range" min="0" max="1" step=".05" value="${preferences.musicVolume}"></label>
      <div class="settings-field"><label><input id="night-audio" type="checkbox" ${checked(preferences.nightAudio)}> 夜間音效</label><small>壓低炮聲峰值及整體輸出，保留方向與裝填提示。</small></div>
      <div class="settings-field settings-help"><button class="btn" id="test-audio">試聽裝填完成提示</button><small>遊戲音量為總音量；配樂設為 0 只關閉音樂。全部聲音為原創軟件合成。</small></div></div>
    </section>
    <section id="panel-records" class="settings-section" role="tabpanel" aria-labelledby="tab-records" tabindex="0" ${initialTab === 'records' ? '' : 'hidden'}>${recordsMarkup(actions.getProgress(), actions.getStatus())}</section>
    <p class="fine-print" id="settings-save-status" role="status">設定會即時套用，並自動儲存於目前瀏覽器。</p>`;
  const selectTab = (tab: SettingsTab, focus: boolean): void => {
    for (const [id] of tabs) {
      const button = modal.querySelector<HTMLButtonElement>(`#tab-${id}`);
      const panel = modal.querySelector<HTMLElement>(`#panel-${id}`);
      if (button) { button.setAttribute('aria-selected', String(id === tab)); button.tabIndex = id === tab ? 0 : -1; }
      if (panel) panel.hidden = id !== tab;
      if (focus && id === tab) button?.focus();
    }
    modal.dataset['settingsTab'] = tab;
  };
  selectTab(initialTab, false);
  const update = (event: Event): void => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement) || field.type === 'file') return;
    let key: keyof Preferences | undefined;
    switch (field.id) {
      case 'quality': preferences.quality = field.value as Preferences['quality']; key = 'quality'; break;
      case 'lighting': preferences.lighting = field.value === 'dusk' ? 'dusk' : 'day'; key = 'lighting'; break;
      case 'adaptive-resolution': if (field instanceof HTMLInputElement) { preferences.adaptiveResolution = field.checked; key = 'adaptiveResolution'; } break;
      case 'high-contrast': if (field instanceof HTMLInputElement) { preferences.highContrast = field.checked; key = 'highContrast'; } break;
      case 'night-audio': if (field instanceof HTMLInputElement) { preferences.nightAudio = field.checked; key = 'nightAudio'; } break;
      case 'hud-scale': preferences.hudScale = Number(field.value); key = 'hudScale'; break;
      case 'scope-mode': preferences.scopeMode = field.value === 'toggle' ? 'toggle' : 'hold'; key = 'scopeMode'; break;
      case 'scope-zoom': preferences.scopeZoom = Number(field.value) as 2 | 3 | 4; key = 'scopeZoom'; break;
      case 'volume': preferences.volume = Number(field.value); key = 'volume'; modal.querySelector('#volume-value')!.textContent = `${Math.round(preferences.volume * 100)}%`; break;
      case 'music-volume': preferences.musicVolume = Number(field.value); key = 'musicVolume'; modal.querySelector('#music-volume-value')!.textContent = `${Math.round(preferences.musicVolume * 100)}%`; break;
      case 'sensitivity': preferences.sensitivity = Number(field.value); key = 'sensitivity'; modal.querySelector('#sensitivity-value')!.textContent = `${preferences.sensitivity.toFixed(1)}×`; break;
      case 'invert-y': if (field instanceof HTMLInputElement) { preferences.invertY = field.checked; key = 'invertY'; } break;
      case 'reduce-motion': if (field instanceof HTMLInputElement) { preferences.reducedMotion = field.checked; key = 'reducedMotion'; } break;
    }
    if (key) actions.changed(key);
  };
  modal.addEventListener('input', update, { signal: abort.signal });
  modal.addEventListener('keydown', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'tab') return;
    const index = tabs.findIndex(([id]) => id === target.dataset['settingsTab']);
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); selectTab(tabs[next]![0], true); }
  }, { signal: abort.signal });
  modal.addEventListener('change', async event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.id !== 'import-progress') return;
    const revision = ++importRevision, file = field.files?.[0];
    pending = null;
    const status = modal.querySelector<HTMLElement>('#import-status')!;
    const preview = modal.querySelector<HTMLElement>('#import-preview')!;
    preview.hidden = true; preview.innerHTML = '';
    if (!file) { status.textContent = ''; return; }
    if (file.size > BACKUP_LIMIT) { status.textContent = '檔案太大。請選擇 64 KB 以內的遊戲戰績備份。'; return; }
    status.textContent = '正在讀取備份…';
    try {
      const raw = await file.text();
      if (abort.signal.aborted || revision !== importRevision) return;
      const parsed = parseProgressBackup(raw);
      if (!parsed.ok) { status.textContent = parsed.error; return; }
      pending = parsed.progress; status.textContent = '已驗證備份。確認合併前，現有戰績不會改動。';
      preview.className = 'import-preview'; preview.hidden = false;
      preview.innerHTML = `<strong>備份預覽</strong><p>${new Date(parsed.createdAt).toLocaleString('zh-HK')} · 已完成 ${pending.completed} / 6 關 · ${pending.victories.toLocaleString()} 勝</p><p>保留較高的進度、勝場及各項最高分，不會相加。</p><div class="dialog-buttons"><button class="btn btn-primary" id="confirm-import">合併這份戰績</button><button class="btn" id="cancel-import">取消</button></div>`;
    } catch { if (!abort.signal.aborted && revision === importRevision) status.textContent = '未能讀取檔案。請重新選擇備份，現有戰績未有改動。'; }
  }, { signal: abort.signal });
  modal.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    const tab = button.dataset['settingsTab'];
    if (tabs.some(([id]) => id === tab)) selectTab(tab as SettingsTab, true);
    if (button.id === 'test-audio') actions.testAudio();
    if (button.id === 'export-progress') {
      try {
        const url = URL.createObjectURL(new Blob([exportProgress(actions.getProgress())], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `九龍裝甲-戰績-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        modal.querySelector('#import-status')!.textContent = '已準備下載戰績備份。請確認瀏覽器已保存 JSON 檔案。';
      } catch { modal.querySelector('#import-status')!.textContent = '未能匯出備份。請使用 Edge 或 Chrome 的一般視窗重試。'; }
    }
    if (button.id === 'cancel-import') {
      pending = null; importRevision++;
      modal.querySelector<HTMLElement>('#import-preview')!.hidden = true;
      modal.querySelector<HTMLInputElement>('#import-progress')!.value = '';
      modal.querySelector('#import-status')!.textContent = '已取消匯入，戰績未有改動。';
      modal.querySelector<HTMLInputElement>('#import-progress')!.focus();
    }
    if (button.id === 'confirm-import' && pending) {
      button.disabled = true;
      if (actions.importProgress(pending)) {
        pending = null;
        modal.querySelector('#panel-records')!.innerHTML = recordsMarkup(actions.getProgress(), actions.getStatus());
        modal.querySelector('#import-status')!.textContent = '戰績已合併並儲存。原有較高分數及進度已保留。';
        modal.querySelector<HTMLButtonElement>('#export-progress')!.focus();
      } else {
        button.disabled = false;
        modal.querySelector('#import-status')!.textContent = '瀏覽器未允許儲存，未有套用匯入。請允許網站資料後重試。';
      }
    }
  }, { signal: abort.signal });
  return () => { importRevision++; abort.abort(); };
}
