import type { ReportCardDto } from "@saferstreets/shared";
import Link from "next/link";
import { Card, IconBubble, StatusChip, cn } from "@/components/ui";
import { CATEGORY_META, STATUS_NAME, peopleConfirmed, reportMeta } from "@/lib/saferoute";

/** A report as one list row: category bubble, title, meta line, status chip (text, never colour alone). */
export function ReportRow({ report, selected }: { report: ReportCardDto; selected?: boolean }) {
  const meta = CATEGORY_META[report.category];
  return (
    <Card
      as={Link}
      href={`/saferoute/${report.id}`}
      interactive
      className={cn("flex items-start gap-3", selected && "border-ink")}
      data-testid="report-row"
    >
      <IconBubble icon={meta.icon} tone="amber" variant="tint" size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-5 font-medium">{report.title}</p>
        <p className="truncate text-[12px] leading-4 text-text-secondary">{reportMeta(report)}</p>
        {report.confirmationCount > 0 ? (
          <p className="text-[12px] leading-4 text-text-secondary">{peopleConfirmed(report.confirmationCount)}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusChip status={STATUS_NAME[report.status]} />
        {report.communityConfirmed ? <StatusChip tone="mint" label="Community-confirmed" icon="verified" /> : null}
      </div>
    </Card>
  );
}

export function ReportRowSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading reports">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-[72px] rounded-card" aria-hidden="true" />
      ))}
    </div>
  );
}
