"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, ErrorState, Skeleton, TextField, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { PageHeading, ReasonDialog } from "./kit";

interface Region {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}
interface EmergencyNumberRow {
  key: string;
  label: string;
  number: string;
}
type Thresholds = Record<string, number>;
interface SettingsDto {
  serviceRegion: Region;
  emergencyNumbers: EmergencyNumberRow[];
  thresholds: Thresholds;
}

const REGION_FIELDS: Array<[keyof Region, string]> = [
  ["minLat", "South edge (min latitude)"],
  ["maxLat", "North edge (max latitude)"],
  ["minLng", "West edge (min longitude)"],
  ["maxLng", "East edge (max longitude)"],
];

const THRESHOLD_LABELS: Record<string, string> = {
  reportConfirmations: "Confirmations for the community-confirmed badge",
  journeyOverdueMinutes: "Journey overdue after ETA (minutes)",
  journeyEscalationMinutesDefault: "Default contact escalation (minutes)",
  alertExpiryHours: "Alert expiry (hours)",
  alertMinAccountAgeHours: "Minimum account age to post an alert (hours)",
  alertDismissStrikeLimit: "Dismissed alerts before a suspension",
  duplicateReportRadiusM: "Duplicate report radius (metres)",
  duplicateAlertRadiusM: "Duplicate alert radius (metres)",
  duplicateAlertWindowMinutes: "Duplicate alert window (minutes)",
};

type Key = "serviceRegion" | "emergencyNumbers" | "thresholds";

export function AdminSettingsView() {
  const q = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api<{ data: SettingsDto }>("/admin/settings").then((r) => r.data),
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Settings" />
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <SettingsForms data={q.data} />
      )}
    </div>
  );
}

function SettingsForms({ data }: { data: SettingsDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [region, setRegion] = useState<Record<keyof Region, string>>({
    minLat: String(data.serviceRegion.minLat),
    maxLat: String(data.serviceRegion.maxLat),
    minLng: String(data.serviceRegion.minLng),
    maxLng: String(data.serviceRegion.maxLng),
  });
  const [numbers, setNumbers] = useState<EmergencyNumberRow[]>(data.emergencyNumbers.map((n) => ({ ...n })));
  const [thr, setThr] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(data.thresholds).map(([k, v]) => [k, String(v)])),
  );
  const [saving, setSaving] = useState<Key | null>(null);

  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

  function valueFor(key: Key): unknown {
    if (key === "serviceRegion")
      return {
        minLat: num(region.minLat),
        maxLat: num(region.maxLat),
        minLng: num(region.minLng),
        maxLng: num(region.maxLng),
      };
    if (key === "emergencyNumbers") return numbers;
    return Object.fromEntries(Object.entries(thr).map(([k, v]) => [k, num(v)]));
  }

  async function save(reason: string) {
    if (!saving) return;
    await api(`/admin/settings/${saving}`, { method: "PUT", body: { value: valueFor(saving), reason } });
    toast.show("Setting saved.");
    await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
  }

  const titles: Record<Key, string> = {
    serviceRegion: "Save service region?",
    emergencyNumbers: "Save emergency numbers?",
    thresholds: "Save thresholds?",
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="type-h2">Service region</h2>
        <p className="text-[14px] leading-5 text-text-secondary">
          Reports, rides and alerts must fall inside this box.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {REGION_FIELDS.map(([k, label]) => (
            <TextField
              key={k}
              label={label}
              inputMode="decimal"
              value={region[k]}
              onChange={(e) => setRegion({ ...region, [k]: e.target.value })}
            />
          ))}
        </div>
        <div>
          <Button size="mobile" onClick={() => setSaving("serviceRegion")}>
            Save region
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h2">Emergency numbers</h2>
        <p className="text-[14px] leading-5 text-text-secondary">
          Shown in the emergency menu. Verify each number before launch.
        </p>
        <ul className="flex flex-col gap-3">
          {numbers.map((n, i) => (
            <li key={`${n.key}-${i}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
              <TextField
                label="Key"
                hint="Letters and digits"
                value={n.key}
                onChange={(e) => setNumbers(numbers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
              />
              <TextField
                label="Label"
                value={n.label}
                onChange={(e) => setNumbers(numbers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <TextField
                label="Number"
                inputMode="numeric"
                value={n.number}
                onChange={(e) => setNumbers(numbers.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))}
              />
              <Button
                variant="secondary"
                size="mobile"
                disabled={numbers.length <= 1}
                onClick={() => setNumbers(numbers.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="mobile"
            onClick={() => setNumbers([...numbers, { key: "", label: "", number: "" }])}
          >
            Add number
          </Button>
          <Button size="mobile" onClick={() => setSaving("emergencyNumbers")}>
            Save numbers
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h2">Thresholds</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.keys(thr).map((k) => (
            <TextField
              key={k}
              label={THRESHOLD_LABELS[k] ?? k}
              inputMode="numeric"
              value={thr[k] ?? ""}
              onChange={(e) => setThr({ ...thr, [k]: e.target.value })}
            />
          ))}
        </div>
        <div>
          <Button size="mobile" onClick={() => setSaving("thresholds")}>
            Save thresholds
          </Button>
        </div>
      </Card>
      <ReasonDialog
        open={saving !== null}
        onOpenChange={(o) => !o && setSaving(null)}
        title={saving ? titles[saving] : ""}
        description="The change applies right away and is recorded with your reason in the audit log."
        confirmLabel="Save"
        onSubmit={save}
      />
    </div>
  );
}
