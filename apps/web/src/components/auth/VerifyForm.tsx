"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, OTPInput } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { LOGIN_EMAIL_KEY, maskEmail } from "./storage";

type Verified = { data: { needsOnboarding: boolean } };

export function VerifyForm({ siteKey, next }: { siteKey: string; next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [token, setToken] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const submitting = useRef(false);
  /** Set once the code is accepted, so clearing the stored email does not bounce us back to /login. */
  const done = useRef(false);

  // The address lives in sessionStorage (never in the URL); null on the server and before hydration.
  const email = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem(LOGIN_EMAIL_KEY),
    () => null,
  );
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  useEffect(() => {
    if (hydrated && !email && !done.current) router.replace("/login");
  }, [hydrated, email, router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const submit = useCallback(
    async (value: string) => {
      if (!email || submitting.current) return;
      submitting.current = true;
      setBusy(true);
      setError(undefined);
      try {
        const res = await api<Verified>("/auth/otp/verify", { method: "POST", body: { email, code: value } });
        done.current = true;
        sessionStorage.removeItem(LOGIN_EMAIL_KEY);
        router.replace(res.data.needsOnboarding ? "/welcome" : next);
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
          if (err.code === "OTP_LOCKED") setLocked(true);
          if (err.code === "OTP_EXPIRED") setExpired(true);
          if (err.code === "RATE_LIMITED" && err.retryAfter) setSecondsLeft(err.retryAfter);
        } else setError("Something went wrong. Try again.");
        setCode("");
      } finally {
        submitting.current = false;
        setBusy(false);
      }
    },
    [email, next, router],
  );

  async function resend() {
    if (!email || !token) return;
    setError(undefined);
    setResent(false);
    try {
      await api("/auth/otp/request", { method: "POST", body: { email, turnstileToken: token } });
      setLocked(false);
      setExpired(false);
      setCode("");
      setToken(null);
      setSecondsLeft(60);
      setResent(true);
    } catch (err) {
      setToken(null);
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  const needsNewCode = locked || expired;
  const canResend = secondsLeft <= 0 || needsNewCode;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="type-h1">Check your email</h1>
        <p className="text-[14px] leading-5 text-text-secondary" data-testid="code-sent-to">
          Code sent to {email ? maskEmail(email) : "your email"}
        </p>
      </div>

      <OTPInput
        value={code}
        onChange={setCode}
        onComplete={(v) => void submit(v)}
        {...(error ? { error } : {})}
        disabled={busy || needsNewCode}
        autoFocus
      />

      {resent && !error ? (
        <p role="status" className="text-center text-[14px] leading-5 text-text-secondary">
          A new code is on its way.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {canResend ? (
          <>
            <Turnstile
              siteKey={siteKey}
              options={{ theme: "light", size: "flexible" }}
              onSuccess={setToken}
              onExpire={() => setToken(null)}
              onError={() => setToken(null)}
            />
            <Button variant="secondary" size="mobile" fullWidth disabled={!token} onClick={resend}>
              Resend code
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="mobile" fullWidth disabled>
            Resend code in {secondsLeft} s
          </Button>
        )}
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center text-[14px] leading-5 font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[3px]"
        >
          Change email
        </Link>
      </div>
    </div>
  );
}
