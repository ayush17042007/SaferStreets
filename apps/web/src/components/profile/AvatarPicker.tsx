"use client";

import { useRef } from "react";
import { Avatar, Button } from "@/components/ui";
import type { useAvatarUpload } from "@/lib/avatar-upload";

/** One round photo with Add/Change/Remove. Falls back to initials. */
export function AvatarPicker({
  name,
  currentUrl,
  upload,
  removed,
  onRemove,
}: {
  name: string;
  currentUrl?: string | null | undefined;
  upload: ReturnType<typeof useAvatarUpload>;
  removed?: boolean;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const shown = upload.item?.previewUrl ?? (removed ? null : (currentUrl ?? null));
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || "Your photo"} size={64} imageUrl={shown} />
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={upload.uploading}
            onClick={() => input.current?.click()}
          >
            {shown ? "Change photo" : "Add photo"}
          </Button>
          {shown ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                upload.clear();
                onRemove?.();
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-[12px] leading-4 text-text-secondary">JPEG, PNG or WebP, up to 5 MB.</p>
        {upload.error ? (
          <p role="alert" className="text-[14px] leading-5 text-coral-text">
            {upload.error}
          </p>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        data-testid="avatar-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload.start(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
