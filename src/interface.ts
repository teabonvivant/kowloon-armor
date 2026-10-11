import type { GameAudio } from './audio';
import { mountControllerSettings } from './controller-settings';
import { MISSIONS } from './data/missions';
import { TANKS } from './data/tanks';
import { aboutDialog, dialogHeader, guideDialog, missionsDialog, resultDialog } from './dialogs';
import type { Game, GameMode } from './game';
import { garageMarkup, tankCard } from './garage';
import { hudMarkup } from './hud';
import type { Input } from './input';
import { loadProgress, recordResult, saveProgress } from './persistence';
import { loadPreferences, savePreferences } from './preferences';
import { icon, required } from './ui-kit';
import type { View } from './view';
import { FACE_NAMES, ZONE_NAMES } from './armor';
import type { Impact } from './armor';
import { mountKeyboardSettings } from './keyboard-settings';

export class Interface {
  private readonly app = required('#app', HTMLElement);
  private readonly modal = required('#modal', HTMLDialogElement);
  private cleanup: (() => void) | undefined;
  private progress = loadProgress(); private mode: GameMode = 'campaign'; private missionIndex = 0;
  private noticeTimer = 0; private returnFocus: HTMLElement | null = null;
  private hitTimer = 0;
  private preferences = loadPreferences();
  constructor(private readonly game: Game, private readonly input: Input, private readonly view: View, private readonly audio: GameAudio) {
    this.missionIndex = Math.min(this.progress.completed, 5);
    this.applyPreferences();
    document.addEventListener('click', event => this.click(event));
    this.modal.addEventListener('close', () => {
      if (this.modal.open) return;
      this.cleanup?.(); this.cleanup = undefined;
      this.input.reset();
      if (this.game.phase === 'paused' || this.game.phase === 'playing') { this.game.resume(); this.view.canvas.focus(); }
      else this.returnFocus?.focus(); });
    this.modal.addEventListener('cancel', event => {
      if (this.game.phase === 'victory' || this.game.phase === 'defeat') event.preventDefault();
      else this.cleanup?.();
    });
    this.view.canvas.addEventListener('tank-controls', () => this.controller());
    this.view.canvas.addEventListener('tank-pause', () => this.pause());
    this.view.canvas.addEventListener('tank-pointer-error', () => this.notify('未能鎖定滑鼠，可用右鍵拖動瞄準。'));
    this.view.canvas.addEventListener('tank-recentre', () => {
      if (this.game.phase === 'playing') { this.game.player.aim = this.game.player.yaw; this.game.player.pitch = 0; }
    });
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    window.addEventListener('gamepaddisconnected', () => { if (this.game.phase === 'playing') {
      this.pause(); this.notify('搖桿已斷線，演習已暫停。'); } });
    this.showGarage();
  }
  notify(message: string): void {
    const notice = required('#notice', HTMLElement); notice.textContent = message; notice.classList.add('show');
    clearTimeout(this.noticeTimer); this.noticeTimer = window.setTimeout(() => notice.classList.remove('show'), 3200);
  }
  showGarage(): void {
    const scoreKey = `${this.mode}:${this.mode === 'campaign' ? this.missionIndex + 1 : 0}:${this.preferences.difficulty}`;
    this.app.innerHTML = garageMarkup(this.game.player.spec, this.mode, this.missionIndex, this.progress.completed,
      this.preferences.difficulty, this.progress.bestScores[scoreKey] ?? 0);
    document.body.classList.remove('in-battle');
    const difficulty = document.getElementById('difficulty');
    difficulty?.addEventListener('change', () => {
      if (!(difficulty instanceof HTMLSelectElement)) return;
      const value = difficulty.value;
      if (value === 'training' || value === 'standard' || value === 'veteran') {
        this.preferences.difficulty = value; this.storePreferences(); this.showGarage();
        document.getElementById('difficulty')?.focus();
      }
    });
  }
  start(): void {
    this.close(); this.audio.unlock(); this.audio.setVolume(this.preferences.volume); this.input.reset();
    this.game.start(this.mode, this.missionIndex, this.preferences.difficulty); this.app.innerHTML = hudMarkup(this.game, this.preferences.bindings);
    document.body.classList.add('in-battle'); this.view.canvas.focus();
  }
  finish(victory: boolean): void {
    this.audio.stop();
    const scoreKey = `${this.game.mode}:${this.game.mode === 'campaign' ? this.game.mission?.id ?? 0 : 0}:${this.game.difficulty}`;
    const bestBefore = this.progress.bestScores[scoreKey] ?? 0;
    this.progress = recordResult(this.progress, { mode: this.game.mode, missionId: this.game.mission?.id ?? 0,
      difficulty: this.game.difficulty, victory, score: this.game.score, wave: this.game.wave });
    if (!saveProgress(this.progress)) this.notify('本次成績未能儲存；請檢查瀏覽器的儲存權限。');
    this.open(resultDialog(this.game, victory, this.progress.completed, (victory || this.game.mode === 'survival') && this.game.score > bestBefore));
  }
  hit(damage: number, killed: boolean, enemy: boolean, impact?: Impact): void {
    this.audio.hit(impact?.zone.endsWith('Track'));
    if (enemy) {
      const location = impact ? `${FACE_NAMES[impact.face]}${ZONE_NAMES[impact.zone]}` : '裝甲';
      this.notify(killed ? `擊破敵方坦克 · ${location}` : `${location}命中 · ${damage} 傷害${impact?.zone.endsWith('Track') ? ' · 履帶受損' : ''}`);
      const marker = document.getElementById('hit-confirm');
      if (marker) {
        marker.textContent = killed ? '擊破' : `${location} −${damage}`;
        marker.classList.remove('confirmed', 'destroyed');
        requestAnimationFrame(() => { marker.classList.add('confirmed'); marker.classList.toggle('destroyed', killed); });
        clearTimeout(this.hitTimer); this.hitTimer = window.setTimeout(() => marker.classList.remove('confirmed'), 750);
      }
    }
    else { const flash = document.getElementById('hit-flash'); flash?.classList.remove('active');
      requestAnimationFrame(() => flash?.classList.add('active')); this.notify(`裝甲受擊 −${damage}`); }
  }
  pause(): void {
    if (this.game.phase !== 'playing') return;
    this.open(`${dialogHeader('SIMULATION PAUSED', '演習暫停')}<p class="dialog-intro">炮彈、車輛和倒數計時均已暫停。</p><div class="pause-menu"><button class="btn btn-primary" data-action="close">繼續演習</button><button class="btn" data-action="settings">畫面及瞄準設定</button><button class="btn" data-action="controller">搖桿設定</button><button class="btn" data-action="guide">操作指南</button><button class="btn" data-action="return">返回車庫</button></div>`);
  }
  private open(content: string): void {
    this.cleanup?.(); this.cleanup = undefined;
    if (!this.modal.open) this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.game.pause(); this.input.reset(); this.audio.stop(); this.modal.innerHTML = content;
    if (document.pointerLockElement) document.exitPointerLock();
    if (!this.modal.open) this.modal.showModal();
  }
  private close(): void { this.cleanup?.(); this.cleanup = undefined; if (this.modal.open) this.modal.close(); }
  private controller(): void {
    this.open(''); this.cleanup = mountControllerSettings(this.modal, this.input, () => this.close());
  }
  private keyboard(): void {
    this.open('');
    this.cleanup = mountKeyboardSettings(this.modal, this.preferences.bindings, bindings => {
      this.preferences.bindings = bindings; this.input.setKeyboard(bindings, this.preferences.scopeMode); this.storePreferences();
      if (this.game.phase === 'paused') this.app.innerHTML = hudMarkup(this.game, bindings);
    });
  }
  private roster(): void {
    this.open(`${dialogHeader('ARMOURED COLLECTION', '30 款現代戰車')}<label class="search-field">${icon('search')}<input id="tank-search" type="search" placeholder="搜尋型號或國家…" aria-label="搜尋戰車"></label><div id="roster-grid" class="roster-grid"></div><p class="fine-print">精選代表性型號及原型。數值經遊戲平衡處理，並非真實戰力排名。</p>`);
    const search = required('#tank-search', HTMLInputElement);
    const grid = required('#roster-grid', HTMLElement);
    const render = (): void => {
      const query = search.value.trim().toLocaleLowerCase();
      const items = TANKS.filter(t => `${t.name} ${t.country} ${t.role}`.toLocaleLowerCase().includes(query));
      grid.innerHTML = items.length ? items.map(t => tankCard(t, this.game.player.spec.id)).join('') : '<p class="empty-state">找不到符合的戰車，請試試其他型號或國家。</p>';
    };
    search.addEventListener('input', render); render(); search.focus();
  }
  private settings(): void {
    this.open(`${dialogHeader('SYSTEM SETTINGS', '遊戲設定')}
      <div class="settings-grid">
        <label class="settings-field">音量<input id="volume" type="range" min="0" max="1" step=".05" value="${this.preferences.volume}"></label>
        <label class="settings-field">畫面品質<select id="quality"><option value="medium">平衡</option><option value="low">流暢（關閉陰影）</option><option value="high">高畫質</option></select></label>
        <label class="settings-field">滑鼠瞄準靈敏度<span id="sensitivity-value">${this.preferences.sensitivity.toFixed(1)}×</span><input id="sensitivity" type="range" min=".3" max="2.5" step=".1" value="${this.preferences.sensitivity}"></label>
        <div class="settings-field"><label><input id="invert-y" type="checkbox" ${this.preferences.invertY ? 'checked' : ''}> 反向滑鼠垂直瞄準</label><label><input id="reduce-motion" type="checkbox" ${this.preferences.reducedMotion ? 'checked' : ''}> 減少動態效果及開炮震動</label></div>
        <label class="settings-field">鍵盤瞄準鏡<select id="scope-mode"><option value="hold">按住使用</option><option value="toggle">按一下切換</option></select></label>
        <label class="settings-field">瞄準鏡倍率<select id="scope-zoom"><option value="2">2 倍 · 廣視野</option><option value="3">3 倍</option><option value="4">4 倍 · 遠距離</option></select></label>
        <label class="settings-field">戰鬥資訊大小<select id="hud-scale"><option value="0.85">精簡 · 85%</option><option value="1">標準 · 100%</option><option value="1.15">放大 · 115%</option></select></label>
        <p class="settings-field settings-help">按住觀察鍵可轉動鏡頭而保持炮塔方向。小視窗會自動限制資訊大小，保留中央視野。HOTAS 瞄準鏡維持按住操作。</p>
      </div><div class="dialog-buttons"><button class="btn btn-primary" data-action="keyboard">鍵盤按鍵設定</button><button class="btn" data-action="controller">HOTAS 設定</button><button class="btn" data-action="fullscreen">全螢幕</button></div>
      <p class="fine-print" id="settings-save-status" role="status">設定自動儲存在目前瀏覽器。畫面較慢時可選「流暢」。</p>`);
    const scopeMode = required('#scope-mode', HTMLSelectElement); scopeMode.value = this.preferences.scopeMode;
    scopeMode.addEventListener('change', () => {
      this.preferences.scopeMode = scopeMode.value === 'toggle' ? 'toggle' : 'hold';
      this.input.setKeyboard(this.preferences.bindings, this.preferences.scopeMode); this.storePreferences();
    });
    const zoom = required('#scope-zoom', HTMLSelectElement); zoom.value = String(this.preferences.scopeZoom);
    zoom.addEventListener('change', () => {
      this.preferences.scopeZoom = zoom.value === '4' ? 4 : zoom.value === '3' ? 3 : 2;
      this.view.scopeZoom = this.preferences.scopeZoom; this.storePreferences();
    });
    const scale = required('#hud-scale', HTMLSelectElement); scale.value = String(this.preferences.hudScale);
    scale.addEventListener('change', () => {
      this.preferences.hudScale = Number(scale.value); document.body.style.setProperty('--hud-scale', scale.value); this.storePreferences();
    });
    required('#volume', HTMLInputElement).addEventListener('input', event => { if (event.target instanceof HTMLInputElement) {
      this.preferences.volume = Number(event.target.value); this.audio.unlock(); this.audio.setVolume(this.preferences.volume); this.storePreferences(); } });
    const quality = required('#quality', HTMLSelectElement); quality.value = this.preferences.quality;
    quality.addEventListener('change', () => {
      if (quality.value === 'low' || quality.value === 'medium' || quality.value === 'high') {
        this.preferences.quality = quality.value; this.view.quality(quality.value); this.storePreferences();
      }
    });
    required('#sensitivity', HTMLInputElement).addEventListener('input', event => {
      if (event.target instanceof HTMLInputElement) {
        this.preferences.sensitivity = Number(event.target.value);
        required('#sensitivity-value', HTMLElement).textContent = `${this.preferences.sensitivity.toFixed(1)}×`;
        this.input.setPointer(this.preferences.sensitivity, this.preferences.invertY); this.storePreferences();
      }
    });
    required('#invert-y', HTMLInputElement).addEventListener('change', event => {
      if (event.target instanceof HTMLInputElement) {
        this.preferences.invertY = event.target.checked;
        this.input.setPointer(this.preferences.sensitivity, this.preferences.invertY); this.storePreferences();
      }
    });
    required('#reduce-motion', HTMLInputElement).addEventListener('change', event => {
      if (event.target instanceof HTMLInputElement) {
        this.preferences.reducedMotion = event.target.checked; this.view.reduceMotion(this.preferences.reducedMotion); this.storePreferences();
      }
    });
  }
  private applyPreferences(): void {
    this.view.quality(this.preferences.quality); this.view.reduceMotion(this.preferences.reducedMotion);
    this.audio.setVolume(this.preferences.volume); this.input.setPointer(this.preferences.sensitivity, this.preferences.invertY);
    this.input.setKeyboard(this.preferences.bindings, this.preferences.scopeMode); this.view.scopeZoom = this.preferences.scopeZoom;
    document.body.style.setProperty('--hud-scale', String(this.preferences.hudScale));
  }
  private storePreferences(): void {
    const saved = savePreferences(this.preferences);
    const status = document.getElementById('settings-save-status');
    if (status) status.textContent = saved ? '設定已儲存。' : '設定已套用，但瀏覽器未允許儲存。';
    if (!saved) this.notify('設定已套用，但瀏覽器未允許儲存。');
  }
  private click(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    const supply = button.dataset['supply'];
    if (supply === 'repair' || supply === 'reload') {
      if (this.game.chooseSupply(supply)) this.view.canvas.focus();
      return;
    }
    const tankId = button.dataset['tank'];
    if (tankId) { const spec = TANKS.find(t => t.id === tankId); if (spec && this.game.phase === 'garage') {
      this.game.select(spec); this.close(); this.showGarage(); } return; }
    const mode = button.dataset['mode'];
    if (mode === 'drive' || mode === 'battle' || mode === 'campaign' || mode === 'survival') {
      this.mode = mode; this.showGarage(); this.app.querySelector<HTMLElement>(`[data-mode="${mode}"]`)?.focus(); return;
    }
    const mission = button.dataset['mission'];
    if (mission !== undefined) { const index = Number(mission);
      if (Number.isInteger(index) && index >= 0 && index < MISSIONS.length && index <= this.progress.completed) {
        this.missionIndex = index; this.mode = 'campaign'; this.close(); this.showGarage(); } return; }
    switch (button.dataset['action']) {
      case 'start': case 'retry': this.start(); break;
      case 'next': this.missionIndex = Math.min((this.game.mission?.id ?? 1), 5); this.start(); break;
      case 'close':
        if (this.game.phase === 'victory' || this.game.phase === 'defeat') { this.game.garage(); this.showGarage(); }
        this.close(); break;
      case 'return': this.game.garage(); this.close(); this.audio.stop(); this.showGarage(); break;
      case 'garage': if (this.game.phase === 'garage') this.showGarage(); break;
      case 'controller': this.controller(); break;
      case 'keyboard': this.keyboard(); break;
      case 'settings': this.settings(); break;
      case 'guide': this.open(guideDialog(this.preferences.bindings)); break;
      case 'missions': this.open(missionsDialog(this.progress, this.missionIndex)); break;
      case 'roster': this.roster(); break;
      case 'about': this.open(aboutDialog()); break;
      case 'rotate': this.view.rotate(); break;
      case 'pause': this.pause(); break;
      case 'camera': this.game.cycleCamera(); break;
      case 'fullscreen': void this.fullscreen(); break;
    }
  }
  private async fullscreen(): Promise<void> {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (error) { if (error instanceof Error) this.notify('此視窗未允許全螢幕，請按 F11 或在 Edge／Chrome 開啟。'); else throw error; }
  }
}
