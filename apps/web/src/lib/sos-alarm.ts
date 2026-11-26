// Browser Web Audio API emergency alarm controller.
// Plays an original alternating-tone siren pattern only after an explicit user interaction.

export type SosAudioStatus = "idle" | "playing" | "blocked" | "unsupported";

export interface SosAlarmController {
  start: () => Promise<SosAudioStatus>;
  stop: () => void;
  isPlaying: () => boolean;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

/**
 * Creates a self-contained Web Audio emergency alarm controller.
 * - Alternates between 880 Hz and 660 Hz every 340 ms with smooth gain envelopes.
 * - Guarantees at most one active oscillator/timer loop at any time.
 * - Cleans up all audio nodes, timers, and AudioContext on stop().
 */
export function createSosAlarm(): SosAlarmController {
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let active = false;
  let highTone = true;

  function cleanupNodes() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (osc) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
      try {
        osc.disconnect();
      } catch {
        // Already disconnected.
      }
      osc = null;
    }
    if (gain) {
      try {
        gain.disconnect();
      } catch {
        // Already disconnected.
      }
      gain = null;
    }
    if (ctx) {
      const toClose = ctx;
      ctx = null;
      void toClose.close().catch(() => {});
    }
  }

  function stop() {
    active = false;
    cleanupNodes();
  }

  async function start(): Promise<SosAudioStatus> {
    if (active) return "playing";

    const Ctor = getAudioContextCtor();
    if (!Ctor) return "unsupported";

    try {
      ctx = new Ctor();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (ctx.state !== "running") {
        cleanupNodes();
        return "blocked";
      }

      gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.75, ctx.currentTime + 0.03);
      gain.connect(ctx.destination);

      osc = ctx.createOscillator();
      osc.type = "triangle";
      highTone = true;
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(gain);
      osc.start();

      active = true;
      timer = setInterval(() => {
        if (!active || !ctx || !osc) return;
        highTone = !highTone;
        const nextFreq = highTone ? 880 : 660;
        osc.frequency.setTargetAtTime(nextFreq, ctx.currentTime, 0.02);
      }, 340);

      return "playing";
    } catch {
      cleanupNodes();
      return "blocked";
    }
  }

  return {
    start,
    stop,
    isPlaying: () => active,
  };
}
