export interface MissionSpec {
  readonly id: number;
  readonly name: string;
  readonly area: string;
  readonly briefing: string;
  readonly enemies: number;
  readonly timeLimit: number;
  readonly enemyDamage: number;
  readonly reward: number;
  readonly spawn: readonly [number, number];
  readonly targets: readonly (readonly [number, number])[];
}

export const MISSION_WORLD_NOTE = '場景取材自香港九龍街道，以虛構封閉演習區呈現；路網經遊戲化重組，並非按真實比例重建。';

export const MISSIONS: readonly MissionSpec[] = [
  {
    id: 1, name: '初次出勤', area: '油麻地 · 彌敦道',
    briefing: '沿彌敦道向前推進，練習停車瞄準，擊破兩輛演習對手。首關敵軍火力較低，先熟習搖桿和炮塔操作。',
    enemies: 2, timeLimit: 210, enemyDamage: 20, reward: 1200,
    spawn: [0, 100], targets: [[0, -50], [0, -140]],
  },
  {
    id: 2, name: '路口封鎖', area: '佐敦 · 佐敦道',
    briefing: '三輛對手分守主路及側街。利用路口轉向，移動炮塔搜索目標，清出演習通道。',
    enemies: 3, timeLimit: 225, enemyDamage: 24, reward: 1600,
    spawn: [0, 100], targets: [[0, -50], [84, 0], [-84, -84]],
  },
  {
    id: 3, name: '霓虹交鋒', area: '旺角 · 亞皆老街',
    briefing: '四輛對手進入旺角街區。留意兩側交叉路口，在裝填期間換位，避免被多個方向同時擊中。',
    enemies: 4, timeLimit: 240, enemyDamage: 29, reward: 2100,
    spawn: [0, 100], targets: [[0, -50], [84, -84], [-84, 0], [0, -140]],
  },
  {
    id: 4, name: '海港防線', area: '尖沙咀 · 海防道',
    briefing: '五輛對手控制海港方向的通道。利用建築掩護逐一接近，清除主路和兩側街道的目標。',
    enemies: 5, timeLimit: 270, enemyDamage: 34, reward: 2700,
    spawn: [0, 100], targets: [[0, -50], [84, 0], [-84, 0], [84, -84], [-84, -84]],
  },
  {
    id: 5, name: '街區突圍', area: '深水埗 · 長沙灣道',
    briefing: '六輛對手分散在街區內。把握倒車和轉向時機，保存車體耐久，逐一突破各個路口。',
    enemies: 6, timeLimit: 300, enemyDamage: 38, reward: 3400,
    spawn: [0, 100], targets: [[0, -50], [0, -140], [84, -84], [-84, -84], [84, 0], [-84, 0]],
  },
  {
    id: 6, name: '九龍終極演習', area: '九龍 · 聯合演習區',
    briefing: '八輛對手在整個街區展開最後演習。利用小地圖規劃路線、控制裝填節奏，在限時內完成全區清場。',
    enemies: 8, timeLimit: 330, enemyDamage: 44, reward: 5000,
    spawn: [0, 100], targets: [[0, -50], [0, -140], [84, -84], [-84, -84], [84, 0], [-84, 0], [168, -84], [-168, -84]],
  },
] as const;
