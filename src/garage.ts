import { MISSIONS } from './data/missions';
import { TANKS } from './data/tanks';
import type { TankSpec } from './data/tanks';
import type { GameMode } from './game';
import { icon, silhouette } from './ui-kit';

export const MODE_NAMES = { drive: '自由駕駛', battle: '模擬對戰', campaign: '九龍戰役' } as const;
const modeInfo = [
  { id: 'drive', icon: 'route', subtitle: '熟習操控 · 探索城市' },
  { id: 'battle', icon: 'target', subtitle: '即時出擊 · 4 輛 AI 對手' },
  { id: 'campaign', icon: 'shield', subtitle: '循序闖關 · 6 個作戰任務' },
] as const;
export function tankCard(tank: TankSpec, selected: string): string {
  return `<button class="tank-card ${tank.id === selected ? 'selected' : ''}" data-tank="${tank.id}" aria-pressed="${tank.id === selected}"><span class="tank-country">${tank.flag}<span>${tank.status}</span></span>${silhouette(tank.color, tank.family)}<strong>${tank.name}</strong><small>${tank.role}</small></button>`;
}
export function garageMarkup(tank: TankSpec, mode: GameMode, missionIndex: number, completed: number): string {
  const mission = MISSIONS[missionIndex];
  return `<div class="garage">
    <header class="topbar"><a class="brand" href="#" aria-label="九龍裝甲行動首頁"><span class="brand-mark">K<span>/</span>A</span><span>KOWLOON<br><b>ARMOR</b></span></a>
      <nav class="topnav" aria-label="主選單"><button class="nav-active" data-action="garage">車庫</button><button data-action="missions">戰役地圖 <small>0${Math.min(completed + 1, 6)} / 06</small></button><button data-action="guide">操作指南</button></nav>
      <div class="top-actions"><button class="device-status" data-action="controller">${icon('controller')}<span id="pad-status">HOTAS 控制設定</span><i></i></button><button class="icon-button" data-action="settings" aria-label="遊戲設定">${icon('settings')}</button></div>
    </header>
    <section class="operation-panel"><div class="eyebrow"><span class="accent-line"></span> HONG KONG · KOWLOON</div><h1>九龍<span>裝甲行動</span></h1><p class="tagline">鋼鐵之軀。寸土必爭。</p>
      <div class="panel-label">選擇演習模式 <span>OPERATION</span></div>
      <div class="mode-list">${modeInfo.map(info => `<button class="mode-option ${mode === info.id ? 'active' : ''}" data-mode="${info.id}" aria-pressed="${mode === info.id}">${icon(info.icon, 24)}<span><strong>${MODE_NAMES[info.id]}</strong><small>${info.subtitle}</small></span>${icon('chevron', 15)}</button>`).join('')}</div>
      <div class="mission-summary"><span class="small-label">${mode === 'campaign' ? `任務 0${mission?.id ?? 1}` : '九龍城市演習區'}</span><strong>${mode === 'campaign' ? mission?.name : mode === 'battle' ? '街頭遭遇戰' : '城市巡航'}</strong><span>${mode === 'campaign' ? mission?.area : '彌敦道 · 佐敦 · 旺角'}</span>${mode === 'campaign' ? '<button data-action="missions" class="text-button">選擇關卡 →</button>' : ''}</div>
      <button class="deploy-button" data-action="start"><span><small>READY TO DEPLOY</small>開始${mode === 'campaign' ? '任務' : mode === 'drive' ? '駕駛' : '對戰'}</span>${icon('arrow', 28)}</button>
      <p class="local-note"><span class="live-dot"></span>離線單人演習 · 所有戰車免費使用</p>
    </section>
    <div class="scene-caption"><span>九龍 · 油麻地</span><small>22°18′ N &nbsp; 114°10′ E</small><span class="scene-weather">17:42 &nbsp; / &nbsp; 黃昏演習</span></div>
    <aside class="vehicle-panel"><div class="eyebrow">${tank.country} <span class="country-chip">${tank.flag}</span></div><h2>${tank.name}</h2><div class="vehicle-tags">${tank.role} <span>·</span> ${tank.status}</div><p>${tank.description}</p>
      <div class="vehicle-stats">${[['主炮口徑',tank.gun,'mm',tank.gun/1.4],['正面防護',tank.armor,'',tank.armor],['最高速度',tank.speed,'km/h',tank.speed/0.8],['裝填時間',tank.reload,'s',100-tank.reload*9]].map(([label,value,unit,width]) => `<div class="stat-row"><div><span>${label}</span><b>${value}<small>${unit}</small></b></div><div class="stat-track"><i style="width:${width}%"></i></div></div>`).join('')}</div>
      <div class="vehicle-specs"><div><small>戰鬥全重</small><strong>${tank.weight} <span>t</span></strong></div><div><small>車體耐久</small><strong>${tank.hp}</strong></div></div>
      <button class="text-button" data-action="about">遊戲數值與型號資料 ${icon('chevron', 14)}</button>
    </aside>
    <div class="model-caption"><span class="model-line"></span><span>主戰坦克 <b>${tank.name}</b></span><button class="icon-button" data-action="rotate" aria-label="轉動戰車展示角度">${icon('camera')}</button></div>
    <section class="fleet"><div class="fleet-heading"><h3>戰車庫 <span>30</span></h3><div><span>全部已解鎖</span><button data-action="roster">瀏覽全部戰車 ${icon('arrow', 16)}</button></div></div><div class="fleet-track">${TANKS.slice(0, 9).map(item => tankCard(item, tank.id)).join('')}</div></section>
    <footer class="garage-footer"><span>九龍裝甲行動 <b>01.00</b></span><span>USB HOTAS / 鍵盤滑鼠 <i>·</i> WINDOWS</span><button data-action="fullscreen">${icon('fullscreen', 14)} 全螢幕</button></footer>
  </div>`;
}
