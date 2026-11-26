"use client";

import { MAX_REPORT_PHOTOS } from "@saferstreets/shared";
import { useCallback, useState } from "react";
import type { UploadItem } from "@/components/ui";
import { ApiError, api } from "./api";
import { compressImage } from "./avatar-upload";

interface SignResponse {
  data: { uploadId: string; uploadUrl: string; fields: Record<string, string> };
}

export interface ReportPhoto extends UploadItem {
  uploadId?: string;
}

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Report photo flow (same steps as the avatar upload): compress, POST /uploads/sign with purpose REPORT,
 * POST the file to the signed URL, keep the upload ids for POST /reports. When storage is not set up the
 * API answers 503; the message is shown and the user can continue without photos.
 */
export function useReportPhotos() {
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [error, setError] = useState<string | undefined>();

  const patch = useCallback((id: string, change: Partial<ReportPhoto>) => {
    setPhotos((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));
  }, []);

  const uploadOne = useCallback(
    async (file: File) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      setPhotos((list) => [...list, { id, name: file.name, previewUrl, progress: 5 }]);
      const drop = () => setPhotos((list) => list.filter((p) => p.id !== id));
      try {
        const blob = await compressImage(file);
        if (blob.size > MAX_BYTES) throw new Error("That photo is larger than 5 MB.");
        const signed = await api<SignResponse>("/uploads/sign", {
          method: "POST",
          body: {
            purpose: "REPORT",
            contentType:
              blob.type === "image/png" ? "image/png" : blob.type === "image/webp" ? "image/webp" : "image/jpeg",
            sizeBytes: blob.size,
          },
        });
        patch(id, { progress: 40 });
        const form = new FormData();
        for (const [k, v] of Object.entries(signed.data.fields)) form.append(k, v);
        form.append("file", blob, file.name);
        const res = await fetch(signed.data.uploadUrl, { method: "POST", body: form });
        if (!res.ok) throw new Error("The photo didn't upload. Try again.");
        patch(id, { progress: undefined, uploadId: signed.data.uploadId });
      } catch (err) {
        drop();
        setError(err instanceof ApiError || err instanceof Error ? err.message : "The photo didn't upload. Try again.");
      }
    },
    [patch],
  );

  const add = useCallback(
    (files: File[]) => {
      setError(undefined);
      const room = MAX_REPORT_PHOTOS - photos.length;
      for (const file of files.slice(0, Math.max(0, room))) {
        if (!TYPES.includes(file.type)) {
          setError("Use a JPEG, PNG or WebP photo.");
          continue;
        }
        void uploadOne(file);
      }
    },
    [photos.length, uploadOne],
  );

  const remove = useCallback((id: string) => {
    setPhotos((list) => list.filter((p) => p.id !== id));
    setError(undefined);
  }, []);

  const uploading = photos.some((p) => p.progress !== undefined);
  const uploadIds = photos.flatMap((p) => (p.uploadId ? [p.uploadId] : []));
  return { photos, error, add, remove, uploading, uploadIds };
}
