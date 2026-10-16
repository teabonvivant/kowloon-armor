import { z } from 'zod';
import { DEFAULT_BINDINGS, keyBindingsSchema } from './key-bindings';
import { TANKS } from './data/tanks';
import { REALISM_SAMPLE } from './realism';

const SETTINGS_KEY = REALISM_SAMPLE ? 'kowloon-armor-realism-settings' : 'kowloon-armor-settings';

const schema = z.object({
  controlMode: z.enum(['auto', 'touch', 'desktop']).default('auto').catch('auto'),
  hudDensity: z.enum(['compact', 'full']).default('compact').catch('compact'),
  touchSensitivity: z.number().min(.3).max(2).default(1).catch(1),
  touchInvert: z.boolean().default(false).catch(false),
  touchAutoBrake: z.boolean().default(true).catch(true),
  touchHand: z.enum(['right', 'left']).default('right').catch('right'),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  volume: z.number().min(0).max(1).default(.4),
  musicVolume: z.number().min(0).max(1).default(.35),
  lighting: z.enum(['day', 'dusk']).default('dusk').catch('dusk'),
  adaptiveResolution: z.boolean().default(false).catch(false),
  nightAudio: z.boolean().default(false).catch(false),
  highContrast: z.boolean().default(false).catch(false),
  favorites: z.array(z.string().refine(id => TANKS.some(tank => tank.id === id))).max(30).default([]).catch([]),
  scopeSensitivity: z.number().min(.25).max(1.5).default(1).catch(1),
  chaseDistance: z.number().min(12).max(22).default(15).catch(15),
  chaseFov: z.number().min(45).max(75).default(50).catch(50),
  shakeStrength: z.number().min(0).max(1).default(1).catch(1),
  reticleColor: z.enum(['white', 'cyan', 'amber']).default('white').catch('white'),
  reticleWidth: z.number().int().min(1).max(3).default(1).catch(1),
  lowFlash: z.boolean().default(false).catch(false),
  diagnostics: z.boolean().default(false).catch(false),
  effectsVolume: z.number().min(0).max(1).default(1).catch(1),
  engineVolume: z.number().min(0).max(1).default(1).catch(1),
  alertsVolume: z.number().min(0).max(1).default(1).catch(1),
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
    const result = schema.safeParse(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? (REALISM_SAMPLE ? localStorage.getItem('kowloon-armor-settings') : null) ?? '{}'));
    return result.success ? result.data : schema.parse({});
  } catch { return schema.parse({}); }
}
export function savePreferences(settings: Preferences): boolean {
  const result = schema.safeParse(settings);
  if (!result.success) return false;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(result.data)); return true; }
  catch { return false; }
}
