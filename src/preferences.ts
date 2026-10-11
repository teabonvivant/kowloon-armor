import { z } from 'zod';

const schema = z.object({
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  volume: z.number().min(0).max(1).default(.4),
  sensitivity: z.number().min(.3).max(2.5).default(1),
  invertY: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  difficulty: z.enum(['training', 'standard', 'veteran']).default('standard'),
});
export type Preferences = z.infer<typeof schema>;
export function loadPreferences(): Preferences {
  try {
    const result = schema.safeParse(JSON.parse(localStorage.getItem('kowloon-armor-settings') ?? '{}'));
    return result.success ? result.data : schema.parse({});
  } catch { return schema.parse({}); }
}
export function savePreferences(settings: Preferences): boolean {
  const result = schema.safeParse(settings);
  if (!result.success) return false;
  try { localStorage.setItem('kowloon-armor-settings', JSON.stringify(result.data)); return true; }
  catch { return false; }
}
