import type { Actor } from './actors';
import type { Game } from './game';

export function parseSeed(value: string): number | null | undefined {
  const clean = value.trim();
  if (!clean) return undefined;
  if (!/^\d{1,10}$/.test(clean)) return null;
  const seed = Number(clean);
  return seed <= 0xffffffff ? seed : null;
}

export function ballisticEstimate(distance: number, player: Actor, target: Actor): { seconds: number; drop: number; lead: number } {
  const seconds = Math.max(0, distance - 5.5) / 190;
  const lateral = -Math.sin(target.yaw) * target.speed * Math.cos(player.aim) + Math.cos(target.yaw) * target.speed * Math.sin(player.aim);
  return { seconds, drop: .6 * seconds * seconds, lead: lateral * seconds };
}

export const CHALLENGES = { none: '不設額外挑戰', precision: '精準射手 · 至少 6 發、命中率 ≥70%', mobile: '機動突擊 · 行駛 800 m、擊破 2 車', armor: '保甲行動 · 勝利時保留 ≥70% 耐久' } as const;
export function challengeStatus(game: Game): { title: string; progress: string; complete: boolean } {
  const accuracy = game.shots ? game.hits / game.shots : 0;
  const health = Math.max(0, game.player.hp / game.player.maxHp);
  let complete = false, progress = '整備工具可選擇一項，不改變戰役得分';
  if (game.challenge === 'precision') { complete = game.shots >= 6 && accuracy >= .7; progress = `${game.shots} / 6 發 · 命中 ${Math.round(accuracy * 100)}% / 70%`; }
  if (game.challenge === 'mobile') { complete = game.report.distance >= 800 && game.kills >= 2; progress = `${Math.floor(game.report.distance)} / 800 m · ${game.kills} / 2 車`; }
  if (game.challenge === 'armor') { complete = game.phase === 'victory' && health >= .7; progress = `耐久 ${Math.round(health * 100)}% / 70% · 須勝利`; }
  return { title: CHALLENGES[game.challenge], progress, complete: complete && game.mode !== 'drive' &&
    (game.phase !== 'defeat' || game.mode === 'survival' && game.challenge !== 'armor') };
}

export function coaching(game: Game): string {
  if (game.shots < 3) return '下次先在安全街口練習：主炮就緒後開炮，再退回掩體裝填。';
  if (game.hits / game.shots < .5) return '下次先停車再開炮，對移動目標參考提前量；射線估算不包含完整彈道。';
  if (game.report.received > game.player.maxHp * .6) return '下次裝填時倒車退回建築掩護，減少暴露時間。';
  if (game.report.flankingHits === 0) return '下次沿平行街道換位，嘗試在敵車側面或後方取得一次命中。';
  return '已兼顧命中與走位。可用相同配置重賽，比較承傷及完成時間。';
}

export function operationReport(game: Game) {
  return { format: 'kowloon-armor-battle-report', version: '1.6', createdAt: new Date().toISOString(),
    mode: game.mode, mission: game.mission?.id, difficulty: game.difficulty, tank: game.player.spec.id,
    seed: game.seed, phase: game.phase, seconds: game.elapsed, score: game.score,
    shots: game.shots, hits: game.hits, kills: game.kills, wave: game.wave,
    statistics: { ...game.report }, challenge: { id: game.challenge, ...challengeStatus(game) },
    events: game.journal.map(entry => ({ ...entry })), advice: coaching(game) };
}

export class FrameDiagnostics {
  private readonly samples: number[] = [];
  private cursor = 0;
  sample(seconds: number, playing: boolean): void {
    if (!playing || !Number.isFinite(seconds) || seconds <= 0) return;
    this.samples[this.cursor] = seconds * 1000; this.cursor = (this.cursor + 1) % 120;
  }
  summary(): { count: number; median: number; p95: number } {
    const sorted = [...this.samples].sort((first, second) => first - second);
    const median = ((sorted[Math.floor((sorted.length - 1) / 2)] ?? 0) + (sorted[Math.floor(sorted.length / 2)] ?? 0)) / 2;
    return { count: sorted.length, median, p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0 };
  }
}
