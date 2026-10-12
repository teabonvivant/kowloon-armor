import type { GameAudio } from './audio';
import { mountControllerSettings } from './controller-settings';
import { MISSIONS } from './data/missions';
import { TANKS } from './data/tanks';
import { aboutDialog, briefingDialog, dialogHeader, guideDialog, missionsDialog, resultDialog } from './dialogs';
import type { Game, GameMode } from './game';
import { garageMarkup, tankCard } from './garage';
import { hudMarkup } from './hud';
import type { Input } from './input';
import { PROGRESS_KEY, mergeProgress, readProgress, recordResult, saveProgress } from './persistence';
import type { Progress, ProgressStatus } from './persistence';
import { loadPreferences, savePreferences } from './preferences';
import { icon, required } from './ui-kit';
import type { View } from './view';
import { FACE_NAMES, ZONE_NAMES } from './armor';
import type { Impact } from './armor';
import { mountKeyboardSettings } from './keyboard-settings';
import { mountSettings } from './settings';
import type { SettingsTab } from './settings';

export class Interface {
  private readonly app = required('#app', HTMLElement);
  private readonly modal = required('#modal', HTMLDialogElement);
  private cleanup: (() => void) | undefined;
  private progress: Progress;
  private storageStatus: ProgressStatus | 'unsaved';
  private mode: GameMode = 'campaign'; private missionIndex = 0;
  private noticeTimer = 0; private returnFocus: HTMLElement | null = null;
  private hitTimer = 0;
  private preferences = loadPreferences();
  constructor(private readonly game: Game, private readonly input: Input, private readonly view: View, private readonly audio: GameAudio) {
    const stored = readProgress(); this.progress = stored.progress; this.storageStatus = stored.status;
    this.mode = this.preferences.mode;
    this.missionIndex = this.preferences.deploymentSet ? Math.min(this.preferences.missionIndex, this.progress.completed, 5) : Math.min(this.progress.completed, 5);
    const selected = TANKS.find(tank => tank.id === this.preferences.tankId);
    if (selected && selected.id !== this.game.player.spec.id) this.game.select(selected);
    this.applyPreferences();
    document.addEventListener('click', event => this.click(event));
    this.modal.addEventListener('close', () => {
      if (this.modal.open) return;
      this.cleanup?.(); this.cleanup = undefined; this.input.reset();
      if (this.game.phase === 'paused' || this.game.phase === 'playing') { this.game.resume(); this.view.canvas.focus(); }
      else if (this.returnFocus?.isConnected) this.returnFocus.focus();
      else this.app.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus();
    });
    this.modal.addEventListener('cancel', event => {
      if (this.game.phase === 'victory' || this.game.phase === 'defeat') event.preventDefault();
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
    window.addEventListener('storage', event => {
      if (event.key !== PROGRESS_KEY) return;
      const latest = readProgress();
      if (latest.status !== 'ready') return;
      this.progress = mergeProgress(this.progress, latest.progress);
      if (this.game.phase === 'garage') this.showGarage();
    });
    this.showGarage();
    if (stored.status === 'recovered') this.notify('已從上一次有效副本救回戰績，建議到「戰績」匯出備份。');
    if (stored.status === 'invalid' || stored.status === 'unavailable') this.notify('本機紀錄未能讀取，可到「戰績」查看儲存狀態及匯入備份。');
  }
  notify(message: string): void {
    const notice = required('#notice', HTMLElement); notice.textContent = message; notice.classList.add('show');
    clearTimeout(this.noticeTimer); this.noticeTimer = window.setTimeout(() => notice.classList.remove('show'), 3600);
  }
  showGarage(): void {
    const scoreKey = `${this.mode}:${this.mode === 'campaign' ? this.missionIndex + 1 : 0}:${this.preferences.difficulty}`;
    const previousScroll = this.app.querySelector('.fleet-track')?.scrollLeft ?? 0;
    this.app.innerHTML = garageMarkup(this.game.player.spec, this.mode, this.missionIndex, this.progress.completed,
      this.preferences.difficulty, this.progress.bestScores[scoreKey] ?? 0, this.progress.trainingComplete);
    document.body.classList.remove('in-battle');
    const track = this.app.querySelector<HTMLElement>('.fleet-track');
    const selected = track?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (track && selected) {
      track.scrollLeft = previousScroll;
      if (selected.offsetLeft < track.offsetLeft + track.scrollLeft || selected.offsetLeft + selected.offsetWidth > track.offsetLeft + track.scrollLeft + track.clientWidth) {
        track.scrollLeft = selected.offsetLeft - track.offsetLeft - (track.clientWidth - selected.offsetWidth) / 2;
      }
    }
    this.view.frameGarage();
    const difficulty = this.app.querySelector<HTMLSelectElement>('#difficulty');
    difficulty?.addEventListener('change', () => {
      const value = difficulty.value;
      if (value === 'training' || value === 'standard' || value === 'veteran') {
        this.preferences.difficulty = value; this.storePreferences(); this.showGarage(); document.getElementById('difficulty')?.focus();
      }
    });
  }
  start(training = false): void {
    if (training) this.mode = 'drive';
    this.rememberDeployment(); this.close(); this.audio.unlock(); this.audio.setVolume(this.preferences.volume); this.input.reset();
    this.game.start(this.mode, this.missionIndex, this.preferences.difficulty);
    if (training) this.game.beginTraining();
    this.app.innerHTML = hudMarkup(this.game, this.preferences.bindings);
    document.body.classList.add('in-battle'); this.view.canvas.focus();
  }
  completeTraining(): void {
    if (this.progress.trainingComplete) return;
    this.persistProgress({ ...mergeProgress(this.progress, readProgress().progress), trainingComplete: true });
  }
  finish(victory: boolean): void {
    this.audio.stop(); this.progress = mergeProgress(this.progress, readProgress().progress);
    const scoreKey = `${this.game.mode}:${this.game.mode === 'campaign' ? this.game.mission?.id ?? 0 : 0}:${this.game.difficulty}`;
    const bestBefore = this.progress.bestScores[scoreKey] ?? 0;
    this.persistProgress(recordResult(this.progress, { mode: this.game.mode, missionId: this.game.mission?.id ?? 0,
      difficulty: this.game.difficulty, victory, score: this.game.score, wave: this.game.wave }));
    this.open(resultDialog(this.game, victory, this.progress.completed,
      (victory || this.game.mode === 'survival') && this.game.score > bestBefore, bestBefore, this.storageStatus !== 'unsaved'), 'result');
  }
  private persistProgress(progress: Progress): void {
    this.progress = progress;
    if (saveProgress(progress)) { this.progress = mergeProgress(progress, readProgress().progress); this.storageStatus = 'ready'; }
    else { this.storageStatus = 'unsaved'; this.notify('戰績未能寫入瀏覽器，離開前可到「戰績」匯出備份。'); }
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
    } else {
      const flash = document.getElementById('hit-flash'); flash?.classList.remove('active');
      requestAnimationFrame(() => flash?.classList.add('active')); this.notify(`裝甲受擊 −${damage}`);
    }
  }
  pause(): void { if (this.game.phase === 'playing') this.pauseMenu(); }
  private pauseMenu(): void {
    this.open(`${dialogHeader('SIMULATION PAUSED', '演習暫停')}<p class="dialog-intro">炮彈、車輛和倒數計時均已暫停。關閉視窗或按 Esc 繼續演習。</p><div class="pause-menu"><button class="btn btn-primary" data-action="close">繼續演習</button><button class="btn" data-action="settings">遊戲設定</button><button class="btn" data-action="controller">HOTAS 控制設定</button><button class="btn" data-action="guide">操作指南</button><button class="btn" data-action="return">返回車庫</button></div>`, 'pause');
  }
  private open(content: string, page = 'other'): void {
    this.cleanup?.(); this.cleanup = undefined;
    if (!this.modal.open) this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.game.pause(); this.input.reset(); this.audio.stop(); this.modal.innerHTML = content; this.modal.dataset['page'] = page;
    this.modal.scrollTop = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    if (!this.modal.open) this.modal.showModal();
    else this.modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
  private close(): void { this.cleanup?.(); this.cleanup = undefined; if (this.modal.open) this.modal.close(); }
  private dismiss(): void { if (this.game.phase === 'victory' || this.game.phase === 'defeat') this.returnGarage(); else this.close(); }
  private childBack(parent: string | undefined): void {
    const action = parent === 'settings' ? 'settings-controls' : this.game.phase === 'paused' ? 'return-pause' : 'guide';
    const label = parent === 'settings' ? '返回操作設定' : this.game.phase === 'paused' ? '返回暫停選單' : '返回操作指南';
    (this.modal.querySelector('.settings-panel') ?? this.modal).insertAdjacentHTML('beforeend', `<button class="text-button back-link" data-action="${action}">← ${label}</button>`);
  }
  private controller(): void {
    const parent = this.modal.dataset['page'];
    this.open('', 'controller'); this.cleanup = mountControllerSettings(this.modal, this.input, () => this.dismiss()); this.childBack(parent);
  }
  private keyboard(): void {
    const parent = this.modal.dataset['page'];
    this.open('', 'keyboard');
    this.cleanup = mountKeyboardSettings(this.modal, this.preferences.bindings, bindings => {
      this.preferences.bindings = bindings; this.input.setKeyboard(bindings, this.preferences.scopeMode); this.storePreferences();
      if (this.game.phase === 'paused') this.app.innerHTML = hudMarkup(this.game, bindings);
    });
    this.childBack(parent);
  }
  private roster(): void {
    this.open(`${dialogHeader('ARMOURED COLLECTION', '選擇你的戰車')}<label class="search-field">${icon('search')}<input id="tank-search" type="search" placeholder="搜尋型號、國家或定位…" aria-label="搜尋戰車" autocomplete="off"></label>
      <div class="roster-toolbar"><label>車重<select id="tank-filter"><option value="all">全部戰車</option><option value="mobile">55 t 或以下</option><option value="balanced">超過 55 至 65 t</option><option value="heavy">超過 65 t</option></select></label><label>排序<select id="tank-sort"><option value="catalogue">預設次序</option><option value="speed">最高速度</option><option value="armor">正面防護</option><option value="reload">最快裝填</option></select></label><output id="roster-count" role="status"></output></div>
      <div id="roster-grid" class="roster-grid"></div><p class="fine-print">選擇後返回車庫。性能為遊戲平衡設定，並非真實戰力排名。</p>`, 'roster');
    const search = required('#tank-search', HTMLInputElement), filter = required('#tank-filter', HTMLSelectElement), sort = required('#tank-sort', HTMLSelectElement);
    const render = (): void => {
      const query = search.value.trim().toLocaleLowerCase();
      const items = TANKS.filter(tank => `${tank.name} ${tank.country} ${tank.role}`.toLocaleLowerCase().includes(query)
        && (filter.value === 'mobile' ? tank.weight <= 55 : filter.value === 'balanced' ? tank.weight > 55 && tank.weight <= 65 : filter.value === 'heavy' ? tank.weight > 65 : true));
      if (sort.value === 'speed' || sort.value === 'armor') { const field = sort.value; items.sort((first, second) => second[field] - first[field]); }
      if (sort.value === 'reload') items.sort((first, second) => first.reload - second.reload);
      required('#roster-grid', HTMLElement).innerHTML = items.length ? items.map(tank => tankCard(tank, this.game.player.spec.id)).join('')
        : '<div class="empty-state"><p>找不到符合的戰車。請調整型號、國家或車重篩選。</p><button class="text-button" data-action="clear-search">清除搜尋及篩選</button></div>';
      required('#roster-count', HTMLElement).textContent = `${items.length} / 30 款`;
    };
    search.addEventListener('input', render); filter.addEventListener('change', render); sort.addEventListener('change', render); render(); search.focus();
  }
  private settings(tab: SettingsTab = 'display'): void {
    this.open('', 'settings');
    this.cleanup = mountSettings(this.modal, this.preferences, {
      changed: key => {
        if (key === 'quality') this.view.quality(this.preferences.quality);
        if (key === 'reducedMotion') this.view.reduceMotion(this.preferences.reducedMotion);
        if (key === 'volume') { this.audio.unlock(); this.audio.setVolume(this.preferences.volume); }
        if (key === 'sensitivity' || key === 'invertY') this.input.setPointer(this.preferences.sensitivity, this.preferences.invertY);
        if (key === 'scopeMode') this.input.setKeyboard(this.preferences.bindings, this.preferences.scopeMode);
        if (key === 'scopeZoom') this.view.scopeZoom = this.preferences.scopeZoom;
        if (key === 'hudScale') document.body.style.setProperty('--hud-scale', String(this.preferences.hudScale));
        this.storePreferences();
      },
      getProgress: () => this.progress, getStatus: () => this.storageStatus,
      importProgress: incoming => {
        const merged = mergeProgress(mergeProgress(this.progress, readProgress().progress), incoming);
        if (!saveProgress(merged)) return false;
        this.progress = mergeProgress(merged, readProgress().progress); this.storageStatus = 'ready';
        if (this.game.phase === 'garage') this.showGarage();
        return true;
      },
      testAudio: () => { this.audio.unlock(); this.audio.setVolume(this.preferences.volume); this.audio.ready(); },
    }, tab, this.game.phase === 'paused');
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
    if (status) status.textContent = saved ? '設定已儲存。' : '設定已套用，但瀏覽器未允許儲存；關閉後可能無法保留。';
    if (!saved) this.notify('設定已套用，但瀏覽器未允許儲存。');
  }
  private rememberDeployment(): void {
    this.preferences.mode = this.mode; this.preferences.missionIndex = this.missionIndex;
    this.preferences.tankId = this.game.player.spec.id; this.preferences.deploymentSet = true; this.storePreferences();
  }
  private leave(): void {
    if (this.game.phase === 'paused') {
      this.open(`${dialogHeader('LEAVE OPERATION', '結束這次演習？')}<p class="dialog-intro">本回合的分數不會記錄。已完成的戰役進度及最高分會保留。</p><div class="dialog-buttons"><button class="btn btn-primary" data-action="close">繼續演習</button><button class="btn" data-action="confirm-return">結束並返回車庫</button></div>`, 'leave');
    } else this.returnGarage();
  }
  private returnGarage(): void { this.game.garage(); this.close(); this.audio.stop(); this.showGarage(); }
  private click(event: MouseEvent): void {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button || button.disabled) return;
    const supply = button.dataset['supply'];
    if (supply === 'repair' || supply === 'reload') { if (this.game.chooseSupply(supply)) this.view.canvas.focus(); return; }
    const fleet = button.dataset['fleet'];
    if (fleet) { const track = this.app.querySelector('.fleet-track'); track?.scrollBy({ left: Number(fleet) * track.clientWidth * .7, behavior: 'instant' }); return; }
    const tankId = button.dataset['tank'];
    if (tankId) {
      const spec = TANKS.find(tank => tank.id === tankId);
      if (spec && this.game.phase === 'garage') {
        this.game.select(spec); this.rememberDeployment(); this.close(); this.showGarage();
        this.app.querySelector<HTMLButtonElement>(`[data-tank="${tankId}"]`)?.focus({ preventScroll: true });
      }
      return;
    }
    const mode = button.dataset['mode'];
    if (mode === 'drive' || mode === 'battle' || mode === 'campaign' || mode === 'survival') {
      this.mode = mode; this.rememberDeployment(); this.showGarage(); this.app.querySelector<HTMLElement>(`[data-mode="${mode}"]`)?.focus(); return;
    }
    const mission = button.dataset['mission'];
    if (mission !== undefined) {
      const index = Number(mission);
      if (Number.isInteger(index) && index >= 0 && index < MISSIONS.length && index <= this.progress.completed) {
        this.missionIndex = index; this.mode = 'campaign'; this.rememberDeployment(); this.close(); this.showGarage();
      }
      return;
    }
    switch (button.dataset['action']) {
      case 'start': case 'retry': this.start(); break;
      case 'training': this.start(true); break;
      case 'training-return': if (this.game.training?.step === 4) { this.mode = 'campaign'; this.missionIndex = Math.min(this.progress.completed, 5); this.rememberDeployment(); this.returnGarage(); } break;
      case 'next': this.missionIndex = Math.min(this.game.mission?.id ?? 1, 5); this.start(); break;
      case 'close': this.dismiss(); break;
      case 'return': this.leave(); break;
      case 'confirm-return': this.returnGarage(); break;
      case 'return-pause': this.pauseMenu(); break;
      case 'garage': if (this.game.phase === 'garage') this.showGarage(); break;
      case 'controller': this.controller(); break;
      case 'keyboard': this.keyboard(); break;
      case 'settings': this.settings(); break;
      case 'settings-controls': this.settings('controls'); break;
      case 'records': this.settings('records'); break;
      case 'guide': this.open(guideDialog(this.preferences.bindings, this.game.phase === 'garage'), 'guide'); if (this.game.phase === 'paused') this.childBack('pause'); break;
      case 'briefing': this.open(briefingDialog(this.mode, this.missionIndex, this.preferences.difficulty, this.game.player.spec), 'briefing'); break;
      case 'missions': this.open(missionsDialog(this.progress, this.missionIndex), 'missions'); break;
      case 'roster': case 'clear-search': this.roster(); break;
      case 'about': this.open(aboutDialog(), 'about'); break;
      case 'rotate': this.view.rotate(); break;
      case 'pause': this.pause(); break;
      case 'camera': this.game.cycleCamera(); break;
      case 'fullscreen': void this.fullscreen(); break;
    }
  }
  private async fullscreen(): Promise<void> {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { this.notify('此視窗未允許全螢幕，請按 F11 或在 Edge／Chrome 開啟。'); }
  }
}
