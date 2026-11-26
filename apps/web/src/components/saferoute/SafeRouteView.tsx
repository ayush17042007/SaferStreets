"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ReportsExplorer } from "./ReportsExplorer";
import { RouteComparer } from "./RouteComparer";

export function SafeRouteView() {
  const [tab, setTab] = useState<"routes" | "reports">("routes");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="type-h1">SafeRoute</h1>
          <p className="text-[14px] leading-5 text-text-secondary">
            Compare route alternatives using real safety reports, or explore issues reported nearby.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-control border border-line bg-card p-1" role="tablist" aria-label="SafeRoute mode">
            <Button
              type="button"
              role="tab"
              aria-selected={tab === "routes"}
              size="mobile"
              variant={tab === "routes" ? "ink" : "secondary"}
              onClick={() => setTab("routes")}
            >
              Find safe route
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={tab === "reports"}
              size="mobile"
              variant={tab === "reports" ? "ink" : "secondary"}
              onClick={() => setTab("reports")}
            >
              Explore incidents
            </Button>
          </div>
          <Button asChild variant="amber" size="mobile">
            <Link href="/saferoute/new">Report an issue</Link>
          </Button>
        </div>
      </header>

      {tab === "routes" ? <RouteComparer /> : <ReportsExplorer />}
    </div>
  );
}
