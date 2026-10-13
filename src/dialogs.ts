import { DIFFICULTIES } from './challenges';
import { MISSIONS, MISSION_WORLD_NOTE } from './data/missions';
import { TANK_CATALOGUE_NOTE, TANK_SOURCES } from './data/tanks';
import type { Game } from './game';
import type { Progress } from './persistence';
import { icon } from './ui-kit';
import { DEFAULT_BINDINGS, keyLabel } from './key-bindings';
import type { KeyBindings } from './key-bindings';
import { briefingMap, operationBrief } from './briefing';
import type { GameMode } from './game';
import type { Difficulty } from './challenges';
import type { TankSpec } from './data/tanks';
import { challengeStatus, coaching } from './operations';

export function dialogHeader(eyebrow: string, title: string): string {
  return `<div class="dialog-header"><div><span class="eyebrow">${eyebrow}</span><h2 id="modal-title">${title}</h2></div><button class="icon-button" data-action="close" aria-label="關閉視窗">${icon('close')}</button></div>`;
}
export function missionsDialog(progress: Progress, selected: number): string {
  return `${dialogHeader('KOWLOON CAMPAIGN', '九龍戰役')}
    <p class="dialog-intro">由彌敦道出發，逐關完成演習。勝出後自動儲存進度並解鎖下一關。</p>
    <div class="mission-grid">${MISSIONS.map((mission, index) => `<button class="mission-tile ${index === selected ? 'selected' : ''}" data-mission="${index}" ${index > progress.completed ? 'disabled' : ''}>
      <span class="mission-number">0${mission.id}</span><div><small>${mission.area}</small><strong>${mission.name}</strong>
      <p>${mission.objective.kind === 'clear' ? '清場' : mission.objective.kind === 'capture' ? `佔點 ${mission.objective.seconds} 秒` : `守區 ${mission.objective.seconds} 秒`} · ${mission.enemies} 輛對手</p>
      ${progress.bestScores[String(mission.id)] ? `<p>最佳 ${progress.bestScores[String(mission.id)]?.toLocaleString()} 分</p>` : ''}</div>
      <span class="mission-state">${index < progress.completed ? '已完成' : index > progress.completed ? '待解鎖' : '可出擊'}</span></button>`).join('')}</div>
    <p class="fine-print">${MISSION_WORLD_NOTE}</p>`;
}
export function briefingDialog(mode: GameMode, missionIndex: number, difficulty: Difficulty, tank: TankSpec): string {
  const brief = operationBrief(mode, missionIndex);
  return `${dialogHeader('OPERATION BRIEFING', brief.title)}
    <div class="briefing-layout"><div>${briefingMap(mode, missionIndex)}<p class="map-legend">▲ 出發點　◇ 敵車　○ 任務區域<br>${mode === 'campaign' ? '標示為初始位置，敵車會移動。' : '對戰敵軍於出擊時配置。'}路網為遊戲化演習區。</p></div>
      <div class="briefing-copy"><span class="small-label">${brief.area}</span><h3>${brief.objective}</h3><div class="brief-facts"><span>${brief.opposition}</span><span>${brief.duration}</span></div><p>${brief.detail}</p><div class="training-tip"><strong>出擊提示</strong><br>${brief.tip}</div></div></div>
    <p class="fine-print">已選戰車：${tank.name}${mode !== 'drive' ? ` · ${DIFFICULTIES[difficulty].name}難度 · ${DIFFICULTIES[difficulty].description}` : ''}</p>
    <div class="dialog-buttons"><button class="btn btn-primary" data-action="start">開始${mode === 'drive' ? '駕駛' : mode === 'campaign' ? '任務' : mode === 'survival' ? '挑戰' : '對戰'} ${icon('arrow', 18)}</button><button class="btn" data-action="close">返回整備</button></div>`;
}
export function guideDialog(bindings: KeyBindings = DEFAULT_BINDINGS, allowTraining = true): string {
  return `${dialogHeader('FIELD MANUAL', '駕駛與射擊指南')}
    ${allowTraining ? '<div class="training-tip"><strong>第一次駕駛？</strong><p>在沒有敵軍的街道，跟隨四步提示實際練習行駛、停車、炮塔瞄準及射擊。</p><div class="dialog-buttons"><button class="btn btn-primary" data-action="training">開始基礎訓練</button></div></div>' : ''}
    <div class="guide-columns"><section><h3>USB 飛行搖桿 / HOTAS</h3>
    <ol><li>在 Windows 接上搖桿與油門，按一次每個裝置的按鈕，讓瀏覽器識別。</li>
    <li>在「搖桿設定」選擇轉向、油門及炮塔的來源。獨立油門可另選裝置。</li>
    <li>把搖桿放回中央，滑動油門收至零，按「校準中立位置」。返回遊戲後，收油再推前才會啟用驅動。</li>
    <li>移動軸並查看即時數值，調整軸編號、反向及死區。滑動油門可按住倒車按鈕倒車。</li></ol>
    <button class="btn btn-primary" data-action="controller">${icon('controller')} 開啟搖桿設定</button></section>
    <section><h3>鍵盤與滑鼠</h3><dl class="key-guide">
    <dt>${keyLabel(bindings.forward)} / ${keyLabel(bindings.reverse)}</dt><dd>前進 / 倒車</dd><dt>${keyLabel(bindings.left)} / ${keyLabel(bindings.right)}</dt><dd>車體轉向（可原地迴轉）</dd>
    <dt>${keyLabel(bindings.turretLeft)} / ${keyLabel(bindings.turretRight)}</dt><dd>炮塔左右轉動</dd><dt>${keyLabel(bindings.elevate)} / ${keyLabel(bindings.lower)}</dt><dd>主炮俯仰</dd>
    <dt>滑鼠右鍵拖動</dt><dd>移動炮塔和主炮</dd><dt>${keyLabel(bindings.pointer)}</dt><dd>鎖定滑鼠瞄準；Esc 釋放及暫停</dd>
    <dt>${keyLabel(bindings.recentre)}</dt><dd>炮塔回正至車頭，炮管水平</dd><dt>${keyLabel(bindings.fire)} / 左鍵</dt><dd>發射主炮</dd>
    <dt>${keyLabel(bindings.scope)}</dt><dd>瞄準鏡（按住或切換可在設定選擇）</dd><dt>${keyLabel(bindings.brake)}</dt><dd>煞車</dd>
    <dt>${keyLabel(bindings.observe)}</dt><dd>按住獨立觀察，炮塔保持方向</dd><dt>${keyLabel(bindings.camera)}</dt><dd>車外 / 駕駛員 / 炮手視角</dd><dt>ESC / ${keyLabel(bindings.controls)}</dt><dd>暫停 / 搖桿設定</dd></dl><button class="btn" data-action="keyboard">更改鍵盤按鍵</button></section></div>
    <div class="training-tip"><strong>裝填時換位，側擊更有效。</strong><br>敵車側面及後方承受較高傷害；建築物會擋住炮彈。瞄準鏡可降低炮塔轉速，方便細調。備用彈藥無限，但每發仍需裝填。準星顯示炮塔方向，遠距離射擊仍須留意俯仰。</div>
    <div class="training-tip"><strong>履帶與任務</strong><br>命中履帶可減慢敵車；自己的履帶受損時，停車累計 6 秒便會修復。佔點須在標示區域內且沒有敵車；守區時敵車闖入會扣防線耐久，降至零即告失敗。</div>
    <div class="training-tip"><strong>無盡防線</strong><br>首波兩輛敵車，逐波增加至最多八輛。清場後有 8 秒選擇修復 35% 車體及兩側履帶，或四發裝填時間減少 32% 的快裝補給。倒數完畢才套用，預設修復。</div>`;
}
export function resultDialog(game: Game, victory: boolean, completed: number, newBest = false, previousBest = 0, saved = true): string {
  const health = Math.max(0, game.player.hp / game.player.maxHp);
  const stars = victory ? health > .7 ? 3 : health > .35 ? 2 : 1 : 0;
  const survival = game.mode === 'survival';
  const accuracy = game.shots ? Math.round(game.hits / game.shots * 100) : 0;
  const challenge = challengeStatus(game);
  const brief = operationBrief(game.mode, (game.mission?.id ?? 1) - 1);
  const objective = game.mode === 'campaign' ? game.mission?.objective : undefined;
  const advice = victory ? game.mode === 'campaign' ? completed === 6 ? '六關演習已完成。可改用其他戰車，或提高難度再挑戰。' : '下一關已解鎖。先查看任務條件，再決定出擊。' : '完成清場。可更換戰車或難度，練習不同戰術。'
    : game.objective.integrity <= 0 ? '敵車闖入會持續扣防線。優先攔截進區敵車，並留在指定圈內。'
    : !game.player.alive ? '裝填期間退回建築掩護，避免同時暴露於多個方向的火力。履帶受損時停穩修復。'
    : '留意左上剩餘時間。佔點及守區要駛入金圈，清場不能代替到場。';
  return `${dialogHeader(victory ? 'OPERATION COMPLETE' : 'MISSION DEBRIEF', victory ? '任務完成' : survival ? '防線演習結束' : '演習結束')}
    <div class="result-medal">${icon(victory ? 'shield' : 'tank', 48)}<span>${victory ? game.mode === 'campaign' && game.mission?.objective.kind !== 'clear' ? '指定區域目標已完成' : '演習區已清空' : !game.player.alive ? '你的坦克已失去作戰能力' : game.objective.integrity <= 0 ? '敵車突破防線' : '演習時間已結束'}</span>
    ${survival ? `<p class="result-wave">守至第 ${game.wave} 波</p>` : `<p class="result-stars" aria-label="${stars} 星">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>`}
    ${newBest ? '<b class="record-badge">個人新紀錄</b>' : ''}</div>
    <div class="result-stats"><div><small>擊破目標</small><strong>${game.kills} / ${game.totalEnemies}</strong></div>
    <div><small>演習時間</small><strong>${Math.floor(game.elapsed)}<span> 秒</span></strong></div>
    <div><small>${DIFFICULTIES[game.difficulty].name}難度得分</small><strong>${game.score.toLocaleString()}</strong></div></div>
    <div class="debrief-line"><span>命中率 <b>${accuracy}%</b>（${game.hits} / ${game.shots} 發）</span><span>剩餘耐久 <b>${Math.round(health * 100)}%</b></span><span>得分倍率 <b>×${DIFFICULTIES[game.difficulty].score}</b></span></div>
    <div class="debrief-line"><span>有效傷害 <b>${game.report.dealt}</b></span><span>承受傷害 <b>${game.report.received}</b></span><span>側後命中 <b>${game.report.flankingHits}</b> 次</span><span>行駛 <b>${Math.round(game.report.distance)}</b> m</span></div>
    <div class="debrief-objective">${brief.objective}<small>${objective && objective.kind !== 'clear' ? `控制時間 ${Math.floor(game.objective.progress)} / ${objective.seconds} 秒${objective.kind === 'defend' ? ` · 防線 ${Math.ceil(game.objective.integrity)}%` : ''}` : `擊破 ${game.kills} 輛 · ${brief.area}`}</small></div>
    <p class="dialog-intro">${advice}</p>
    ${game.challenge !== 'none' ? `<section class="challenge-result"><h3>${challenge.complete ? '✓ 挑戰達成' : '挑戰未達成'} · ${challenge.title}</h3><p>${challenge.progress}</p></section>` : ''}
    <p class="training-tip"><strong>下一次練習</strong><br>${coaching(game)}</p>
    <div class="dialog-buttons"><button class="btn" data-action="replay">相同配置重賽</button><button class="btn" data-action="export-report">匯出本回合戰報</button></div>
    <p class="fine-print">${previousBest ? `上次最佳 ${previousBest.toLocaleString()} 分${victory || survival ? ` · 本次 ${game.score >= previousBest ? '+' : '−'}${Math.abs(game.score - previousBest).toLocaleString()} 分` : ' · 本回合未完成，不列入最高分'}` : victory || survival ? '首次完成紀錄。' : '完成演習後才會記錄最高分。'} ${saved ? '戰績已儲存於目前瀏覽器。' : '尚未成功儲存，請在離開前匯出備份。'}</p>
    <div class="dialog-buttons">${victory && game.mode === 'campaign' && (game.mission?.id ?? 6) < 6 ? '<button class="btn btn-primary" data-action="next">下一關 →</button>' : '<button class="btn btn-primary" data-action="retry">再次演習</button>'}<button class="btn" data-action="return">返回車庫</button><button class="btn" data-action="records">查看／備份戰績</button></div>`;
}
export function aboutDialog(): string {
  return `${dialogHeader('VEHICLE INTELLIGENCE', '關於戰車與演習')}<p class="dialog-intro">${TANK_CATALOGUE_NOTE}</p><p class="dialog-intro">${MISSION_WORLD_NOTE}</p>
    <p class="dialog-intro">車體慣性、履帶轉向、炮塔獨立操控、裝填及方向裝甲傷害均採簡化模擬。坦克以四種程序化外形家族製作，配合車型顏色、尺寸、原創塗裝及配件；並非逐款精密重建。</p>
    <h3>公開型號資料來源</h3><div class="source-links">${TANK_SOURCES.map(source => `<a href="${source.url}" target="_blank" rel="noreferrer">${source.title} ↗</a>`).join('')}</div>`;
}
