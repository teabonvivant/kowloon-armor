import type { Game } from './game';
import { COMBO_WINDOW, STRIKE_COOLDOWN, comboMultiplier } from './arcade';

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
#arcade-hud .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,#fff6 0%,#ffcf7a22 45%,transparent 70%);opacity:0}
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
  constructor(private readonly game: Game) {
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    this.root.id = 'arcade-hud'; this.combo.className = 'combo'; this.flashLayer.className = 'flash';
    this.strike.className = 'strike'; this.strike.type = 'button'; this.strike.setAttribute('aria-label', '呼叫炮擊支援（G）');
    this.fill.className = 'fill'; this.strike.append(this.fill, document.createElement('span'));
    this.strike.addEventListener('click', () => { this.game.callStrike(); this.strike.blur(); });
    this.root.append(this.flashLayer, this.combo, this.strike);
    document.body.append(this.root);
    window.addEventListener('keydown', event => {
      if (event.code === 'KeyG' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey &&
        (event.target === document.body || event.target === document.documentElement || (event.target as HTMLElement | null)?.id === 'world')) this.game.callStrike();
    });
  }
  popup(text: string, kind: string): void {
    const item = document.createElement('div'); item.className = `pop ${kind}`; item.textContent = text;
    this.root.append(item); setTimeout(() => item.remove(), 1600);
    while (this.root.querySelectorAll('.pop').length > 4) this.root.querySelector('.pop')?.remove();
  }
  flash(): void { this.flashLayer.classList.remove('on'); void this.flashLayer.offsetWidth; this.flashLayer.classList.add('on'); }
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
    const label = this.strike.querySelector('span');
    if (label) label.innerHTML = ready ? '炮擊<br>G' : `${Math.ceil(a.strikeCooldown)}s`;
  }
}
