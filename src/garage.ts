import { MISSIONS } from './data/missions';
import { TANKS } from './data/tanks';
import type { TankSpec } from './data/tanks';
import type { GameMode } from './game';
import { DIFFICULTIES } from './challenges';
import type { Difficulty } from './challenges';
import { icon, silhouette } from './ui-kit';

export const MODE_NAMES = { drive: '自由駕駛', battle: '模擬對戰', campaign: '九龍戰役', survival: '無盡防線' } as const;
const modeInfo = [
  { id: 'drive', icon: 'route', subtitle: '熟習操控 · 探索城市' },
  { id: 'battle', icon: 'target', subtitle: '即時出擊 · 4 輛 AI 對手' },
  { id: 'campaign', icon: 'shield', subtitle: '循序闖關 · 6 個作戰任務' },
  { id: 'survival', icon: 'tank', subtitle: '逐波迎敵 · 挑戰個人紀錄' },
] as const;
export function tankCard(tank: TankSpec, selected: string): string {
  return `<button class="tank-card ${tank.id === selected ? 'selected' : ''}" data-tank="${tank.id}" aria-pressed="${tank.id === selected}"><span class="tank-country">${tank.flag}<span>${tank.status}</span></span>${silhouette(tank.color, tank.family)}<strong>${tank.name}</strong><small>${tank.role}</small></button>`;
}
export function garageMarkup(tank: TankSpec, mode: GameMode, missionIndex: number, completed: number,
  difficulty: Difficulty = 'standard', bestScore = 0): string {
  const mission = MISSIONS[missionIndex];
  return `<div class="garage">
    <header class="topbar"><a class="brand" href="#" aria-label="九龍裝甲行動首頁"><span class="brand-mark">K<span>/</span>A</span><span>KOWLOON<br><b>ARMOR</b></span></a>
      <nav class="topnav" aria-label="主選單"><button class="nav-active" data-action="garage">車庫</button><button data-action="missions">戰役地圖 <small>0${Math.min(completed + 1, 6)} / 06</small></button><button data-action="guide">操作指南</button></nav>
      <div class="top-actions"><button class="device-status" data-action="controller">${icon('controller')}<span id="pad-status">HOTAS 控制設定</span><i></i></button><button class="icon-button" data-action="settings" aria-label="遊戲設定">${icon('settings')}</button></div>
    </header>
    <section class="operation-panel"><div class="eyebrow">九龍聯合演習區 · KOWLOON</div><h1>九龍<span>裝甲行動</span></h1><p class="tagline">穿過街巷，守住你的防線。</p>
      <div class="panel-label">選擇演習模式 <span>OPERATION</span></div>
      <div class="mode-list">${modeInfo.map(info => `<button class="mode-option ${mode === info.id ? 'active' : ''}" data-mode="${info.id}" aria-pressed="${mode === info.id}">${icon(info.icon, 24)}<span><strong>${MODE_NAMES[info.id]}</strong><small>${info.subtitle}</small></span>${icon('chevron', 15)}</button>`).join('')}</div>
      <div class="mission-summary"><span class="small-label">${mode === 'campaign' ? `任務 0${mission?.id ?? 1}` : mode === 'survival' ? '波間選擇修復或快裝補給' : '九龍城市演習區'}</span><strong>${mode === 'campaign' ? mission?.name : mode === 'battle' ? '街頭遭遇戰' : mode === 'survival' ? '守住街區，突破紀錄' : '城市巡航'}</strong><span>${mode === 'campaign' ? mission?.area : mode === 'survival' ? '2 輛起步 · 每波增加敵軍' : '彌敦道 · 佐敦 · 旺角'}</span>${mode === 'campaign' ? '<button data-action="missions" class="text-button">選擇關卡 →</button>' : ''}</div>
      ${mode !== 'drive' ? `<label class="difficulty-field">演習難度<select id="difficulty">${Object.entries(DIFFICULTIES).map(([value, level]) => `<option value="${value}" ${value === difficulty ? 'selected' : ''}>${level.name}${value === 'veteran' ? ' · 得分 ×1.5' : ''}</option>`).join('')}</select></label>` : '<p class="drive-note">沒有敵軍，自由練習駕駛與開炮。</p>'}
      <button class="deploy-button" data-action="start"><span><small>${mode === 'survival' ? 'ENDLESS DEFENCE' : mode === 'campaign' ? `MISSION 0${mission?.id ?? 1} · ${mission?.enemies} 輛對手` : 'READY TO DEPLOY'}</small>開始${mode === 'campaign' ? '任務' : mode === 'drive' ? '駕駛' : mode === 'survival' ? '挑戰' : '對戰'}</span>${icon('arrow', 28)}</button>
      <p class="local-note"><span class="live-dot"></span>離線單人演習 · 所有戰車免費使用</p>
    </section>
    <div class="scene-caption"><span>油麻地 · 彌敦道</span><small>虛構九龍城市演習區</small><span class="scene-weather">黃昏出勤 &nbsp; / &nbsp; ${mode === 'drive' ? '探索模式' : `${DIFFICULTIES[difficulty].name}難度`}</span></div>
    <div class="service-record"><span>${mode === 'drive' ? '鍵盤 · 滑鼠 · HOTAS' : '本模式個人最佳'}</span><strong>${mode === 'drive' ? '隨時出發' : bestScore ? bestScore.toLocaleString() : '等待首次出擊'}</strong><small>${mode === 'drive' ? 'V 切換三種視角' : `本機紀錄 · ${DIFFICULTIES[difficulty].name}難度`}</small></div>
    <aside class="vehicle-panel"><div class="eyebrow">${tank.country} <span class="country-chip">${tank.flag}</span></div><h2>${tank.name}</h2><div class="vehicle-tags">${tank.role} <span>·</span> ${tank.status}</div><p>${tank.description}</p>
      <div class="vehicle-stats">${[['主炮口徑',tank.gun,'mm',tank.gun/1.4],['正面防護',tank.armor,'',tank.armor],['最高速度',tank.speed,'km/h',tank.speed/0.8],['裝填時間',tank.reload,'s',100-tank.reload*9]].map(([label,value,unit,width]) => `<div class="stat-row"><div><span>${label}</span><b>${value}<small>${unit}</small></b></div><div class="stat-track"><i style="width:${width}%"></i></div></div>`).join('')}</div>
      <div class="vehicle-specs"><div><small>戰鬥全重</small><strong>${tank.weight} <span>t</span></strong></div><div><small>車體耐久</small><strong>${tank.hp}</strong></div></div>
      <button class="text-button" data-action="about">遊戲數值與型號資料 ${icon('chevron', 14)}</button>
    </aside>
    <div class="model-caption"><span class="model-line"></span><span>主戰坦克 <b>${tank.name}</b></span><button class="icon-button" data-action="rotate" aria-label="轉動戰車展示角度">${icon('camera')}</button></div>
    <section class="fleet"><div class="fleet-heading"><h3>戰車庫 <span>30</span></h3><div><span>全部已解鎖</span><button data-action="roster">搜尋／瀏覽全部 ${icon('arrow', 16)}</button></div></div><div class="fleet-track">${[tank, ...TANKS.filter(item => item.id !== tank.id)].slice(0, 9).map(item => tankCard(item, tank.id)).join('')}</div></section>
    <footer class="garage-footer"><span>九龍裝甲行動 <b>01.20</b></span><span>USB HOTAS / 鍵盤滑鼠 <i>·</i> WINDOWS</span><button data-action="fullscreen">${icon('fullscreen', 14)} 全螢幕</button></footer>
  </div>`;
}
