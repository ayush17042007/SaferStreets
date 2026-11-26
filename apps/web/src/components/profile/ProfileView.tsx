"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { fullNameSchema, phoneSchema, type MeResponse } from "@saferstreets/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Banner, Button, Card, Icon, StatusChip, TextField, useToast, Avatar } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAvatarUpload } from "@/lib/avatar-upload";
import { AvatarPicker } from "./AvatarPicker";

const schema = z.object({ fullName: fullNameSchema, phone: z.union([z.literal(""), phoneSchema]) });
type Values = z.infer<typeof schema>;

const since = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** S26: avatar, name, member since, verified-email badge, stats, phone (visible only to me), edit mode. */
export function ProfileView({ me }: { me: MeResponse }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const upload = useAvatarUpload();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: me.fullName ?? "", phone: me.phone?.replace("+91", "") ?? "" },
  });
  const fullNameValue = useWatch({ control, name: "fullName" });

  function cancel() {
    reset({ fullName: me.fullName ?? "", phone: me.phone?.replace("+91", "") ?? "" });
    upload.clear();
    setRemoved(false);
    setFormError(null);
    setEditing(false);
  }

  async function onSubmit(v: Values) {
    setFormError(null);
    try {
      await api("/me", {
        method: "PATCH",
        body: {
          fullName: v.fullName,
          phone: v.phone || null,
          ...(upload.uploadId ? { avatarUploadId: upload.uploadId } : removed ? { avatarUploadId: null } : {}),
        },
      });
      toast.show("Profile saved.");
      upload.clear();
      setRemoved(false);
      setEditing(false);
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

  const name = me.fullName ?? me.email;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="type-h1">Profile</h1>

      <Card className="flex flex-col gap-5">
        {editing ? (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <AvatarPicker
              name={fullNameValue || name}
              currentUrl={me.avatarUrl}
              upload={upload}
              removed={removed}
              onRemove={() => setRemoved(true)}
            />
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
              inputMode="tel"
              hint="Only you, and people in a ride you share, can see it."
              {...(errors.phone ? { error: "Enter a 10-digit Indian mobile number." } : {})}
              {...register("phone")}
            />
            {formError ? (
              <Banner tone="amber-warn" icon="alert">
                {formError}
              </Banner>
            ) : null}
            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Button type="button" variant="secondary" size="mobile" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" size="mobile" loading={isSubmitting} disabled={upload.uploading}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Avatar name={name} size={64} imageUrl={me.avatarUrl} />
              <div className="min-w-0">
                <h2 className="type-h2 truncate">{name}</h2>
                <p className="text-[14px] leading-5 text-text-secondary">
                  Member since {since.format(new Date(me.memberSince))}
                </p>
                <div className="mt-1">
                  <StatusChip tone="mint" label="Verified email" icon="verified" />
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 md:grid-cols-3">
              <Stat label="Reports" value={me.counts.reports} />
              <Stat label="Rides offered" value={me.counts.rides} />
              <Stat label="Trusted contacts" value={me.counts.contacts} />
            </dl>
            <dl className="flex flex-col gap-2 border-t border-line pt-4 text-[14px] leading-5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Email</dt>
                <dd className="truncate font-medium">{me.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1 text-text-secondary">
                  Phone
                  <span className="text-[12px] leading-4">(visible only to you)</span>
                </dt>
                <dd className="font-medium">{me.phone ?? "Not added"}</dd>
              </div>
            </dl>
            <div>
              <Button size="mobile" variant="secondary" onClick={() => setEditing(true)}>
                <Icon name="profile" size={16} />
                Edit profile
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[12px] leading-4 text-text-secondary">{label}</dt>
      <dd className="font-display text-[24px] leading-[30px] font-semibold">{value}</dd>
    </div>
  );
}
