"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ToastProvider, useToast } from "@/components/ui";
import { SosProvider } from "@/components/sos/SosProvider";
import { ApiError } from "./api";
import { consumeFlash } from "./flash";

/** TanStack Query + toasts for signed-in screens. Never retries 4xx answers. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SosProvider>
          <FlashToast />
          {children}
        </SosProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Shows a message left by the previous screen (see lib/flash.ts). */
function FlashToast() {
  const toast = useToast();
  const pathname = usePathname();
  useEffect(() => {
    const message = consumeFlash();
    if (message) toast.show(message);
  }, [pathname, toast]);
  return null;
}
