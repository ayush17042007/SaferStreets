/** Injectable clock so time-dependent code (jobs, readiness) is testable (CLAUDE.md: injected clock). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date | string): Clock & { set(d: Date | string): void; advance(ms: number): void } {
  let t = new Date(at).getTime();
  return {
    now: () => new Date(t),
    set: (d) => {
      t = new Date(d).getTime();
    },
    advance: (ms) => {
      t += ms;
    },
  };
}
