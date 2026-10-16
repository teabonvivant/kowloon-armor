import { z } from 'zod';

export const ACTIONS = ['forward', 'reverse', 'left', 'right', 'turretLeft', 'turretRight', 'elevate', 'lower',
  'fire', 'brake', 'scope', 'observe', 'camera', 'recentre', 'pointer', 'controls', 'strike'] as const;
export type KeyAction = typeof ACTIONS[number];
export type KeyBindings = Record<KeyAction, string>;
export const DEFAULT_BINDINGS: KeyBindings = {
  forward: 'KeyW', reverse: 'KeyS', left: 'KeyA', right: 'KeyD', turretLeft: 'KeyQ', turretRight: 'KeyE',
  elevate: 'ArrowUp', lower: 'ArrowDown', fire: 'Space', brake: 'KeyB', scope: 'ShiftLeft', observe: 'KeyC',
  camera: 'KeyV', recentre: 'KeyF', pointer: 'KeyM', controls: 'KeyH', strike: 'KeyG',
};
export const BINDING_LABELS: Record<KeyAction, string> = {
  forward: '前進', reverse: '倒車', left: '車身左轉', right: '車身右轉', turretLeft: '炮塔左轉', turretRight: '炮塔右轉',
  elevate: '炮管抬高', lower: '炮管降低', fire: '開炮', brake: '煞車', scope: '瞄準鏡', observe: '按住獨立觀察',
  camera: '切換視角', recentre: '炮塔回正', pointer: '鎖定滑鼠', controls: 'HOTAS 設定', strike: '呼叫炮擊',
};
const codeSchema = z.string().regex(/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Numpad[0-9])$/);
/** Fills actions added after a binding set was saved (v1.9 `strike`) with the first unused default/fallback key. */
export function migrateBindings(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const saved = { ...(value as Record<string, unknown>) };
  const used = new Set(Object.values(saved));
  for (const action of ACTIONS) {
    if (saved[action] !== undefined) continue;
    const candidates = [DEFAULT_BINDINGS[action], 'KeyG', 'KeyT', 'KeyR', 'KeyY', 'KeyX', 'KeyZ', 'KeyJ', 'KeyK', 'KeyL'];
    const code = candidates.find(candidate => !used.has(candidate));
    if (code) { saved[action] = code; used.add(code); }
  }
  return saved;
}
export const keyBindingsSchema = z.preprocess(migrateBindings, z.record(z.enum(ACTIONS), codeSchema)
  .refine(bindings => new Set(Object.values(bindings)).size === ACTIONS.length));
export function remapBinding(bindings: KeyBindings, action: KeyAction, code: string): KeyBindings | null {
  if (!codeSchema.safeParse(code).success) return null;
  const updated = { ...bindings, [action]: code };
  const conflict = ACTIONS.find(candidate => candidate !== action && bindings[candidate] === code);
  if (conflict) updated[conflict] = bindings[action];
  return updated;
}
export function keyLabel(code: string): string {
  return ({ Space: 'Space', ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' } as Record<string, string>)[code]
    ?? code.replace(/^Key|^Digit/, '').replace('Numpad', '數字鍵 ');
}
