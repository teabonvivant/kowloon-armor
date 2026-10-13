import { MISSIONS } from './data/missions';
import type { GameMode } from './game';
import { LANDMARKS } from './render/hong-kong';

export function operationBrief(mode: GameMode, missionIndex: number): { title: string; area: string; objective: string; detail: string; duration: string; opposition: string; tip: string } {
  const mission = MISSIONS[missionIndex] ?? MISSIONS[0]!;
  if (mode === 'campaign') return {
    title: mission.name, area: mission.area,
    objective: mission.objective.kind === 'clear' ? `擊破全部 ${mission.enemies} 輛敵車`
      : `${mission.objective.kind === 'capture' ? '佔領路口' : '守住區域'} ${mission.objective.seconds} 秒`,
    detail: mission.briefing, duration: `${Math.floor(mission.timeLimit / 60)} 分 ${mission.timeLimit % 60} 秒`,
    opposition: `${mission.enemies} 輛敵車`,
    tip: mission.objective.kind === 'clear' ? '停車細調瞄準，裝填時退回掩護。'
      : mission.objective.kind === 'capture' ? '清場後仍須駛入金色圈內，無敵車爭奪才會計時。' : '留在圈內守區；敵車闖入會扣防線，降至零即告失守。',
  };
  if (mode === 'battle') return { title: '街頭遭遇戰', area: '九龍 · 城市演習區', objective: '擊破全部 4 輛敵車',
    detail: '每次出擊重新配置四輛對手。沿街口觀察敵情，利用建築物擋住炮彈，在裝填時換位。', duration: '不限時', opposition: '4 輛敵車', tip: '敵車可能繞側；留意小地圖和受擊方向。' };
  if (mode === 'survival') return { title: '無盡防線', area: '九龍 · 防線演習區', objective: '逐波迎敵，挑戰最高紀錄',
    detail: '首波兩輛敵車，每波增加一輛，最多八輛。敵軍火力逐步提升；清場後有八秒選擇修復或四發快裝補給。', duration: '守至車體損毀', opposition: '每波 2–8 輛', tip: '整備倒數結束才套用補給；沒有選擇時預設修復。' };
  return { title: '城市巡航', area: '油麻地 · 彌敦道', objective: '沒有敵軍，自由練習',
    detail: '沿地圖金色地標巡遊鐘樓、油麻地舊警署、廟街、旺角市集、深水埗唐樓及西九 ICC。備用彈藥無限；街廓按遊戲比例重組。', duration: '不限時', opposition: '沒有敵軍', tip: '旺角、深水埗中央小巷可駛入；鐘樓與廟街為架高街廓，沿外圍道路觀賞。' };
}

export function briefingMap(mode: GameMode, missionIndex: number): string {
  const mission = MISSIONS[missionIndex] ?? MISSIONS[0]!;
  const point = (value: number): number => 150 + value * .65;
  const spawn = mode === 'campaign' ? mission.spawn : [0, 100];
  const goal = mode === 'campaign' ? mission.objective : undefined;
  return `<svg class="briefing-map" viewBox="0 0 300 300" role="img" aria-label="演習區簡圖，三角是出發點，菱形是敵車初始位置，金圈是任務區域">
    <rect width="300" height="300" fill="#111b1e"/>
    <g stroke="#3c4c4f" stroke-width="13">${[-168, -84, 0, 84, 168].map(road => `<path d="M${point(road)} 12V288M12 ${point(road)}H288"/>`).join('')}</g>
    <g fill="#aebbb7" font-size="12" font-family="sans-serif"><text x="16" y="29">深水埗</text><text x="213" y="29">旺角</text><text x="215" y="270">油麻地</text><text x="17" y="216">佐敦</text><text x="265" y="57">N ↑</text></g>
    <g fill="#e8c58e" font-family="sans-serif" font-size="9">${LANDMARKS.map(landmark => `<circle cx="${point(landmark.x)}" cy="${point(landmark.z)}" r="3"/><text text-anchor="middle" x="${Math.max(34, point(landmark.x))}" y="${point(landmark.z) - 7}">${landmark.name}</text>`).join('')}</g>
    ${mode === 'campaign' ? mission.targets.map(([horizontal, vertical]) => `<rect x="${point(horizontal) - 4}" y="${point(vertical) - 4}" width="8" height="8" fill="#ff8b7d" transform="rotate(45 ${point(horizontal)} ${point(vertical)})"/>`).join('') : ''}
    ${goal && goal.kind !== 'clear' ? `<circle cx="${point(goal.center[0])}" cy="${point(goal.center[1])}" r="${goal.radius * .65}" fill="#e8a65a22" stroke="#e8a65a" stroke-width="2"/>` : ''}
    <path d="M0 -9 7 7 0 3 -7 7Z" fill="#b7e8d8" transform="translate(${point(spawn[0] ?? 0)} ${point(spawn[1] ?? 100)})"/>
  </svg>`;
}
