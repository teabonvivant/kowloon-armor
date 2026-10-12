import { z } from 'zod';
import type { Difficulty } from './challenges';
import type { GameMode } from './game';
const scoreKey = z.string().regex(/^(?:[1-6]|campaign:[1-6]:(?:training|standard|veteran)|(?:battle|survival):0:(?:training|standard|veteran)|wave:(?:training|standard|veteran))$/);
const progressSchema = z.object({ completed: z.number().int().min(0).max(6).default(0),
  victories: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  bestScores: z.record(scoreKey, z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER)).default({}),
  trainingComplete: z.boolean().optional() });
export type Progress = z.infer<typeof progressSchema>;
const initial: Progress = { completed: 0, victories: 0, bestScores: {} };
export const PROGRESS_KEY = 'kowloon-armor-progress';
const RECOVERY_KEY = `${PROGRESS_KEY}-recovery`;
export const BACKUP_LIMIT = 65536;
export type ProgressStatus = 'ready' | 'empty' | 'recovered' | 'invalid' | 'unavailable';
function parseStored(raw: string | null): Progress | null {
  if (!raw) return null;
  try { const parsed = progressSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
export function readProgress(): { progress: Progress; status: ProgressStatus } {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY), progress = parseStored(raw);
    if (progress) return { progress, status: 'ready' };
    const recovery = parseStored(localStorage.getItem(RECOVERY_KEY));
    return recovery ? { progress: recovery, status: 'recovered' }
      : { progress: { ...initial, bestScores: {} }, status: raw ? 'invalid' : 'empty' };
  } catch { return { progress: { ...initial, bestScores: {} }, status: 'unavailable' }; }
}
export function loadProgress(): Progress { return readProgress().progress; }
export function mergeProgress(current: Progress, incoming: Progress): Progress {
  const bestScores = Object.fromEntries([...new Set([...Object.keys(current.bestScores), ...Object.keys(incoming.bestScores)])]
    .map(key => [key, Math.max(current.bestScores[key] ?? 0, incoming.bestScores[key] ?? 0)]));
  return { completed: Math.max(current.completed, incoming.completed), victories: Math.max(current.victories, incoming.victories),
    bestScores, ...(current.trainingComplete || incoming.trainingComplete ? { trainingComplete: true } : {}) };
}
export function saveProgress(progress: Progress): boolean {
  const parsed = progressSchema.safeParse(progress);
  if (!parsed.success) return false;
  try {
    const current = readProgress().progress;
    const next = mergeProgress(current, parsed.data);
    const previous = parseStored(localStorage.getItem(PROGRESS_KEY));
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(previous ?? current));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}
const backupSchema = z.object({ format: z.literal('kowloon-armor-progress'), version: z.literal(1),
  createdAt: z.iso.datetime(), progress: progressSchema.required({ completed: true, victories: true, bestScores: true }).strict() }).strict();
export function exportProgress(progress: Progress): string {
  return JSON.stringify(backupSchema.parse({ format: 'kowloon-armor-progress', version: 1,
    createdAt: new Date().toISOString(), progress }), null, 2);
}
export function parseProgressBackup(raw: string): { ok: true; progress: Progress; createdAt: string } | { ok: false; error: string } {
  if (raw.length > BACKUP_LIMIT) return { ok: false, error: '檔案太大。請選擇由遊戲匯出的戰績 JSON（64 KB 以內）。' };
  try {
    const result = backupSchema.safeParse(JSON.parse(raw, (key, value: unknown) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new SyntaxError('Unsupported property');
      return value;
    }));
    return result.success ? { ok: true, progress: result.data.progress, createdAt: result.data.createdAt }
      : { ok: false, error: '這不是支援的戰績備份，或數值已損壞。請使用版本 1 的遊戲匯出檔。現有戰績未有改動。' };
  } catch { return { ok: false, error: '未能讀取 JSON。請重新選擇遊戲匯出的戰績檔，現有戰績未有改動。' }; }
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
