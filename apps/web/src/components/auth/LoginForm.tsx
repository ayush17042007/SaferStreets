"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { otpRequestSchema } from "@saferstreets/shared";
import { Turnstile } from "@marsidev/react-turnstile";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Banner, Button, TextField } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { LOGIN_EMAIL_KEY } from "./storage";

const formSchema = otpRequestSchema.pick({ email: true });
type FormValues = z.infer<typeof formSchema>;

export function LoginForm({ siteKey, next }: { siteKey: string; next?: string | undefined }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email: "" } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    if (!token) {
      setFormError("Complete the check below, then send the code.");
      return;
    }
    try {
      await api("/auth/otp/request", { method: "POST", body: { email: values.email, turnstileToken: token } });
      // The address goes in session storage, never in the URL.
      sessionStorage.setItem(LOGIN_EMAIL_KEY, values.email.trim().toLowerCase());
      router.push(next ? `/verify?next=${encodeURIComponent(next)}` : "/verify");
    } catch (err) {
      setToken(null);
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="type-h1">Log in or sign up</h1>
        <p className="text-[14px] leading-5 text-text-secondary">
          Enter your email and we&apos;ll send a 6-digit code. No password needed.
        </p>
      </div>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        {...(errors.email ? { error: "Enter a valid email address." } : {})}
        {...register("email")}
      />
      <Turnstile
        siteKey={siteKey}
        options={{ theme: "light", size: "flexible" }}
        onSuccess={setToken}
        onExpire={() => setToken(null)}
        onError={() => setToken(null)}
      />
      {formError ? (
        <Banner tone="amber-warn" icon="alert">
          {formError}
        </Banner>
      ) : null}
      <Button type="submit" size="mobile" fullWidth trailingArrow loading={isSubmitting}>
        Send code
      </Button>
    </form>
  );
}
