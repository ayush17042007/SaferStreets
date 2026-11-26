"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { fullNameSchema, phoneSchema } from "@saferstreets/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Banner, Button, Checkbox, Switch, TextField } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAvatarUpload } from "@/lib/avatar-upload";
import { AvatarPicker } from "./AvatarPicker";

const schema = z.object({
  fullName: fullNameSchema,
  phone: z.union([z.literal(""), phoneSchema]),
  acceptTerms: z.boolean().refine((v) => v, "Confirm you are 18 or older and accept the terms."),
  alertOptIn: z.boolean(),
});
type Values = z.infer<typeof schema>;

/** Onboarding (S4): name, optional phone and photo, 18+/terms checkbox, optional alert opt-in. */
export function WelcomeForm() {
  const router = useRouter();
  const upload = useAvatarUpload();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", phone: "", acceptTerms: false, alertOptIn: false },
  });
  const fullNameValue = useWatch({ control, name: "fullName" });

  async function onSubmit(v: Values) {
    setFormError(null);
    try {
      await api("/me", {
        method: "PATCH",
        body: {
          fullName: v.fullName,
          ...(v.phone ? { phone: v.phone } : {}),
          acceptTerms: true,
          alertOptIn: v.alertOptIn,
          ...(upload.uploadId ? { avatarUploadId: upload.uploadId } : {}),
        },
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const name = err.fieldError("fullName");
        const phone = err.fieldError("phone");
        if (name) setError("fullName", { message: name });
        if (phone) setError("phone", { message: phone });
        if (!name && !phone) setFormError(err.message);
      } else setFormError("Something went wrong. Try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="type-h1">Set up your profile</h1>
        <p className="text-[14px] leading-5 text-text-secondary">Your name is shown to people you share rides with.</p>
      </div>

      <AvatarPicker name={fullNameValue} upload={upload} />

      <TextField
        label="Full name"
        autoComplete="name"
        {...(errors.fullName ? { error: errors.fullName.message ?? "Enter your name." } : {})}
        {...register("fullName")}
      />
      <TextField
        label="Phone"
        optional
        type="tel"
        autoComplete="tel-national"
        inputMode="tel"
        hint="10-digit mobile number. Shown only to people in a ride you share."
        {...(errors.phone ? { error: "Enter a 10-digit Indian mobile number." } : {})}
        {...register("phone")}
      />

      <Controller
        control={control}
        name="alertOptIn"
        render={({ field }) => (
          <Switch
            checked={field.value}
            onCheckedChange={field.onChange}
            label="Community alert notifications"
            description="Get told about nearby incidents by app and email. You choose the area later, and alerts are labelled Unverified until checked."
          />
        )}
      />

      <Checkbox
        label={
          <>
            I am 18 or older and agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold underline decoration-amber decoration-2 underline-offset-2"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="font-semibold underline decoration-amber decoration-2 underline-offset-2"
            >
              Privacy policy
            </Link>
            .
          </>
        }
        {...(errors.acceptTerms ? { error: errors.acceptTerms.message ?? "Accept the terms to continue." } : {})}
        {...register("acceptTerms")}
      />

      {formError ? (
        <Banner tone="amber-warn" icon="alert">
          {formError}
        </Banner>
      ) : null}
      <Button type="submit" size="mobile" fullWidth trailingArrow loading={isSubmitting} disabled={upload.uploading}>
        Continue
      </Button>
    </form>
  );
}
