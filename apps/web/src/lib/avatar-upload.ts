"use client";

import { useCallback, useState } from "react";
import type { UploadItem } from "@/components/ui";
import { ApiError, api } from "./api";

const MAX_SIDE = 1600;

/** Scales an image down to at most 1600 px on its long side before upload (appendix-02 2A). */
export async function compressImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.88));
}

interface SignResponse {
  data: { uploadId: string; uploadUrl: string; fields: Record<string, string> };
}

/**
 * Avatar upload flow: compress -> POST /uploads/sign -> POST the file straight to Cloudinary ->
 * keep the upload id, which the form sends as `avatarUploadId` on save.
 */
export function useAvatarUpload() {
  const [item, setItem] = useState<UploadItem | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const start = useCallback(async (file: File) => {
    setError(undefined);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPEG, PNG or WebP photo.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setItem({ id: "avatar", name: file.name, previewUrl: preview, progress: 5 });
    try {
      const blob = await compressImage(file);
      if (blob.size > 5 * 1024 * 1024) throw new Error("That photo is larger than 5 MB.");
      const signed = await api<SignResponse>("/uploads/sign", {
        method: "POST",
        body: {
          purpose: "AVATAR",
          contentType:
            blob.type === "image/png" ? "image/png" : blob.type === "image/webp" ? "image/webp" : "image/jpeg",
          sizeBytes: blob.size,
        },
      });
      setItem((i) => (i ? { ...i, progress: 40 } : i));
      const form = new FormData();
      for (const [k, v] of Object.entries(signed.data.fields)) form.append(k, v);
      form.append("file", blob, file.name);
      const res = await fetch(signed.data.uploadUrl, { method: "POST", body: form });
      if (!res.ok) throw new Error("The photo didn't upload. Try again.");
      setUploadId(signed.data.uploadId);
      setItem((i) => (i ? { ...i, progress: undefined } : i));
    } catch (err) {
      setItem(null);
      setUploadId(null);
      setError(err instanceof ApiError || err instanceof Error ? err.message : "The photo didn't upload. Try again.");
    }
  }, []);

  const clear = useCallback(() => {
    setItem(null);
    setUploadId(null);
    setError(undefined);
  }, []);

  return { item, uploadId, error, start, clear, uploading: item?.progress !== undefined };
}
