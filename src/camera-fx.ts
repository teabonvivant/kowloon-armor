import { clamp } from './math';

/** Hit-stop budget (seconds): per-event durations plus a rolling window cap so chains never feel stuck. */
export const HITSTOP_LIMITS = { single: .1, window: 2, windowTotal: .25, scale: .35 } as const;
export const HITSTOP_EVENT = { kill: .09, explosion: .045, penetrate: .04, ricochet: 0, blocked: 0 } as const;
export type HitStopKind = keyof typeof HITSTOP_EVENT;
export class HitStopBudget {
  private readonly events: { at: number; seconds: number }[] = [];
  /** Returns the seconds of hit-stop granted for this event after applying the per-event and 2 s window caps. */
  grant(now: number, kind: HitStopKind): number {
    while (this.events.length && now - (this.events[0]?.at ?? 0) > HITSTOP_LIMITS.window) this.events.shift();
    const used = this.events.reduce((sum, event) => sum + event.seconds, 0);
    const seconds = clamp(Math.min(HITSTOP_EVENT[kind], HITSTOP_LIMITS.single, HITSTOP_LIMITS.windowTotal - used), 0, HITSTOP_LIMITS.single);
    if (seconds > 0) this.events.push({ at: now, seconds });
    return seconds;
  }
  reset(): void { this.events.length = 0; }
}
