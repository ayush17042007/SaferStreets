import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSosAlarm } from "./sos-alarm";

describe("createSosAlarm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mockAudioContext(opts?: {
    state?: AudioContextState;
    resumeState?: AudioContextState;
    resumeThrows?: boolean;
  }) {
    const osc = {
      type: "sine" as OscillatorType,
      frequency: {
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const ctx = {
      state: opts?.state ?? ("running" as AudioContextState),
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => osc),
      createGain: vi.fn(() => gain),
      resume: vi.fn(async () => {
        if (opts?.resumeThrows) throw new Error("NotAllowedError");
        ctx.state = opts?.resumeState ?? "running";
      }),
      close: vi.fn(async () => {}),
    };
    const ctor = vi.fn(function () {
      return ctx;
    });
    vi.stubGlobal("AudioContext", ctor);
    return { ctor, ctx, osc, gain };
  }

  it("returns unsupported when AudioContext is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const alarm = createSosAlarm();
    expect(await alarm.start()).toBe("unsupported");
    expect(alarm.isPlaying()).toBe(false);
  });

  it("starts an alternating-tone siren loop and prevents duplicate instances", async () => {
    const { ctor, osc } = mockAudioContext();
    const alarm = createSosAlarm();

    expect(await alarm.start()).toBe("playing");
    expect(alarm.isPlaying()).toBe(true);
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);

    // Rapid second start must not create another AudioContext or oscillator.
    expect(await alarm.start()).toBe("playing");
    expect(ctor).toHaveBeenCalledTimes(1);

    // Alternates between 660 Hz and 880 Hz while active.
    vi.advanceTimersByTime(340);
    expect(osc.frequency.setTargetAtTime).toHaveBeenCalledWith(660, 0, 0.02);
    vi.advanceTimersByTime(340);
    expect(osc.frequency.setTargetAtTime).toHaveBeenCalledWith(880, 0, 0.02);

    alarm.stop();
    expect(alarm.isPlaying()).toBe(false);
    expect(osc.stop).toHaveBeenCalledTimes(1);
    expect(osc.disconnect).toHaveBeenCalledTimes(1);
  });

  it("resumes a suspended AudioContext and handles blocked audio gracefully", async () => {
    const resumed = mockAudioContext({ state: "suspended", resumeState: "running" });
    const alarm1 = createSosAlarm();
    expect(await alarm1.start()).toBe("playing");
    expect(resumed.ctx.resume).toHaveBeenCalledTimes(1);
    alarm1.stop();

    const blocked = mockAudioContext({ state: "suspended", resumeThrows: true });
    const alarm2 = createSosAlarm();
    expect(await alarm2.start()).toBe("blocked");
    expect(alarm2.isPlaying()).toBe(false);
    expect(blocked.ctx.close).toHaveBeenCalledTimes(1);
  });
});
