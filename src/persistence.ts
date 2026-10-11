import { z } from 'zod';
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
