import type { Actor } from './actors';

export type MissionObjective = { readonly kind: 'clear' } | {
  readonly kind: 'capture' | 'defend'; readonly center: readonly [number, number];
  readonly radius: number; readonly seconds: number;
};
export interface ObjectiveState { progress: number; integrity: number; contested: boolean; inside: boolean }
export function createObjectiveState(): ObjectiveState { return { progress: 0, integrity: 100, contested: false, inside: false }; }
export function updateObjective(state: ObjectiveState, goal: MissionObjective, player: Actor, enemies: readonly Actor[], dt: number): void {
  if (goal.kind === 'clear') return;
  const within = (actor: Actor): boolean => Math.hypot(actor.visual.root.position.x - goal.center[0], actor.visual.root.position.z - goal.center[1]) <= goal.radius;
  state.inside = within(player);
  state.contested = enemies.some(enemy => enemy.alive && within(enemy));
  if (state.inside && !state.contested) state.progress = Math.min(goal.seconds, state.progress + dt);
  if (goal.kind === 'defend' && state.contested) state.integrity = Math.max(0, state.integrity - dt * 8);
}
export function objectiveName(goal: MissionObjective | undefined): string {
  return goal?.kind === 'capture' ? '進入指定路口，完成佔領' : goal?.kind === 'defend' ? '守住指定區域，阻止敵車進入' : '清除演習區內敵方坦克';
}
