import { clamp } from './math';

export function chaseHeight(distance: number, clearance: number, sample: boolean): number {
  if (!sample) return 8.2;
  const streetHeight = clamp(6.1 + (distance - 15) * .14,5.5,7.1);
  const open = clamp(clearance,0,1);
  const blend = open * open * (3 - 2 * open);
  return 8.2 + (streetHeight - 8.2) * blend;
}
