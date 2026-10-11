import { MISSIONS, MISSION_WORLD_NOTE } from './data/missions';
import { TANK_CATALOGUE_NOTE, TANK_SOURCES } from './data/tanks';
import type { Game } from './game';
import type { Progress } from './persistence';
import { icon } from './ui-kit';

export function dialogHeader(eyebrow: string, title: string): string {
  return `<div class="dialog-header"><div><span class="eyebrow">${eyebrow}</span><h2 id="modal-title">${title}</h2></div><button class="icon-button" data-action="close" aria-label="關閉視窗">${icon('close')}</button></div>`;
}
export function missionsDialog(progress: Progress, selected: number): string {
  return `${dialogHeader('KOWLOON CAMPAIGN', '九龍戰役')}<p class="dialog-intro">由彌敦道出發，逐關完成演習。勝出後會自動儲存進度並解鎖下一關。</p><div class="mission-grid">${MISSIONS.map((mission,i) => `<button class="mission-tile ${i === selected ? 'selected' : ''}" data-mission="${i}" ${i > progress.completed ? 'disabled' : ''}><span class="mission-number">0${mission.id}</span><div><small>${mission.area}</small><strong>${mission.name}</strong><p>${mission.enemies} 輛對手 · ${Math.floor(mission.timeLimit/60)} 分 ${mission.timeLimit%60} 秒</p></div><span class="mission-state">${i < progress.completed ? '已完成' : i > progress.completed ? '待解鎖' : '可出擊'}</span></button>`).join('')}</div><p class="fine-print">${MISSION_WORLD_NOTE}</p>`;
}
export function guideDialog(): string {
  return `${dialogHeader('FIELD MANUAL', '駕駛與射擊指南')}<div class="guide-columns"><section><h3>USB 飛行搖桿 / HOTAS</h3><ol><li>在 Windows 接上搖桿與油門，然後按一次搖桿按鍵，讓瀏覽器識別裝置。</li><li>在「搖桿設定」選擇轉向、油門及炮塔的來源。獨立油門可另選裝置。</li><li>把搖桿放回中央，按「校準中位」。移動油門後才會啟用驅動，避免一接上便向前衝。</li><li>移動軸並查看即時數值，調整軸編號、反向及死區。滑軌油門可按住倒車按鈕倒車。</li></ol><button class="btn btn-primary" data-action="controller">${icon('controller')} 開啟搖桿設定</button></section><section><h3>鍵盤與滑鼠</h3><dl class="key-guide"><dt>W / S</dt><dd>前進 / 倒車</dd><dt>A / D</dt><dd>車體轉向（可原地迴轉）</dd><dt>Q / E、← / →</dt><dd>炮塔左右轉動</dd><dt>↑ / ↓</dt><dd>主炮俯仰</dd><dt>滑鼠右鍵拖動</dt><dd>移動炮塔和主炮</dd><dt>SPACE / 左鍵</dt><dd>發射主炮</dd><dt>SHIFT</dt><dd>按住使用瞄準鏡</dd><dt>B</dt><dd>煞車</dd><dt>V</dt><dd>車外 / 駕駛員 / 炮手視角</dd><dt>ESC / H</dt><dd>暫停 / 搖桿設定</dd></dl></section></div><div class="training-tip">演習提示：停車開火較容易瞄準；炮塔可以獨立於車體旋轉。敵車側面及後方承受較高傷害，建築物會擋住炮彈。三種模式均提供無限備用彈藥，主炮每發仍需裝填。</div>`;
}
export function resultDialog(game: Game, victory: boolean, completed: number): string {
  const health = Math.max(0, game.player.hp / game.player.maxHp);
  const score = game.score;
  const stars = victory ? health > .7 ? 3 : health > .35 ? 2 : 1 : 0;
  return `${dialogHeader(victory ? 'OPERATION COMPLETE' : 'MISSION DEBRIEF', victory ? '任務完成' : '演習結束')}<div class="result-medal">${icon(victory ? 'shield' : 'tank', 56)}<span>${victory ? '演習區已清空' : game.player.alive ? '演習時間已結束' : '你的坦克已失去作戰能力'}</span><p class="result-stars">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</p></div><div class="result-stats"><div><small>擊破目標</small><strong>${game.kills} / ${game.totalEnemies}</strong></div><div><small>演習時間</small><strong>${Math.floor(game.elapsed)}<span> 秒</span></strong></div><div><small>演習得分</small><strong>${score.toLocaleString()}</strong></div></div><p class="dialog-intro">${victory && game.mode === 'campaign' ? completed === 6 ? '已完成全部六關九龍戰役。可以重玩關卡，或換一款戰車挑戰。' : '戰役進度已更新，下一個關卡已解鎖。' : '選擇其他戰車或調整策略，再次投入演習。'}</p><div class="dialog-buttons">${victory && game.mode === 'campaign' && (game.mission?.id ?? 6) < 6 ? '<button class="btn btn-primary" data-action="next">下一關 →</button>' : '<button class="btn btn-primary" data-action="retry">再次演習</button>'}<button class="btn" data-action="return">返回車庫</button></div>`;
}
export function aboutDialog(): string {
  return `${dialogHeader('VEHICLE INTELLIGENCE', '關於戰車與演習')}<p class="dialog-intro">${TANK_CATALOGUE_NOTE}</p><p class="dialog-intro">${MISSION_WORLD_NOTE}</p><p class="dialog-intro">本遊戲提供車體慣性、履帶轉向、炮塔獨立操控、裝填、簡化彈道及裝甲方向傷害。坦克採用四種程序化外形家族，並按車型調整顏色、炮管與尺寸。</p><h3>公開型號資料來源</h3><div class="source-links">${TANK_SOURCES.map(source => `<a href="${source.url}" target="_blank" rel="noreferrer">${source.title} ↗</a>`).join('')}</div>`;
}
