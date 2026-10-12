import { z } from 'zod';
import { DEFAULT_BINDINGS, keyBindingsSchema } from './key-bindings';
import { TANKS } from './data/tanks';

const schema = z.object({
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  volume: z.number().min(0).max(1).default(.4),
  sensitivity: z.number().min(.3).max(2.5).default(1),
  invertY: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  difficulty: z.enum(['training', 'standard', 'veteran']).default('standard'),
  bindings: keyBindingsSchema.default(() => ({ ...DEFAULT_BINDINGS })),
  scopeMode: z.enum(['hold', 'toggle']).default('hold'),
  scopeZoom: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
  hudScale: z.number().min(.85).max(1.15).default(1),
  tankId: z.string().refine(id => TANKS.some(tank => tank.id === id)).default('leopard2a8').catch('leopard2a8'),
  mode: z.enum(['drive', 'battle', 'campaign', 'survival']).default('campaign').catch('campaign'),
  missionIndex: z.number().int().min(0).max(5).default(0).catch(0),
  deploymentSet: z.boolean().default(false).catch(false),
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
