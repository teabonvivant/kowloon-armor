import type { MissionObjective } from '../objectives';

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
  readonly objective: MissionObjective;
}

export const MISSION_WORLD_NOTE = '場景取材自香港九龍街道，以虛構封閉演習區呈現；路網經遊戲化重組，並非按真實比例重建。';

export const MISSIONS: readonly MissionSpec[] = [
  {
    id: 1, name: '初次出勤', area: '油麻地 · 彌敦道',
    briefing: '沿彌敦道向前推進，練習停車瞄準，擊破兩輛演習對手。首關敵軍火力較低，先熟習搖桿和炮塔操作。',
    enemies: 2, timeLimit: 210, enemyDamage: 20, reward: 1200,
    spawn: [0, 100], targets: [[0, -50], [0, -140]],
    objective: { kind: 'clear' },
  },
  {
    id: 2, name: '路口封鎖', area: '佐敦 · 佐敦道',
    briefing: '前往佐敦道中央路口，在區內累積佔領 20 秒。敵車進區時佔領暫停；清場後仍須駛入指定區域。',
    enemies: 3, timeLimit: 225, enemyDamage: 24, reward: 1600,
    spawn: [0, 100], targets: [[0, -50], [84, 0], [-84, -84]],
    objective: { kind: 'capture', center: [0, 0], radius: 24, seconds: 20 },
  },
  {
    id: 3, name: '霓虹交鋒', area: '旺角 · 亞皆老街',
    briefing: '四輛對手進入旺角街區。留意兩側交叉路口，在裝填期間換位，避免被多個方向同時擊中。',
    enemies: 4, timeLimit: 240, enemyDamage: 29, reward: 2100,
    spawn: [0, 100], targets: [[0, -50], [84, -84], [-84, 0], [0, -140]],
    objective: { kind: 'clear' },
  },
  {
    id: 4, name: '海港防線', area: '尖沙咀 · 海防道',
    briefing: '守住海港集合區 45 秒。留在區內、阻止五輛對手闖入；敵車進區會持續扣防線耐久，降至零即告失守。',
    enemies: 5, timeLimit: 270, enemyDamage: 34, reward: 2700,
    spawn: [84, 100], targets: [[0, -50], [84, 0], [-84, 0], [84, -84], [-84, -84]],
    objective: { kind: 'defend', center: [84, 84], radius: 24, seconds: 45 },
  },
  {
    id: 5, name: '街區突圍', area: '深水埗 · 長沙灣道',
    briefing: '突破側街，前往深水埗西面路口，累積佔領 30 秒。六輛對手會分路攔截，善用裝填空檔轉移。',
    enemies: 6, timeLimit: 300, enemyDamage: 38, reward: 3400,
    spawn: [0, 100], targets: [[0, -50], [0, -140], [84, -84], [-84, -84], [84, 0], [-84, 0]],
    objective: { kind: 'capture', center: [-84, -84], radius: 24, seconds: 30 },
  },
  {
    id: 6, name: '九龍終極演習', area: '九龍 · 聯合演習區',
    briefing: '八輛對手分路進攻中央防線。留在區內守滿 60 秒；防線耐久降至零、車體損毀或超時均會失敗。',
    enemies: 8, timeLimit: 330, enemyDamage: 44, reward: 5000,
    spawn: [0, 20], targets: [[0, -50], [0, -140], [84, -84], [-84, -84], [84, 0], [-84, 0], [168, -84], [-168, -84]],
    objective: { kind: 'defend', center: [0, 0], radius: 24, seconds: 60 },
  },
] as const;
