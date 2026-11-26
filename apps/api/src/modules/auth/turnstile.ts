// Cloudflare Turnstile server-side verification (Part B7). No bypass: production requires a real secret
// (env validation); dev and CI use Cloudflare's published test keys, which still go through siteverify.
export interface TurnstileVerifier {
  verify(token: string, ip: string | undefined): Promise<boolean>;
}

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function createTurnstileVerifier(opts: { secret: string; fetchImpl?: typeof fetch }): TurnstileVerifier {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async verify(token, ip) {
      try {
        const body = new URLSearchParams({ secret: opts.secret, response: token });
        if (ip) body.set("remoteip", ip);
        const res = await doFetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return false;
        const json = (await res.json()) as { success?: boolean };
        return json.success === true;
      } catch {
        // Fail closed: if Cloudflare cannot be reached the code request is refused, never waved through.
        return false;
      }
    },
  };
}
