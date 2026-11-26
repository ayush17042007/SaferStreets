"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

// The draft lives in localStorage, so the wizard renders on the client only.
const NewReportWizard = dynamic(() => import("@/components/saferoute/NewReportWizard"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4" aria-busy="true">
      <Skeleton className="h-11" />
      <Skeleton className="h-64" />
    </div>
  ),
});

export default function NewReportPage() {
  return <NewReportWizard />;
}
