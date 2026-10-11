import type { Game } from './game';
import { Vector3 } from 'three';
import type { Camera } from 'three';
import { DIFFICULTIES } from './challenges';
import { angleDelta, wallFraction } from './math';
import { MODE_NAMES } from './garage';
import { icon } from './ui-kit';
import { objectiveName } from './objectives';
import { DEFAULT_BINDINGS, keyLabel } from './key-bindings';
import type { KeyBindings } from './key-bindings';
import { districtAt } from './render/districts';

export function hudMarkup(game: Game, bindings: KeyBindings = DEFAULT_BINDINGS): string {
  return `<div class="battle-hud"><div class="combat-vignette"></div><div class="driver-frame" id="driver-frame" hidden></div>
    <div class="hud-top"><div class="operation-tag"><span class="live-dot"></span><span>${MODE_NAMES[game.mode]} <small>${game.mode === 'campaign' ? game.mission?.area : '九龍 · 封閉演習區'}${game.mode !== 'drive' ? ` / ${DIFFICULTIES[game.difficulty].name}` : ''}</small></span></div><div class="compass"><span id="compass-direction">北 N</span><b id="heading">000°</b></div><div class="hud-tools"><button class="icon-button" data-action="camera" aria-label="切換視角">${icon('camera')}</button><button class="icon-button" data-action="pause" aria-label="暫停遊戲">${icon('pause')}</button></div></div>
    <section class="objective"><span class="small-label" id="district-label">${game.mode === 'drive' ? '自由探索' : '作戰目標'}</span><strong id="objective-title">${game.mode === 'drive' ? '探索九龍街道' : objectiveName(game.mode === 'campaign' ? game.mission?.objective : undefined)}</strong><div><span id="objective-count">0 / ${game.totalEnemies}</span><span id="mission-time">00:00</span></div><p id="zone-status" hidden></p><p id="zone-location" hidden></p><progress id="zone-progress" max="100" value="0" aria-label="任務進度" hidden></progress><p id="wave-status" ${game.mode === 'survival' ? '' : 'hidden'}></p></section>
    <div class="bearing-instrument"><span id="hull-heading">車頭 000°</span><span id="turret-bearing">炮塔 0°</span><span id="observation-status" hidden>獨立觀察</span></div>
    <div class="incoming-indicator" id="incoming-indicator" hidden><i></i><span>受擊方向</span></div>
    <div class="reticle" id="reticle"><svg class="reload-ring" viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="43"/></svg><div class="reticle-h"></div><div class="reticle-v"></div><i></i><span id="reticle-range">APFSDS</span><b id="reload-label">就緒</b><em id="hit-confirm" aria-live="off"></em></div>
    <div id="enemy-markers" class="enemy-markers"></div><div class="hit-flash" id="hit-flash"></div>
    <div class="tank-status"><div class="hud-tank-name">${icon('tank', 25)}<span>${game.player.spec.name}<small>主戰坦克 / ${game.player.spec.country}</small></span></div><div class="hp-line"><b id="hp-value">${game.player.hp}</b><span>/ ${game.player.maxHp}</span><small>車體耐久</small></div><div class="hp-track"><i id="hp-fill"></i></div><div class="damage-direction" id="damage-text">裝甲系統正常</div></div>
    <div class="driving-telemetry"><div><span id="gear">N</span><b id="speed">0</b><small>km/h</small></div><p><span id="camera-label">第三身視角</span><i>·</i><span id="gun-angle">炮管 +0.0°</span></p></div>
    <div class="minimap-wrap"><div class="minimap-heading"><span>九龍戰術地圖</span><b>N ↑</b></div><canvas id="minimap" width="240" height="240" aria-label="敵我位置小地圖"></canvas><div class="map-key"><i></i> 我方 <i></i> 敵方 <span>100 m</span></div></div>
    <div class="ammo-panel"><span class="shell-icon"></span><div><b>APFSDS</b><small>${game.player.spec.gun} mm 穿甲彈</small></div><strong>∞</strong><div class="reload-track"><i id="reload-fill"></i></div><span id="ammo-status">可以開火</span></div>
    <section class="supply-panel" id="supply-panel" aria-label="波間整備選擇" hidden><strong>下一波整備 <span id="supply-countdown"></span></strong><div><button data-supply="repair" aria-pressed="true">修復<small>35% 車體及兩側履帶</small></button><button data-supply="reload" aria-pressed="false">快裝補給<small>4 發 · 裝填時間 −32%</small></button></div><p>倒數結束時套用 · 預設修復</p></section>
    <div class="battle-keybar"><span><kbd>${keyLabel(bindings.forward)} ${keyLabel(bindings.left)} ${keyLabel(bindings.reverse)} ${keyLabel(bindings.right)}</kbd> 駕駛</span><span><kbd>右鍵 / ${keyLabel(bindings.pointer)}</kbd> 瞄準</span><span><kbd>${keyLabel(bindings.recentre)}</kbd> 回正</span><span><kbd>${keyLabel(bindings.fire)}</kbd> 開炮</span><span><kbd>${keyLabel(bindings.scope)}</kbd> 瞄準鏡</span><span><kbd>${keyLabel(bindings.observe)}</kbd> 觀察</span><button data-action="controller"><kbd>${keyLabel(bindings.controls)}</kbd> HOTAS</button><button data-action="guide">操作指南</button></div>
  </div>`;
}
const setText = (id: string, value: string): void => { const e = document.getElementById(id); if (e && e.textContent !== value) e.textContent = value; };
export function updateHud(game: Game): void {
  const p = game.player;
  const target = game.target;
  const heading = ((p.aim * -180 / Math.PI) % 360 + 360) % 360;
  setText('hull-heading', `車頭 ${String(Math.round(((-p.yaw * 180 / Math.PI) % 360 + 360) % 360) % 360).padStart(3, '0')}°`);
  const relative = Math.round(-angleDelta(p.yaw, p.aim) * 180 / Math.PI);
  setText('turret-bearing', `炮塔 ${relative > 0 ? '右' : relative < 0 ? '左' : ''}${Math.abs(relative)}°`);
  const observation = document.getElementById('observation-status'); if (observation) observation.hidden = !game.observing;
  setText('district-label', districtAt(p.visual.root.position.x, p.visual.root.position.z));
  setText('speed', Math.round(Math.abs(p.speed) * 3.6).toString());
  setText('gear', Math.abs(p.speed) < 0.3 ? 'N' : p.speed < 0 ? 'R' : `D${Math.min(6, Math.ceil(p.speed / 3))}`);
  setText('heading', `${(Math.round(heading) % 360).toString().padStart(3,'0')}°`);
  setText('compass-direction', ['北 N', '東北 NE', '東 E', '東南 SE', '南 S', '西南 SW', '西 W', '西北 NW'][Math.round(heading / 45) % 8] ?? '北 N');
  setText('hp-value', Math.round(p.hp).toString());
  setText('objective-count', game.mode === 'drive' ? '無限時間 · 無限彈藥' : `${game.kills} / ${game.totalEnemies} 已擊破`);
  if (game.mode === 'survival') {
    setText('objective-title', game.intermission > 0 ? '整備時間 · 轉移至有利位置' : `第 ${game.wave} 波 · 守住防線`);
    setText('wave-status', game.intermission > 0 ? `${Math.ceil(game.intermission)} 秒後增援 · ${game.supply === 'repair' ? '修復車體及履帶' : '四發快裝補給'}` : `剩餘 ${game.enemies.filter(enemy => enemy.alive).length} 輛 · ${game.score.toLocaleString()} 分`);
  }
  const goal = game.mode === 'campaign' ? game.mission?.objective : undefined;
  const zoneStatus = document.getElementById('zone-status'), zoneLocation = document.getElementById('zone-location');
  const zoneProgress = document.getElementById('zone-progress');
  if (goal && goal.kind !== 'clear') {
    if (zoneStatus) zoneStatus.hidden = false; if (zoneLocation) zoneLocation.hidden = false;
    const position = p.visual.root.position;
    const distance = Math.hypot(goal.center[0] - position.x, goal.center[1] - position.z);
    const bearing = ((Math.atan2(goal.center[0] - position.x, -(goal.center[1] - position.z)) * 180 / Math.PI) + 360) % 360;
    setText('zone-status', `${game.objective.contested ? '敵車爭奪中' : game.objective.inside ? '正在控制區域' : '請駛入標示區域'} · ${Math.floor(game.objective.progress)} / ${goal.seconds} 秒`);
    setText('zone-location', `${Math.round(distance)} m · 方位 ${Math.round(bearing)}°${goal.kind === 'defend' ? ` · 防線 ${Math.ceil(game.objective.integrity)}%` : ''}`);
    if (zoneProgress instanceof HTMLProgressElement) { zoneProgress.hidden = false; zoneProgress.value = game.objective.progress / goal.seconds * 100; }
  }
  const supply = document.getElementById('supply-panel');
  if (supply) {
    supply.hidden = !(game.mode === 'survival' && game.intermission > 0);
    if (!supply.hidden) {
      setText('supply-countdown', `${Math.ceil(game.intermission)} s`);
      for (const button of supply.querySelectorAll('[data-supply]')) button.setAttribute('aria-pressed', String(button.getAttribute('data-supply') === game.supply));
    }
  }
  const incoming = document.getElementById('incoming-indicator');
  if (incoming) {
    incoming.hidden = game.damageTimer <= 0;
    const viewYaw = game.observing ? game.observationYaw : game.cameraMode === 'driver' && !game.scope ? p.yaw : p.aim;
    incoming.style.setProperty('--bearing', `${-angleDelta(viewYaw, game.damageBearing)}rad`);
  }
  const time = game.mode === 'campaign' ? Math.max(0, (game.mission?.timeLimit ?? 0) - game.elapsed) : game.elapsed;
  setText('mission-time', `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`);
  setText('reload-label', p.cooldown > 0 ? `裝填 ${p.cooldown.toFixed(1)} s` : '主炮就緒');
  setText('ammo-status', `${p.cooldown > 0 ? `裝填中 ${p.cooldown.toFixed(1)} 秒` : '可以開火'}${p.rapidShots > 0 ? ` · 快裝 ${p.rapidShots} 發` : ''}`);
  setText('gun-angle', `炮管 ${p.pitch >= 0 ? '+' : ''}${(p.pitch * 180 / Math.PI).toFixed(1)}°`);
  const cameraName = game.observing ? '獨立觀察 · 炮塔保持' : game.scope ? '瞄準鏡' : { chase: '第三身視角', driver: '駕駛員視角', gunner: '炮手視角' }[game.cameraMode];
  setText('camera-label', cameraName);
  const hp = document.getElementById('hp-fill'); if (hp) hp.style.width = `${p.hp / p.maxHp * 100}%`;
  const reload = document.getElementById('reload-fill'); if (reload) reload.style.width = `${(1-p.cooldown/p.reloadDuration)*100}%`;
  const driver = document.getElementById('driver-frame'); if (driver) driver.hidden = game.cameraMode !== 'driver' || game.scope;
  const reticle = document.getElementById('reticle'); if (reticle) {
    reticle.classList.toggle('targeted', !!target); reticle.hidden = game.observing || game.cameraMode === 'driver' && !game.scope;
    reticle.classList.toggle('scoped', game.scope);
    reticle.classList.toggle('loading', p.cooldown > 0);
    reticle.style.setProperty('--reload-gap', String(270 * p.cooldown / p.reloadDuration));
  }
  setText('reticle-range', target ? `${Math.round(target.visual.root.position.distanceTo(p.visual.root.position))} m · 炮塔對準` : 'APFSDS');
  const trackTime = Math.max(p.leftTrack, p.rightTrack);
  setText('damage-text', trackTime > 0 ? `${p.leftTrack > 0 && p.rightTrack > 0 ? '兩側' : p.leftTrack > 0 ? '左' : '右'}履帶受損 · 停車修復 ${trackTime.toFixed(1)} s` : p.hp / p.maxHp < .3 ? '車體嚴重受損 · 尋找掩護' : '車體及履帶正常');
  drawMap(game);
}
const markerPosition = new Vector3();
export function updateEnemyMarkers(game: Game, camera: Camera): void {
  const container = document.getElementById('enemy-markers'); if (!container) return;
  while (container.children.length > game.enemies.length) container.lastElementChild?.remove();
  const player = game.player.visual.root.position;
  game.enemies.forEach((enemy, index) => {
    let marker = container.children[index] as HTMLElement | undefined;
    if (!marker) {
      marker = document.createElement('div'); marker.className = 'enemy-marker';
      marker.innerHTML = '<span></span><b></b><i></i>'; container.append(marker);
    }
    const position = enemy.visual.root.position;
    markerPosition.copy(position); markerPosition.y += 5; markerPosition.project(camera);
    marker.hidden = !enemy.alive || markerPosition.z > 1 || markerPosition.z < -1 || Math.abs(markerPosition.x) > .95 ||
      Math.abs(markerPosition.y) > .9 || wallFraction(player.x, player.z, position.x - player.x, position.z - player.z, game.world.obstacles) < 1;
    if (marker.hidden) return;
    marker.style.left = `${(markerPosition.x * .5 + .5) * 100}%`;
    marker.style.top = `${(-markerPosition.y * .5 + .5) * 100}%`;
    const distance = marker.firstElementChild;
    if (distance) distance.textContent = `◇ ${Math.round(position.distanceTo(player))} m`;
    const name = marker.children[1]; if (name) name.textContent = enemy.spec.name;
    marker.style.setProperty('--health', `${enemy.hp / enemy.maxHp * 100}%`);
  });
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
  const goal = game.mode === 'campaign' ? game.mission?.objective : undefined;
  if (goal && goal.kind !== 'clear') {
    ctx.strokeStyle = game.objective.contested ? '#ff8b7d' : '#ffd18b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(120 + goal.center[0] * .49, 120 + goal.center[1] * .49, goal.radius * .49, 0, Math.PI * 2); ctx.stroke();
  }
  for (const enemy of game.enemies) {
    const p = enemy.visual.root.position; ctx.fillStyle = enemy.alive ? '#f36a5b' : '#647571';
    ctx.save(); ctx.translate(120 + p.x * .49, 120 + p.z * .49); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3,-3,6,6); ctx.restore();
  }
  const p = game.player.visual.root.position;
  ctx.save(); ctx.translate(120 + p.x * .49, 120 + p.z * .49); ctx.rotate(-game.player.yaw);
  ctx.fillStyle = '#b7e8d8'; ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,5); ctx.lineTo(0,3); ctx.lineTo(-5,5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#dce8e0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(176, 221); ctx.lineTo(225, 221); ctx.stroke();
  ctx.fillStyle = '#dce8e0'; ctx.font = '10px Arial'; ctx.fillText('100 m', 187, 214);
}
