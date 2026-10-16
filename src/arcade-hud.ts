import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { Game } from './game';
import { COMBO_WINDOW, STRIKE_COOLDOWN, comboMultiplier } from './arcade';
import { keyLabel } from './key-bindings';
import type { KeyBindings } from './key-bindings';

/** Opening guidance timings (s of sortie time). */
export const GUIDE = { markerSeconds: 12, fireHintAt: 6, strikeHintFrom: 8, strikeHintTo: 10, cardSeconds: 1.2 } as const;
/** Maximum brightness of the per-shot screen flash (fraction of white). */
export const FLASH_ALPHA = .1;
/** Whether the per-shot flash may be shown at all under the comfort settings. */
export function flashAllowed(lowFlash: boolean, reducedMotion: boolean): boolean { return !lowFlash && !reducedMotion; }

const CSS = `
#arcade-hud{position:fixed;inset:0;pointer-events:none;z-index:6;font-family:inherit}
#arcade-hud .combo{position:absolute;top:calc(env(safe-area-inset-top,0px) + 118px);left:50%;transform:translateX(-50%);text-align:center;color:#ffd18b;text-shadow:0 2px 8px #000a;font-weight:800;opacity:0;transition:opacity .15s}
#arcade-hud .combo.on{opacity:1}
#arcade-hud .combo b{display:block;font-size:30px;line-height:1}
#arcade-hud .combo i{display:block;height:4px;margin-top:4px;border-radius:2px;background:#ffd18b;transform-origin:left}
#arcade-hud .pop{position:absolute;left:50%;top:38%;transform:translate(-50%,0);padding:6px 14px;border-radius:999px;background:#14110ddd;color:#fff;font-weight:700;font-size:15px;white-space:nowrap;animation:arcade-pop 1.5s ease-out forwards}
#arcade-hud .pop.kill{color:#ffd18b;border:1px solid #ffd18b88}
#arcade-hud .pop.prop{color:#ff9b54;border:1px solid #ff9b5488}
#arcade-hud .pop.pickup{color:#7fe8a8;border:1px solid #7fe8a888}
#arcade-hud .pop.strike{color:#ff6a5b;border:1px solid #ff6a5b88}
@keyframes arcade-pop{0%{opacity:0;transform:translate(-50%,10px) scale(.8)}12%{opacity:1;transform:translate(-50%,0) scale(1.08)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-42px) scale(1)}}
#arcade-hud .strike{position:absolute;left:calc(env(safe-area-inset-left,0px) + 12px);top:46%;width:60px;height:60px;border-radius:50%;border:2px solid #ffd18b;background:#14110dcc;color:#ffd18b;font-weight:800;font-size:12px;line-height:1.15;pointer-events:auto;touch-action:manipulation;overflow:hidden;cursor:pointer;padding:0}
#arcade-hud .strike span{position:relative;z-index:1;display:block}
#arcade-hud .strike .fill{position:absolute;left:0;right:0;bottom:0;background:#8a3a2a;height:0;transition:height .2s linear}
#arcade-hud .strike.ready{background:#7a2a1ecc;color:#fff;box-shadow:0 0 14px #ff6a5b88}
#arcade-hud .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,#ffffff1a 0%,#ffcf7a0d 45%,transparent 70%);opacity:0}
body.low-flash #arcade-hud .flash,body.reduce-motion #arcade-hud .flash{display:none}
#arcade-hud .marker{position:absolute;left:0;top:0;display:none;padding:3px 9px;border-radius:999px;background:#14110dcc;border:1px solid #ffb24a;color:#ffd18b;font-weight:800;font-size:13px;white-space:nowrap;transform:translate(-50%,-50%)}
#arcade-hud .marker.on{display:block}
#arcade-hud .marker.pulse{animation:arcade-pulse .7s ease-in-out infinite alternate}
@keyframes arcade-pulse{from{box-shadow:0 0 0 #ffb24a00}to{box-shadow:0 0 16px #ffb24acc}}
body.reduce-motion #arcade-hud .marker.pulse{animation:none;background:#5a3a10}
#arcade-hud .card{position:absolute;left:50%;top:20%;transform:translateX(-50%);text-align:center;color:#fff;font-weight:900;letter-spacing:.08em;text-shadow:0 2px 12px #000c;opacity:0;pointer-events:none}
#arcade-hud .card small{display:block;font-size:12px;letter-spacing:.3em;color:#ffd18b;font-weight:700}
#arcade-hud .card b{display:block;font-size:26px}
#arcade-hud .card.on{opacity:1;animation:arcade-card 1.2s ease-out forwards}
@keyframes arcade-card{0%{opacity:0}15%{opacity:1}80%{opacity:1}100%{opacity:0}}
body.reduce-motion #arcade-hud .card.on{animation:none;opacity:1}
#arcade-hud .flash.on{animation:arcade-flash .12s ease-out}
@keyframes arcade-flash{0%{opacity:1}100%{opacity:0}}
@media(max-height:480px){#arcade-hud .combo{top:calc(env(safe-area-inset-top,0px) + 70px)}#arcade-hud .strike{width:50px;height:50px;font-size:11px;top:36%}}
body.reduce-motion #arcade-hud .pop{animation-duration:.01s;opacity:1}
`;

export class ArcadeHud {
  private readonly root = document.createElement('div');
  private readonly combo = document.createElement('div');
  private readonly strike = document.createElement('button');
  private readonly flashLayer = document.createElement('div');
  private readonly fill = document.createElement('div');
  private readonly marker = document.createElement('div');
  private readonly card = document.createElement('div');
  private lastElapsed = Infinity; private firedHint = false; private strikeHint = false; private cardTimer = 0;
  private readonly point = new Vector3();
  constructor(private readonly game: Game, private readonly bindings: () => KeyBindings, private readonly stinger?: () => void) {
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    this.root.id = 'arcade-hud'; this.combo.className = 'combo'; this.flashLayer.className = 'flash';
    this.strike.className = 'strike'; this.strike.type = 'button'; this.strike.setAttribute('aria-label', `呼叫炮擊支援（${keyLabel(this.bindings().strike)}）`);
    this.fill.className = 'fill'; this.strike.append(this.fill, document.createElement('span'));
    this.strike.addEventListener('click', () => { this.game.callStrike(); this.strike.blur(); });
    this.marker.className = 'marker'; this.card.className = 'card';
    this.card.innerHTML = '<small>KOWLOON ARMOR</small><b>九龍裝甲行動 · A 組出擊</b>';
    this.root.append(this.flashLayer, this.combo, this.strike, this.marker, this.card);
    document.body.append(this.root);
  }
  popup(text: string, kind: string): void {
    const item = document.createElement('div'); item.className = `pop ${kind}`; item.textContent = text;
    this.root.append(item); setTimeout(() => item.remove(), 1600);
    while (this.root.querySelectorAll('.pop').length > 4) this.root.querySelector('.pop')?.remove();
  }
  /** Per-shot flash: at most 10% white, and never under low-flash or reduced-motion comfort settings. */
  flash(): void {
    if (!flashAllowed(document.body.classList.contains('low-flash'), document.body.classList.contains('reduce-motion'))) return;
    this.flashLayer.classList.remove('on'); void this.flashLayer.offsetWidth; this.flashLayer.classList.add('on');
  }
  /** Opening guidance: amber diamond + distance on the first corridor group, one-shot hints and the title card. */
  guide(camera: Camera): void {
    const g = this.game, playing = g.phase === 'playing';
    if (playing && g.elapsed < GUIDE.cardSeconds && g.elapsed < this.lastElapsed) { // a new sortie started
      this.firedHint = false; this.strikeHint = false; this.cardTimer = GUIDE.cardSeconds;
      this.card.classList.remove('on'); void this.card.offsetWidth; this.card.classList.add('on'); this.stinger?.();
    }
    if (playing) this.lastElapsed = g.elapsed; else if (g.phase !== 'paused') this.lastElapsed = Infinity;
    if (this.cardTimer > 0 && g.elapsed > GUIDE.cardSeconds) { this.cardTimer = 0; this.card.classList.remove('on'); }
    const group = g.arcade.opening[0]?.filter(prop => prop.alive) ?? [];
    const show = playing && group.length > 0 && g.arcade.propsDestroyed === 0 && g.elapsed < GUIDE.markerSeconds;
    if (!show) { this.marker.classList.remove('on', 'pulse'); }
    else {
      const x = group.reduce((sum, prop) => sum + prop.x, 0) / group.length, z = group.reduce((sum, prop) => sum + prop.z, 0) / group.length;
      const player = g.player.visual.root.position, distance = Math.round(Math.hypot(x - player.x, z - player.z));
      this.point.set(x, 2.2, z).project(camera);
      const behind = this.point.z > 1;
      this.marker.classList.toggle('on', !behind);
      this.marker.classList.toggle('pulse', g.elapsed >= GUIDE.fireHintAt && g.shots === 0);
      this.marker.style.left = `${Math.max(8, Math.min(92, (this.point.x * .5 + .5) * 100))}%`;
      this.marker.style.top = `${Math.max(12, Math.min(80, (-this.point.y * .5 + .5) * 100))}%`;
      const text = `◆ ${distance} m`;
      if (this.marker.textContent !== text) this.marker.textContent = text;
    }
    if (playing && !this.firedHint && g.elapsed >= GUIDE.fireHintAt && g.shots === 0 && g.arcade.propsDestroyed === 0) {
      this.firedHint = true; this.popup(`按 ${keyLabel(this.bindings().fire)} 開炮，引爆前方油罐`, 'strike');
    }
    if (playing && !this.strikeHint && g.elapsed >= GUIDE.strikeHintFrom && g.elapsed <= GUIDE.strikeHintTo && g.arcade.strikesCalled === 0) {
      this.strikeHint = true; this.popup(`${keyLabel(this.bindings().strike)}／按鈕：呼叫炮擊`, 'strike');
    }
  }
  update(): void {
    const playing = this.game.phase === 'playing' || this.game.phase === 'paused';
    this.root.style.display = playing ? '' : 'none';
    const a = this.game.arcade;
    this.combo.classList.toggle('on', a.combo > 1 && a.comboTimer > 0);
    if (a.combo > 1) {
      this.combo.innerHTML = `<b>×${comboMultiplier(a.combo)}</b>連殺 ${a.combo}<i style="transform:scaleX(${(a.comboTimer / COMBO_WINDOW).toFixed(2)})"></i>`;
    }
    const ready = a.strikeCooldown <= 0;
    this.strike.classList.toggle('ready', ready);
    this.fill.style.height = `${ready ? 0 : (a.strikeCooldown / STRIKE_COOLDOWN * 100).toFixed(0)}%`;
    const touchButton = document.getElementById('touch-strike');
    if (touchButton) { touchButton.classList.toggle('ready', ready); const text = ready ? '炮擊' : `${Math.ceil(a.strikeCooldown)}s`; if (touchButton.textContent !== text) touchButton.textContent = text; }
    const label = this.strike.querySelector('span');
    if (label) label.innerHTML = ready ? `炮擊<br>${keyLabel(this.bindings().strike)}` : `${Math.ceil(a.strikeCooldown)}s`;
  }
}
