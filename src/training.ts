import type { Actor } from './actors';
import { angleDelta } from './math';

export interface TrainingState {
  step: number;
  distance: number;
  stationary: number;
  lastX: number;
  lastZ: number;
  shotsAtAim: number;
  aimAtStep: number;
}

export function createTraining(player: Actor, shots: number): TrainingState {
  const position = player.visual.root.position;
  return { step: 0, distance: 0, stationary: 0, lastX: position.x, lastZ: position.z, shotsAtAim: shots, aimAtStep: player.aim };
}

export function updateTraining(state: TrainingState, player: Actor, shots: number, dt: number): boolean {
  const position = player.visual.root.position;
  const distance = Math.hypot(position.x - state.lastX, position.z - state.lastZ);
  state.lastX = position.x; state.lastZ = position.z;
  const previous = state.step;
  if (state.step === 0) {
    state.distance += distance;
    if (state.distance >= 15) state.step = 1;
  } else if (state.step === 1) {
    state.stationary = Math.abs(player.speed) < .3 ? state.stationary + dt : 0;
    if (state.stationary >= .75) { state.step = 2; state.aimAtStep = player.aim; }
  } else if (state.step === 2 && Math.abs(angleDelta(state.aimAtStep, player.aim)) >= Math.PI / 6) {
    state.step = 3; state.shotsAtAim = shots;
  } else if (state.step === 3 && shots > state.shotsAtAim) state.step = 4;
  return previous !== state.step;
}
