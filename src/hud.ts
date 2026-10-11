import type { Game } from './game';
import { MODE_NAMES } from './garage';
import { icon } from './ui-kit';

export function hudMarkup(game: Game): string {
  return `<div class="battle-hud"><div class="combat-vignette"></div><div class="driver-frame" id="driver-frame" hidden></div>
    <div class="hud-top"><div class="operation-tag"><span class="live-dot"></span><span>${MODE_NAMES[game.mode]} <small>${game.mode === 'campaign' ? game.mission?.area : '九龍 · 封閉演習區'}</small></span></div><div class="compass"><span>W &nbsp; ┆ &nbsp; ┆ &nbsp; N &nbsp; ┆ &nbsp; ┆ &nbsp; E</span><b id="heading">000°</b></div><div class="hud-tools"><button class="icon-button" data-action="camera" aria-label="切換視角">${icon('camera')}</button><button class="icon-button" data-action="pause" aria-label="暫停遊戲">${icon('pause')}</button></div></div>
    <section class="objective"><span class="small-label">${game.mode === 'drive' ? '自由探索' : '作戰目標'}</span><strong>${game.mode === 'drive' ? '探索九龍街道' : '清除演習區內敵方坦克'}</strong><div><span id="objective-count">0 / ${game.totalEnemies}</span><span id="mission-time">00:00</span></div></section>
    <div class="reticle" id="reticle"><div class="reticle-h"></div><div class="reticle-v"></div><i></i><span id="reticle-range">APFSDS</span><b id="reload-label">就緒</b></div>
    <div id="enemy-markers" class="enemy-markers"></div><div class="hit-flash" id="hit-flash"></div>
    <div class="tank-status"><div class="hud-tank-name">${icon('tank', 25)}<span>${game.player.spec.name}<small>主戰坦克 / ${game.player.spec.country}</small></span></div><div class="hp-line"><b id="hp-value">${game.player.hp}</b><span>/ ${game.player.maxHp}</span><small>車體耐久</small></div><div class="hp-track"><i id="hp-fill"></i></div><div class="damage-direction" id="damage-text">装甲系統正常</div></div>
    <div class="driving-telemetry"><div><span id="gear">N</span><b id="speed">0</b><small>km/h</small></div><p><span id="camera-label">第三身視角</span><i>·</i><span id="gun-angle">炮管 +0.0°</span></p></div>
    <div class="minimap-wrap"><div class="minimap-heading"><span>九龍戰術地圖</span><b>N ↑</b></div><canvas id="minimap" width="240" height="240" aria-label="敵我位置小地圖"></canvas><div class="map-key"><i></i> 我方 <i></i> 敵方 <span>100 m</span></div></div>
    <div class="ammo-panel"><span class="shell-icon"></span><div><b>APFSDS</b><small>${game.player.spec.gun} mm 穿甲彈</small></div><strong>∞</strong><div class="reload-track"><i id="reload-fill"></i></div><span id="ammo-status">可以開火</span></div>
    <div class="battle-keybar"><span><kbd>W A S D</kbd> 駕駛</span><span><kbd>Q E</kbd> 炮塔</span><span><kbd>↑ ↓</kbd> 俯仰</span><span><kbd>SPACE</kbd> 開炮</span><span><kbd>SHIFT</kbd> 瞄準鏡</span><span><kbd>V</kbd> 視角</span><button data-action="controller">${icon('controller',16)} HOTAS</button><button data-action="guide"><kbd>H</kbd> 操作</button></div>
  </div>`;
}
const setText = (id: string, value: string): void => { const e = document.getElementById(id); if (e && e.textContent !== value) e.textContent = value; };
export function updateHud(game: Game): void {
  const p = game.player;
  setText('speed', Math.round(Math.abs(p.speed) * 3.6).toString());
  setText('gear', Math.abs(p.speed) < 0.3 ? 'N' : p.speed < 0 ? 'R' : `D${Math.min(6, Math.ceil(p.speed / 3))}`);
  setText('heading', `${Math.round(((p.aim * -180 / Math.PI) % 360 + 360) % 360).toString().padStart(3,'0')}°`);
  setText('hp-value', Math.round(p.hp).toString());
  setText('objective-count', game.mode === 'drive' ? '無限時間 · 無限彈藥' : `${game.kills} / ${game.totalEnemies} 已擊破`);
  const time = game.mode === 'campaign' ? Math.max(0, (game.mission?.timeLimit ?? 0) - game.elapsed) : game.elapsed;
  setText('mission-time', `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`);
  setText('reload-label', p.cooldown > 0 ? `裝填 ${p.cooldown.toFixed(1)} s` : '主炮就緒');
  setText('ammo-status', p.cooldown > 0 ? `裝填中 ${p.cooldown.toFixed(1)} 秒` : '可以開火');
  setText('gun-angle', `炮管 ${p.pitch >= 0 ? '+' : ''}${(p.pitch * 180 / Math.PI).toFixed(1)}°`);
  const cameraName = game.scope ? '瞄準鏡' : { chase: '第三身視角', driver: '駕駛員視角', gunner: '炮手視角' }[game.cameraMode];
  setText('camera-label', cameraName);
  const hp = document.getElementById('hp-fill'); if (hp) hp.style.width = `${p.hp / p.maxHp * 100}%`;
  const reload = document.getElementById('reload-fill'); if (reload) reload.style.width = `${(1-p.cooldown/p.spec.reload)*100}%`;
  const driver = document.getElementById('driver-frame'); if (driver) driver.hidden = game.cameraMode !== 'driver' || game.scope;
  const reticle = document.getElementById('reticle'); if (reticle) {
    reticle.classList.toggle('targeted', !!game.target); reticle.hidden = game.cameraMode === 'driver' && !game.scope;
    reticle.classList.toggle('scoped', game.scope);
  }
  setText('reticle-range', game.target ? `${Math.round(game.target.visual.root.position.distanceTo(p.visual.root.position))} m · 目標鎖定` : 'APFSDS');
  setText('damage-text', p.hp / p.maxHp < .3 ? '車體嚴重受損 · 尋找掩護' : '裝甲系統正常');
  drawMap(game);
}
function drawMap(game: Game): void {
  const canvas = document.getElementById('minimap'); if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.fillStyle = '#131d20'; ctx.fillRect(0, 0, 240, 240);
  ctx.strokeStyle = '#3f4d4d'; ctx.lineWidth = 10;
  for (const road of [-168,-84,0,84,168]) {
    const s = 120 + road * .49; ctx.beginPath(); ctx.moveTo(s,8); ctx.lineTo(s,232); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8,s); ctx.lineTo(232,s); ctx.stroke();
  }
  ctx.fillStyle = '#647571'; ctx.font = '10px Microsoft JhengHei';
  ctx.fillText('旺角', 150, 36); ctx.fillText('佐敦', 36, 154); ctx.fillText('彌敦道', 123, 203);
  for (const enemy of game.enemies) {
    const p = enemy.visual.root.position; ctx.fillStyle = enemy.alive ? '#f36a5b' : '#647571';
    ctx.save(); ctx.translate(120 + p.x * .49, 120 + p.z * .49); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3,-3,6,6); ctx.restore();
  }
  const p = game.player.visual.root.position;
  ctx.save(); ctx.translate(120 + p.x * .49, 120 + p.z * .49); ctx.rotate(-game.player.yaw);
  ctx.fillStyle = '#b7e8d8'; ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,5); ctx.lineTo(0,3); ctx.lineTo(-5,5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
