"use client";

import type { ReportCategory, ReportDetailDto, ReportStatus } from "@saferstreets/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Icon,
  Modal,
  Select,
  Skeleton,
  StatusChip,
  TextArea,
  TextField,
  Timeline,
  useToast,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  NEXT_STATUSES,
  STATUS_ACTION,
  STATUS_NAME,
  formatDateTime,
  peopleConfirmed,
} from "@/lib/saferoute";
import { MapView } from "@/map/MapView";

export interface Viewer {
  role: "USER" | "MODERATOR" | "ADMIN";
}

type ReportResponse = { data: ReportDetailDto };
type ConfirmResponse = { data: { confirmationCount: number; confirmedByMe: boolean; communityConfirmed: boolean } };

const errMsg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** S8: report detail for guests, signed-in users, owners and moderators. The API decides what each may see or do. */
export function ReportDetailView({ id, viewer }: { id: string; viewer: Viewer | null }) {
  const key = ["report", id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<ReportResponse>(`/reports/${id}`),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 2,
  });

  if (q.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-56" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState
          title={gone ? "This report isn't available" : "We couldn't load this report"}
          description={
            gone ? "It may have been removed, or it isn't visible to you." : "Check your connection and try again."
          }
          onRetry={() => void q.refetch()}
        />
        <p className="text-center">
          <Link
            href="/saferoute"
            className="text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
          >
            Back to reports
          </Link>
        </p>
      </div>
    );
  }
  return <Loaded report={q.data.data} viewer={viewer} queryKey={key} />;
}

function Loaded({ report, viewer, queryKey }: { report: ReportDetailDto; viewer: Viewer | null; queryKey: string[] }) {
  const meta = CATEGORY_META[report.category];
  const isStaff = viewer?.role === "MODERATOR" || viewer?.role === "ADMIN";
  const history = [...report.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link
        href="/saferoute"
        className="inline-flex min-h-11 items-center gap-1 text-[14px] leading-5 font-medium text-text-secondary"
      >
        <Icon name="back" size={16} />
        All reports
      </Link>

      {report.photos.length > 0 ? (
        <ul
          aria-label="Photos"
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-card"
          data-testid="photo-carousel"
        >
          {report.photos.map((p) => (
            <li key={p.url} className="w-full shrink-0 snap-center md:w-[calc(50%-4px)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.alt}
                className="aspect-[4/3] w-full rounded-card border border-line object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <header className="flex flex-col gap-2">
        <h1 className="type-h1">{report.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[14px] leading-5 font-medium">
            <Icon name={meta.icon} size={18} />
            {meta.label}
          </span>
          <StatusChip status={STATUS_NAME[report.status]} />
          {report.communityConfirmed ? <StatusChip tone="mint" label="Community-confirmed" icon="verified" /> : null}
          {report.status === "SUBMITTED" ? <StatusChip status="Unverified" /> : null}
        </div>
        {report.addressText ? (
          <p className="flex items-center gap-1 text-[14px] leading-5 text-text-secondary">
            <Icon name="saferoute" size={16} />
            {report.addressText}
          </p>
        ) : null}
        {report.author ? (
          <p className="text-[12px] leading-4 text-text-secondary">Reported by {report.author.name ?? "a member"}</p>
        ) : null}
      </header>

      <p className="text-[16px] leading-6 whitespace-pre-line">{report.description}</p>

      {report.moderatorNote ? (
        <Banner icon="verified" title="Moderator note">
          {report.moderatorNote}
        </Banner>
      ) : null}

      <MapView
        points={[{ id: report.id, kind: "report", lat: report.latitude, lng: report.longitude, label: report.title }]}
        center={[report.longitude, report.latitude]}
        zoom={15}
        label="Where this was reported"
      />

      <ConfirmSection report={report} viewer={viewer} queryKey={queryKey} />

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3">Progress</h2>
        <Timeline
          entries={history.map((h) => ({
            title: STATUS_NAME[h.toStatus as ReportStatus] ?? h.toStatus,
            time: `${formatDateTime(h.createdAt)}${h.by ? ` · ${h.by}` : ""}`,
            ...(h.note ? { note: h.note } : {}),
          }))}
        />
      </Card>

      {isStaff ? <ModeratorPanel report={report} queryKey={queryKey} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {report.canEdit ? <OwnerActions report={report} queryKey={queryKey} /> : null}
        {viewer ? <FlagAction reportId={report.id} /> : null}
      </div>
    </article>
  );
}

function ConfirmSection({
  report,
  viewer,
  queryKey,
}: {
  report: ReportDetailDto;
  viewer: Viewer | null;
  queryKey: string[];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const pathname = usePathname();
  const toggle = useMutation({
    mutationFn: () =>
      api<ConfirmResponse>(`/reports/${report.id}/confirm`, { method: report.confirmedByMe ? "DELETE" : "POST" }),
    onSuccess: (res) => {
      qc.setQueryData<ReportResponse>(queryKey, (old) => (old ? { data: { ...old.data, ...res.data } } : old));
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err) => toast.show(errMsg(err, "We couldn't update that. Try again."), "error"),
  });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-display text-[22px] leading-7 font-semibold" data-testid="confirm-count">
          {peopleConfirmed(report.confirmationCount)}
        </p>
        <p className="text-[12px] leading-4 text-text-secondary">
          Confirmations help moderators see which issues matter most.
        </p>
      </div>
      {!viewer ? (
        <Button asChild variant="secondary">
          <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Log in to confirm</Link>
        </Button>
      ) : report.canConfirm ? (
        report.confirmedByMe ? (
          <div className="flex items-center gap-3">
            <StatusChip tone="mint" label="Confirmed" icon="check" />
            <button
              type="button"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
              className="inline-flex min-h-11 items-center text-[14px] leading-5 font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[3px]"
            >
              Undo
            </button>
          </div>
        ) : (
          <Button loading={toggle.isPending} onClick={() => toggle.mutate()}>
            Confirm this issue
          </Button>
        )
      ) : report.isMine ? (
        <p className="text-[14px] leading-5 text-text-secondary">You filed this report.</p>
      ) : null}
    </Card>
  );
}

function FlagAction({ reportId }: { reportId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const flag = useMutation({
    mutationFn: () =>
      api("/flags", { method: "POST", body: { targetType: "REPORT", targetId: reportId, reason: reason.trim() } }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      toast.show("Thanks. A moderator will take a look.");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setOpen(false);
        toast.show("You've already flagged this report.", "info");
      } else toast.show(errMsg(err, "We couldn't send that. Try again."), "error");
    },
  });
  const valid = reason.trim().length >= 3 && reason.trim().length <= 300;
  return (
    <>
      <Button variant="secondary" leadingIcon="flag" onClick={() => setOpen(true)}>
        Flag
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Flag this report"
        description="Tell moderators what is wrong. Only moderators see your reason."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) flag.mutate();
          }}
        >
          <TextArea
            label="Reason"
            maxLength={300}
            counter={{ value: reason.length, max: 300 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" disabled={!valid} loading={flag.isPending} fullWidth>
            Send flag
          </Button>
        </form>
      </Modal>
    </>
  );
}

function OwnerActions({ report, queryKey }: { report: ReportDetailDto; queryKey: string[] }) {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [category, setCategory] = useState<ReportCategory>(report.category);
  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description);
  const [address, setAddress] = useState(report.addressText ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api<ReportResponse>(`/reports/${report.id}`, {
        method: "PATCH",
        body: {
          version: report.version,
          category,
          title: title.trim(),
          description: description.trim(),
          ...(address.trim() ? { addressText: address.trim() } : {}),
        },
      }),
    onSuccess: (res) => {
      qc.setQueryData(queryKey, res);
      void qc.invalidateQueries({ queryKey: ["reports"] });
      setEditing(false);
      toast.show("Report updated.");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) void qc.invalidateQueries({ queryKey });
      setFormError(errMsg(err, "We couldn't save your changes. Try again."));
    },
  });

  const del = useMutation({
    mutationFn: () => api(`/reports/${report.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports"] });
      setFlash("Report deleted.");
      router.push("/saferoute/mine");
    },
    onError: (err) => {
      setDeleting(false);
      toast.show(errMsg(err, "We couldn't delete that. Try again."), "error");
    },
  });

  const titleOk = title.trim().length >= 5 && title.trim().length <= 80;
  const descOk = description.trim().length >= 10 && description.trim().length <= 1000;

  return (
    <>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button variant="emergency" onClick={() => setDeleting(true)}>
        Delete
      </Button>

      <Modal
        open={editing}
        onOpenChange={setEditing}
        title="Edit report"
        description="You can edit until a moderator reviews it."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            if (titleOk && descOk) save.mutate();
          }}
        >
          <Select
            label="Category"
            value={category}
            onValueChange={(v) => setCategory(v as ReportCategory)}
            options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
          />
          <TextField
            label="Title"
            maxLength={80}
            value={title}
            error={titleOk ? undefined : "Use 5 to 80 characters."}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextArea
            label="Description"
            maxLength={1000}
            counter={{ value: description.length, max: 1000 }}
            value={description}
            error={descOk ? undefined : "Use 10 to 1000 characters."}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            label="Address"
            optional
            maxLength={200}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          {formError ? (
            <Banner tone="amber-warn" icon="alert">
              {formError}
            </Banner>
          ) : null}
          <Button type="submit" fullWidth disabled={!titleOk || !descOk} loading={save.isPending}>
            Save changes
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this report?"
        description="This can't be undone."
        confirmLabel="Delete report"
        destructive
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}

function ModeratorPanel({ report, queryKey }: { report: ReportDetailDto; queryKey: string[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const options = NEXT_STATUSES[report.status];
  const [status, setStatus] = useState<ReportStatus | "">("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const needsNote = status === "REJECTED";

  const change = useMutation({
    mutationFn: () =>
      api<ReportResponse>(`/admin/reports/${report.id}/status`, {
        method: "PATCH",
        body: { status, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: (res) => {
      qc.setQueryData(queryKey, res);
      void qc.invalidateQueries({ queryKey: ["reports"] });
      setStatus("");
      setNote("");
      setFormError(null);
      toast.show("Status updated.");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) void qc.invalidateQueries({ queryKey });
      setFormError(errMsg(err, "We couldn't update the status. Try again."));
    },
  });

  return (
    <Card border="periwinkle-border" className="flex flex-col gap-3" data-testid="moderator-panel">
      <h2 className="type-h3">Moderator</h2>
      {options.length === 0 ? (
        <p className="text-[14px] leading-5 text-text-secondary">This report is closed. No further status changes.</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!status) return;
            if (needsNote && !note.trim()) {
              setFormError("Add a note for the person who reported this.");
              return;
            }
            setFormError(null);
            change.mutate();
          }}
        >
          <Select
            label="Next status"
            placeholder="Choose an action"
            value={status}
            onValueChange={(v) => setStatus(v as ReportStatus)}
            options={options.map((s) => ({ value: s, label: STATUS_ACTION[s] }))}
          />
          <TextArea
            label="Note"
            optional={!needsNote}
            hint={needsNote ? "Required when rejecting. The author sees this note." : undefined}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {formError ? (
            <Banner tone="amber-warn" icon="alert">
              {formError}
            </Banner>
          ) : null}
          <Button type="submit" disabled={!status} loading={change.isPending}>
            Update status
          </Button>
        </form>
      )}
    </Card>
  );
}
