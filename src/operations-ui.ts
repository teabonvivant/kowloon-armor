import type { Game } from './game';
import { TANKS } from './data/tanks';
import type { TankSpec } from './data/tanks';
import { dialogHeader } from './dialogs';
import { TOUR_STOPS } from './field';
import { challengeStatus, CHALLENGES } from './operations';
import { REALISM_SAMPLE } from './realism';

export function comparison(first: TankSpec, second: TankSpec): string {
  const rows = [['最高速度', 'speed', 'km/h'], ['倒車速度', 'reverse', 'km/h'], ['正面防護', 'armor', ''], ['車體耐久', 'hp', ''], ['裝填時間', 'reload', 's'], ['基礎傷害', 'damage', '']] as const;
  return `<table class="record-table"><caption>遊戲性能比較 · 並非真實戰力排名</caption><thead><tr><th scope="col">性能</th><th scope="col">${first.name}</th><th scope="col">${second.name}</th></tr></thead><tbody>${rows.map(([label, key, unit]) => `<tr><th scope="row">${label}</th><td>${first[key]} ${unit}</td><td>${second[key]} ${unit} <small>(${second[key] - first[key] >= 0 ? '+' : ''}${(second[key] - first[key]).toFixed(1)})</small></td></tr>`).join('')}</tbody></table><p class="fine-print">差額以對照車減目前戰車計算；裝填時間越短越快，其他數值越高不代表整體越強。</p>`;
}

export function preparationMarkup(game: Game, favorites: readonly string[], seed: number | undefined, challenge: Game['challenge']): string {
  const tank = game.player.spec, other = TANKS.find(item => item.id !== tank.id)!;
  return `${dialogHeader('SORTIE WORKBENCH', '整備工具')}
    <p class="dialog-intro">${tank.name} · 比較、收藏，再安排下一場練習。</p>
    <button class="btn" data-action="favorite" aria-pressed="${favorites.includes(tank.id)}">${favorites.includes(tank.id) ? '★ 已收藏 · 按此取消' : '☆ 收藏目前戰車'}</button>
    <label class="settings-field">對照戰車<select id="compare-tank">${TANKS.map(item => `<option value="${item.id}" ${item.id === other.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label>
    <div id="comparison">${comparison(tank, other)}</div>
    <div class="settings-grid"><label class="settings-field">演習種子（留空隨機）<input id="sortie-seed" type="text" inputmode="numeric" maxlength="10" value="${seed ?? ''}" placeholder="0–4294967295" aria-describedby="seed-help"></label>
    <label class="settings-field">選做挑戰<select id="sortie-challenge">${Object.entries(CHALLENGES).map(([id, label]) => `<option value="${id}" ${id === challenge ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    <p class="fine-print" id="seed-help">只改下一場配置，本次開啟期間保留。相同版本、車型、模式、難度與種子有相同初始配置；不是操作錄影。自由駕駛及教學不套用挑戰；保甲挑戰須勝利，無盡防線請選精準或機動。</p>
    <p id="sortie-status" role="status"></p><div class="dialog-buttons"><button class="btn btn-primary" id="apply-sortie">套用整備設定</button><button class="btn" data-action="close">返回車庫</button></div>`;
}

export function tacticalMarkup(game: Game): string {
  const point = (value: number): number => 220 + value;
  const landmarks = REALISM_SAMPLE ? [] : TOUR_STOPS;
  const player = game.player.visual.root.position, goal = game.mode === 'campaign' ? game.mission?.objective : undefined;
  const challenge = challengeStatus(game);
  return `${dialogHeader('TACTICAL BOARD', '戰術地圖與戰況')}
    <p class="dialog-intro">${REALISM_SAMPLE ? '街口樣板 · 演習已暫停。圖中只標示本場景障礙與敵我位置；可點圖或輸入座標設定航點。' : '演習已暫停。點圖設定航點，或用下方座標／地標按鈕。'}地圖沿用演習的全域敵軍資訊，不代表視線內偵測。</p>
    <div class="tactical-layout"><div><svg id="tactical-map" viewBox="0 0 440 440" role="img" aria-label="九龍戰術地圖，亦可使用下方座標欄位設定航點">
      <rect width="440" height="440" fill="#111b1e"/>
      <g fill="#3e4c4e">${game.world.obstacles.map(obstacle => `<rect x="${point(obstacle.x - obstacle.halfX)}" y="${point(obstacle.z - obstacle.halfZ)}" width="${obstacle.halfX * 2}" height="${obstacle.halfZ * 2}"/>`).join('')}</g>
      <g fill="#f1d29f" font-size="10">${landmarks.map(stop => `<circle cx="${point(stop.x)}" cy="${point(stop.z)}" r="3"/><text x="${point(stop.x) + 5}" y="${point(stop.z) - 6}">${stop.name}</text>`).join('')}</g>
      ${goal && goal.kind !== 'clear' ? `<circle cx="${point(goal.center[0])}" cy="${point(goal.center[1])}" r="${goal.radius}" fill="#e8a65a33" stroke="#ffd18b"/>` : ''}
      ${game.enemies.filter(enemy => enemy.alive).map(enemy => `<path d="M0 -5 5 0 0 5 -5 0Z" fill="#ffcf5a" transform="translate(${point(enemy.visual.root.position.x)} ${point(enemy.visual.root.position.z)})"/>`).join('')}
      <path d="M0 -8 6 6 0 3 -6 6Z" fill="#64e5ff" transform="translate(${point(player.x)} ${point(player.z)}) rotate(${-game.player.yaw * 180 / Math.PI})"/>
      <g id="map-waypoint" fill="none" stroke="#fff" stroke-width="2"></g><text x="398" y="22" fill="#fff" font-size="12">N ↑</text>
    </svg><p class="fine-print">青色 ▲ 我方 · 琥珀 ◇ 敵軍 · 金圈 任務區 · 白圈 航點</p></div>
    <div class="tactical-summary"><h3>本回合作戰摘要</h3><p>耐久 ${Math.round(game.player.hp / game.player.maxHp * 100)}% · 擊破 ${game.kills} / ${game.totalEnemies}</p><p>命中 ${game.shots ? Math.round(game.hits / game.shots * 100) : 0}%（${game.hits}/${game.shots}）</p><p>輸出 ${game.report.dealt} · 承傷 ${game.report.received}</p><p>行駛 ${Math.round(game.report.distance)} m · ${Math.floor(game.elapsed)} 秒</p><p>種子 ${game.seed}</p><h3>${challenge.title}</h3><p>${challenge.progress}${challenge.complete ? ' · 條件已達成' : ''}</p>
    <h3>最近戰鬥事件（最多 40 筆）</h3><ol class="event-log">${game.journal.length ? [...game.journal].reverse().map(entry => `<li><time>${Math.floor(entry.time / 60)}:${String(Math.floor(entry.time % 60)).padStart(2, '0')}</time> ${entry.message}</li>`).join('') : '<li>尚未開炮或受擊。</li>'}</ol></div></div>
    <form id="waypoint-form" class="waypoint-form"><label>東西 X<input id="waypoint-x" type="number" min="-210" max="210" step="1" value="${Math.round(game.waypoint?.x ?? player.x)}" required></label><label>南北 Z<input id="waypoint-z" type="number" min="-210" max="210" step="1" value="${Math.round(game.waypoint?.z ?? player.z)}" required></label><button class="btn" type="submit">設定航點</button><button class="btn" id="clear-waypoint" type="button">清除航點</button></form>
    <div class="landmark-shortcuts">${landmarks.map((stop, index) => `<button class="btn" data-waypoint="${index}">${stop.name}</button>`).join('')}</div>
    <p id="waypoint-status" role="status">航點為直線方向提示，不會自動駕駛或穿過建築。</p>
    <div class="dialog-buttons"><button class="btn btn-primary" data-action="close">繼續演習</button><button class="btn" data-action="return-pause">返回暫停選單</button></div>`;
}

export function mountTactical(modal: HTMLDialogElement, game: Game): void {
  const status = modal.querySelector<HTMLElement>('#waypoint-status')!;
  const refresh = (): void => {
    const waypoint = game.waypoint;
    modal.querySelector('#map-waypoint')!.innerHTML = waypoint ? `<circle cx="${220 + waypoint.x}" cy="${220 + waypoint.z}" r="8"/>` : '';
  };
  const set = (x: number, z: number): void => {
    const accepted = game.setWaypoint(x, z);
    status.textContent = accepted ? `已設定航點 X ${x} / Z ${z}。抵達 10 米內會自動清除。` : '位置在建築物內或演習區外，請選道路。原航點保留。';
    if (accepted) {
      modal.querySelector<HTMLInputElement>('#waypoint-x')!.value = String(x);
      modal.querySelector<HTMLInputElement>('#waypoint-z')!.value = String(z);
    }
    refresh();
  };
  modal.querySelector('#tactical-map')!.addEventListener('click', event => {
    if (!(event instanceof MouseEvent)) return;
    const map = modal.querySelector<SVGSVGElement>('#tactical-map')!, matrix = map.getScreenCTM();
    if (!matrix) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    set(Math.round(position.x - 220), Math.round(position.y - 220));
  });
  modal.querySelector('#waypoint-form')!.addEventListener('submit', event => {
    event.preventDefault(); set(Number(modal.querySelector<HTMLInputElement>('#waypoint-x')!.value), Number(modal.querySelector<HTMLInputElement>('#waypoint-z')!.value));
  });
  modal.querySelector('#clear-waypoint')!.addEventListener('click', () => { game.waypoint = null; refresh(); status.textContent = '已清除航點。'; });
  for (const button of modal.querySelectorAll<HTMLElement>('[data-waypoint]')) button.addEventListener('click', () => {
    const stop = TOUR_STOPS[Number(button.dataset['waypoint'])]; if (stop) set(stop.x, stop.z);
  });
  refresh();
}
