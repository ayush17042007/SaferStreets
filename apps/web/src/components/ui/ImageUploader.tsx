"use client";

import { useId, useRef } from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

export interface UploadItem {
  id: string;
  /** Object URL or remote URL for the preview. */
  previewUrl: string;
  name: string;
  /** 0-100 while uploading; undefined when done. */
  progress?: number;
  error?: string;
}

/** Presentational: parent owns the files and the upload. Up to `max` (4 for reports). */
export function ImageUploader({
  items,
  max = 4,
  onAdd,
  onRemove,
  error,
  disabled,
}: {
  items: UploadItem[];
  max?: number;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const full = items.length >= max;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.id}
            className="relative aspect-square overflow-hidden rounded-control border border-line bg-neutral-bubble"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.previewUrl} alt={`Photo preview: ${it.name}`} className="h-full w-full object-cover" />
            {it.progress !== undefined ? (
              <div
                className="absolute inset-x-0 bottom-0 bg-card/90 p-1.5"
                role="progressbar"
                aria-label={`Uploading ${it.name}`}
                aria-valuenow={it.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-1 overflow-hidden rounded-[2px] bg-track">
                  <div
                    className="h-full bg-ink transition-[width] duration-fast"
                    style={{ width: `${it.progress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {it.error ? (
              <p className="absolute inset-x-0 bottom-0 bg-coral-tint p-1 text-[12px] leading-4 text-coral-text">
                {it.error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(it.id)}
              aria-label={`Remove photo ${it.name}`}
              className="absolute top-1 right-1 flex h-11 w-11 items-start justify-end p-1"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-avatar bg-ink text-white">
                <Icon name="close" size={14} />
              </span>
            </button>
          </div>
        ))}
        {!full ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex aspect-square min-h-11 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-control bg-card text-[12px] leading-4 text-text-secondary",
              "transition-colors duration-fast hover:bg-neutral-bubble disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Icon name="addPhoto" size={24} />
            Add photo
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, max - items.length);
          if (files.length) onAdd(files);
          e.target.value = "";
        }}
      />
      <p className="text-[12px] leading-4 text-text-secondary">
        {items.length} of {max} photos. JPEG, PNG or WebP, up to 5 MB each.
      </p>
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-[14px] leading-5 text-coral-text">
          <Icon name="error" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
