"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { IconName } from "@/design/icons";
import { Icon } from "./Icon";
import { cn } from "./cn";

export type ToastTone = "success" | "info" | "error";
const toneIcon: Record<ToastTone, { icon: IconName; cls: string }> = {
  success: { icon: "verified", cls: "text-mint-text" },
  info: { icon: "alert", cls: "text-amber-text" },
  error: { icon: "error", cls: "text-coral-text" },
};

/** A single toast card: white, leading status icon. Presentational; ToastProvider handles timing. */
export function Toast({
  tone = "success",
  children,
  className,
}: {
  tone?: ToastTone;
  children: ReactNode;
  className?: string;
}) {
  const t = toneIcon[tone];
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3 text-[14px] leading-5 text-ink shadow-popover",
        className,
      )}
    >
      <Icon name={t.icon} size={20} className={cn("shrink-0", t.cls)} />
      <span>{children}</span>
    </div>
  );
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}
const ToastContext = createContext<{ show: (message: string, tone?: ToastTone) => void } | null>(null);

export const TOAST_DURATION_MS = 4000;

/** Bottom-centre on mobile, bottom-right on desktop; auto-dismiss 4 s; never blocks actions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: ToastTone = "success") => {
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), tone, message }]);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 md:right-4 md:left-auto md:items-end">
        {items.map((t) => (
          <AutoDismiss key={t.id} onDone={() => setItems((p) => p.filter((x) => x.id !== t.id))}>
            <Toast tone={t.tone} className="fade-in pointer-events-auto">
              {t.message}
            </Toast>
          </AutoDismiss>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function AutoDismiss({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onDone, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  return <>{children}</>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
