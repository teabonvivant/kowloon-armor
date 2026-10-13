import { MISSIONS } from './data/missions';
import { TANKS } from './data/tanks';
import type { TankSpec } from './data/tanks';
import type { GameMode } from './game';
import { DIFFICULTIES } from './challenges';
import type { Difficulty } from './challenges';
import { icon, silhouette } from './ui-kit';
import { operationBrief } from './briefing';

export const MODE_NAMES = { drive: '自由駕駛', battle: '模擬對戰', campaign: '九龍戰役', survival: '無盡防線' } as const;
const modeInfo = [
  { id: 'campaign', icon: 'shield', subtitle: '六關城市演習' },
  { id: 'battle', icon: 'target', subtitle: '四輛 AI 對手' },
  { id: 'survival', icon: 'tank', subtitle: '逐波守住防線' },
  { id: 'drive', icon: 'route', subtitle: '探索與基礎訓練' },
] as const;

export function tankCard(tank: TankSpec, selected: string): string {
  return `<button class="tank-card ${tank.id === selected ? 'selected' : ''}" data-tank="${tank.id}" aria-pressed="${tank.id === selected}" aria-label="${tank.name}，${tank.country}，${tank.role}"><span class="tank-country">${tank.flag}<span>${tank.status}</span></span>${silhouette(tank.color, tank.family)}<strong>${tank.name}</strong><small>${tank.role}</small>${tank.id === selected ? '<span class="selected-mark" aria-hidden="true">✓</span>' : ''}</button>`;
}

export function garageMarkup(tank: TankSpec, mode: GameMode, missionIndex: number, completed: number,
  difficulty: Difficulty = 'standard', bestScore = 0, trainingComplete = false): string {
  const mission = MISSIONS[missionIndex];
  const brief = operationBrief(mode, missionIndex);
  return `<div class="garage">
    <header class="topbar"><a class="brand" href="#" aria-label="九龍裝甲行動首頁"><span class="brand-mark">K<span>/</span>A</span><span>KOWLOON<br><b>ARMOR</b></span></a>
      <nav class="topnav" aria-label="主選單"><button class="nav-active" data-action="garage" aria-current="page">車庫</button><button data-action="missions">戰役 <small>${completed} / 6</small></button><button data-action="guide">操作指南</button><button data-action="records">戰績</button></nav>
      <div class="top-actions"><button class="device-status" data-action="controller" aria-label="HOTAS 控制設定">${icon('controller')}<span id="pad-status">HOTAS 控制設定</span></button><button class="icon-button" data-action="settings" aria-label="遊戲設定">${icon('settings')}</button></div>
    </header>
    <div class="garage-content">
      <section class="operation-panel" aria-label="演習模式"><div class="garage-title"><span class="eyebrow">九龍聯合演習區</span><h1>九龍裝甲行動</h1><p class="tagline">穿過街巷，守住你的防線。</p></div>
        <div class="panel-label">選擇演習模式</div>
        <div class="mode-list">${modeInfo.map(info => `<button class="mode-option ${mode === info.id ? 'active' : ''}" data-mode="${info.id}" aria-pressed="${mode === info.id}">${icon(info.icon)}<span><strong>${MODE_NAMES[info.id]}</strong><small>${info.subtitle}</small></span></button>`).join('')}</div>
        <div class="mission-summary"><span class="small-label">${mode === 'campaign' ? `任務 ${String(mission?.id ?? 1).padStart(2, '0')} / 06` : MODE_NAMES[mode]}</span><strong>${brief.objective}</strong><p>${brief.tip}</p><div class="brief-facts"><span>${icon('target', 14)}${brief.opposition}</span><span>${brief.duration}</span></div>
          <button data-action="briefing" class="text-button">查看完整簡報 ${icon('arrow', 16)}</button></div>
        <button class="training-link" data-action="training">${icon('route', 18)}<span>${trainingComplete ? '重溫基礎訓練' : '首次出勤？先練習操作'}<small>行駛 · 停車 · 轉炮塔 · 開炮</small></span>${icon('chevron', 16)}</button>
      </section>
      <section class="showroom" aria-label="已選戰車的 3D 展示"><div class="scene-caption"><span>${brief.area}</span><small>虛構九龍演習區 · 黃昏</small></div><div class="model-caption"><span>原創程序戰車模型</span><button class="icon-button" data-action="rotate" aria-label="轉動戰車展示角度">${icon('camera')}</button></div></section>
      <aside class="vehicle-panel" aria-label="戰車資料"><div class="eyebrow">${tank.country}<span class="country-chip">${tank.flag}</span></div><h2>${tank.name}</h2><div class="vehicle-tags">${tank.role}<span>／</span>${tank.status}</div><p>${tank.description}</p>
        <div class="vehicle-stats">${[['主炮口徑', tank.gun, 'mm', tank.gun / 1.4], ['正面防護', tank.armor, '', tank.armor], ['最高速度', tank.speed, 'km/h', tank.speed / .8], ['裝填時間', tank.reload, 's', 100 - tank.reload * 9]].map(([label, value, unit, width]) => `<div class="stat-row"><div><span>${label}</span><b>${value}<small>${unit}</small></b></div><div class="stat-track"><i style="width:${width}%"></i></div></div>`).join('')}</div>
        <div class="vehicle-specs"><div><small>戰鬥全重</small><strong>${tank.weight}<span> t</span></strong></div><div><small>車體耐久</small><strong>${tank.hp}</strong></div></div>
        <button class="text-button" data-action="about">遊戲數值與型號資料 ${icon('chevron', 14)}</button>
      </aside>
    </div>
    <section class="deployment-dock" aria-label="出擊準備"><div class="deployment-mission"><span>${mode === 'campaign' ? `九龍戰役 · ${String(mission?.id ?? 1).padStart(2, '0')}` : MODE_NAMES[mode]}</span><strong>${brief.title}</strong>${mode === 'campaign' ? '<button data-action="missions" class="text-button">更改關卡</button>' : ''}</div>
      <div class="deployment-record"><span>個人最佳</span><strong>${mode === 'drive' ? '自由探索' : bestScore ? `${bestScore.toLocaleString()} 分` : '等待首次出擊'}</strong><small>${mode === 'drive' ? '沒有敵軍' : DIFFICULTIES[difficulty].name + '難度'}</small></div>
      ${mode !== 'drive' ? `<label class="difficulty-field">演習難度<select id="difficulty">${Object.entries(DIFFICULTIES).map(([value, level]) => `<option value="${value}" ${value === difficulty ? 'selected' : ''}>${level.name}${value === 'veteran' ? ' · ×1.5 分' : ''}</option>`).join('')}</select></label>` : '<div class="drive-note">不限時 · 無限備用彈藥</div>'}
      <button class="deploy-button" data-action="start"><span>開始${mode === 'campaign' ? '任務' : mode === 'drive' ? '駕駛' : mode === 'survival' ? '挑戰' : '對戰'}<small>${tank.name}</small></span>${icon('arrow', 26)}</button>
    </section>
    <section class="fleet" aria-label="戰車選擇"><div class="fleet-heading"><h3>戰車庫 <span>30 款 · 全部可用</span></h3><div><button class="fleet-arrow" data-fleet="-1" aria-label="查看前面的戰車">←</button><button class="fleet-arrow" data-fleet="1" aria-label="查看後面的戰車">→</button><button data-action="roster">${icon('search', 16)} 搜尋戰車</button></div></div><div class="fleet-track">${TANKS.map(item => tankCard(item, tank.id)).join('')}</div></section>
    <footer class="garage-footer"><span>九龍街景 <b>v1.4</b></span><span>鍵盤 · 滑鼠 · HOTAS <i>／</i>本機戰績</span><button data-action="fullscreen">${icon('fullscreen', 14)} 全螢幕</button></footer>
  </div>`;
}
