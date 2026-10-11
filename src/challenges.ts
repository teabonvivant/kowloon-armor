import { blocked } from './math';
import type { Obstacle } from './render/world';

export const DIFFICULTIES = {
  training: { name: '入門', health: .75, damage: .6, score: .75, description: '較低敵軍火力，熟習轉向與射擊' },
  standard: { name: '標準', health: 1, damage: 1, score: 1, description: '均衡演習，善用掩護與裝填空檔' },
  veteran: { name: '精英', health: 1.35, damage: 1.4, score: 1.5, description: '更強敵軍，得分倍率 ×1.5' },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export function waveSize(wave: number): number { return Math.min(8, Math.max(2, wave + 1)); }

export function encounterSpawns(seed: number, count: number, player: { readonly x: number; readonly z: number },
  obstacles: readonly Obstacle[]): [number, number][] {
  let state = seed >>> 0;
  const random = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const candidates: [number, number][] = [];
  for (const road of [-168, -84, 0, 84, 168]) for (const crossing of [-168, -126, -84, -42, 0, 42, 84, 126, 168]) {
    for (const [x, z] of [[road, crossing], [crossing, road]] as const) {
      if (Math.hypot(x - player.x, z - player.z) >= 70 && !blocked(x, z, obstacles)) candidates.push([x, z]);
    }
  }
  for (let index = candidates.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const point = candidates[index], replacement = candidates[other];
    if (point && replacement) { candidates[index] = replacement; candidates[other] = point; }
  }
  const selected: [number, number][] = [];
  for (const point of candidates) {
    if (selected.every(other => Math.hypot(other[0] - point[0], other[1] - point[1]) >= 12)) selected.push(point);
    if (selected.length >= count) break;
  }
  return selected;
}
