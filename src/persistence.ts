import { z } from 'zod';
import type { Difficulty } from './challenges';
import type { GameMode } from './game';
const progressSchema = z.object({ completed: z.number().int().min(0).max(6).default(0),
  victories: z.number().int().min(0).default(0), bestScores: z.record(z.string(), z.number().min(0)).default({}) });
export type Progress = z.infer<typeof progressSchema>;
const initial: Progress = { completed: 0, victories: 0, bestScores: {} };
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem('kowloon-armor-progress');
    if (!raw) return { ...initial, bestScores: {} };
    const result = progressSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : { ...initial, bestScores: {} };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DOMException) return { ...initial, bestScores: {} };
    throw error;
  }
}
export function saveProgress(progress: Progress): boolean {
  try { localStorage.setItem('kowloon-armor-progress', JSON.stringify(progress)); return true; }
  catch (error) { if (error instanceof DOMException) return false; throw error; }
}
export function recordResult(progress: Progress, result: { mode: GameMode; missionId: number; difficulty: Difficulty;
  victory: boolean; score: number; wave: number }): Progress {
  const next = { ...progress, bestScores: { ...progress.bestScores } };
  if (result.victory) {
    next.victories++;
    if (result.mode === 'campaign') {
      next.completed = Math.max(next.completed, result.missionId);
      const legacyKey = String(result.missionId);
      next.bestScores[legacyKey] = Math.max(next.bestScores[legacyKey] ?? 0, result.score);
    }
  }
  if (result.victory || result.mode === 'survival') {
    const key = `${result.mode}:${result.mode === 'campaign' ? result.missionId : 0}:${result.difficulty}`;
    next.bestScores[key] = Math.max(next.bestScores[key] ?? 0, result.score);
  }
  if (result.mode === 'survival') {
    const key = `wave:${result.difficulty}`;
    next.bestScores[key] = Math.max(next.bestScores[key] ?? 0, result.wave);
  }
  return next;
}
