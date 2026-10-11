import { z } from 'zod';

const axis = z.number().int().min(-1).max(63);
const button = z.number().int().min(-1).max(127);
const device = z.number().int().min(-1).max(15);
const neutral = z.number().finite().min(-1).max(1);

export const controllerSchema = z.object({
  enabled: z.boolean(),
  controllerIndex: z.number().int().min(0).max(15),
  throttleControllerIndex: device,
  lookControllerIndex: device,
  buttonControllerIndex: device,
  axisSteer: axis,
  axisThrottle: axis,
  axisAimX: axis,
  axisAimY: axis,
  invertSteer: z.boolean(),
  invertThrottle: z.boolean(),
  invertAimX: z.boolean(),
  invertAimY: z.boolean(),
  throttleMode: z.enum(['centered', 'slider']),
  deadzone: z.number().finite().min(0.02).max(0.45),
  sensitivity: z.number().finite().min(0.25).max(2),
  buttonFire: button,
  buttonBrake: button,
  buttonCamera: button,
  buttonPause: button,
  buttonScope: button,
  buttonReverse: button,
  neutralSteer: neutral,
  neutralThrottle: neutral,
  neutralAimX: neutral,
  neutralAimY: neutral,
}).readonly();

export type ControllerConfig = z.infer<typeof controllerSchema>;

export const HOTAS_PRESET: ControllerConfig = {
  enabled: true, controllerIndex: 0, throttleControllerIndex: -1,
  lookControllerIndex: -1, buttonControllerIndex: -1,
  axisSteer: 0, axisThrottle: 1, axisAimX: 2, axisAimY: 3,
  invertSteer: false, invertThrottle: true, invertAimX: false, invertAimY: false,
  throttleMode: 'centered', deadzone: 0.12, sensitivity: 1,
  buttonFire: 0, buttonBrake: 1, buttonCamera: 2, buttonPause: 7,
  buttonScope: 3, buttonReverse: 4,
  neutralSteer: 0, neutralThrottle: 0, neutralAimX: 0, neutralAimY: 0,
} as const;

export const XBOX_PRESET: ControllerConfig = {
  ...HOTAS_PRESET, buttonFire: 7, buttonBrake: 0, buttonCamera: 3,
  buttonPause: 9, buttonScope: 6, buttonReverse: -1,
} as const;

const STORAGE_KEY = 'kowloon-armour.controllers.v1';

export function loadControllerConfig(): ControllerConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return HOTAS_PRESET;
    const parsed: unknown = JSON.parse(saved);
    const config = controllerSchema.safeParse(parsed);
    return config.success ? config.data : HOTAS_PRESET;
  } catch (error) {
    if (error instanceof DOMException || error instanceof SyntaxError) return HOTAS_PRESET;
    throw error;
  }
}

export function saveControllerConfig(config: ControllerConfig): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (error) {
    if (error instanceof DOMException) return false;
    throw error;
  }
}

export function clampInput(value: number): number {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

export function centeredAxis(raw: number, center: number, deadzone: number): number {
  const offset = raw - center;
  if (Math.abs(offset) <= deadzone) return 0;
  const span = Math.max(deadzone + 0.01, offset > 0 ? 1 - center : 1 + center);
  return clampInput(Math.sign(offset) * (Math.abs(offset) - deadzone) / (span - deadzone));
}
