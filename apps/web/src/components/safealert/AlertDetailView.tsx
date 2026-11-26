"use client";

import type { AlertDto } from "@saferstreets/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Icon,
  Modal,
  Skeleton,
  StatusChip,
  TextArea,
  useToast,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { ALERT_CATEGORY_META, CALL_112_LINE, expiresIn, timeAgo } from "@/lib/safealert";
import { MapView } from "@/map/MapView";
import { EmergencyBanner } from "./Call112";

type AlertResponse = { data: AlertDto };
type Viewer = { role: "USER" | "MODERATOR" | "ADMIN" } | null;
const errMsg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Alert detail: always Unverified until a moderator verifies, with the 112 line and Call 112 always in reach. */
export function AlertDetailView({ id, viewer }: { id: string; viewer: Viewer }) {
  const key = ["alert", id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<AlertResponse>(`/alerts/${id}`),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 2,
  });

  if (q.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState
          title={gone ? "This alert isn't available" : "We couldn't load this alert"}
          description={gone ? "It may have expired or been removed." : "Check your connection and try again."}
          onRetry={() => void q.refetch()}
        />
        <p className="text-center">
          <Link
            href="/safealert"
            className="text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
          >
            Back to alerts
          </Link>
        </p>
      </div>
    );
  }
  return <Loaded alert={q.data.data} viewer={viewer} queryKey={key} />;
}

function Loaded({ alert, viewer, queryKey }: { alert: AlertDto; viewer: Viewer; queryKey: string[] }) {
  const meta = ALERT_CATEGORY_META[alert.category];
  const isStaff = viewer?.role === "MODERATOR" || viewer?.role === "ADMIN";
  const active = alert.status === "ACTIVE" || alert.status === "VERIFIED";

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/safealert"
        className="inline-flex min-h-11 items-center gap-1 text-[14px] leading-5 font-medium text-text-secondary"
      >
        <Icon name="back" size={16} />
        All alerts
      </Link>

      <EmergencyBanner text={CALL_112_LINE} />

      <header className="flex flex-col gap-2">
        <h1 className="type-h1 flex items-center gap-2">
          <Icon name={meta.icon} size={24} />
          {meta.label}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {alert.unverified ? (
            <StatusChip status="Unverified" />
          ) : (
            <StatusChip tone="mint" icon="verified" label="Verified by a moderator" />
          )}
          {alert.status === "RESOLVED" ? <StatusChip status="Resolved" icon="check" /> : null}
          {alert.status === "EXPIRED" ? <StatusChip tone="neutral" label="Expired" /> : null}
          {alert.status === "DISMISSED" ? <StatusChip status="Dismissed" /> : null}
          {alert.status === "REMOVED" ? <StatusChip tone="coral" label="Removed" /> : null}
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] leading-5 text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" size={16} />
            {timeAgo(alert.createdAt)}
          </span>
          {active ? <span>{expiresIn(alert.expiresAt)}</span> : null}
        </p>
      </header>

      {alert.awaitingReview ? (
        <Banner tone="amber-warn" icon="clock">
          A moderator will review this before it is shown to others.
        </Banner>
      ) : null}

      {alert.description ? (
        <p className="text-[16px] leading-6 whitespace-pre-line">{alert.description}</p>
      ) : (
        <Banner tone="neutral" icon="alert">
          Log in to see the details of this alert.
        </Banner>
      )}

      <p className="flex items-center gap-1 text-[14px] leading-5 text-text-secondary">
        <Icon name="saferoute" size={16} />
        {alert.addressText ?? "Approximate location"}
      </p>

      <MapView
        points={[{ id: alert.id, kind: "alert", lat: alert.latitude, lng: alert.longitude, label: meta.label }]}
        center={[alert.longitude, alert.latitude]}
        zoom={alert.coarseLocation ? 14 : 15}
        label="Where this was reported"
      />

      <VoteCard alert={alert} signedIn={viewer !== null} queryKey={queryKey} />
      <ActionsBar alert={alert} signedIn={viewer !== null} queryKey={queryKey} />
      {isStaff ? <ModeratorPanel alert={alert} queryKey={queryKey} /> : null}

      <p className="text-[12px] leading-4 text-text-secondary">
        Community-reported and Unverified unless a moderator says otherwise. We do not contact police or emergency
        services.
      </p>
    </article>
  );
}

function VoteCard({ alert, signedIn, queryKey }: { alert: AlertDto; signedIn: boolean; queryKey: string[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const pathname = usePathname();
  const vote = useMutation({
    mutationFn: (choice: "CONFIRM" | "DISPUTE") =>
      alert.myVote === choice
        ? api(`/alerts/${alert.id}/vote`, { method: "DELETE" })
        : api(`/alerts/${alert.id}/vote`, { method: "POST", body: { vote: choice } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: ["saferoute"] });
    },
    onError: (err) => toast.show(errMsg(err, "We couldn't save your vote. Try again."), "error"),
  });

  const reason = alert.isMine
    ? "You posted this alert, so you can't vote on it."
    : alert.status === "ACTIVE" || alert.status === "VERIFIED"
      ? null
      : "Voting has closed for this alert.";

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="type-h3">Is this still happening?</h2>
        <p className="text-[12px] leading-4 text-text-secondary">
          Votes help others judge an Unverified alert. They are not proof.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={alert.myVote === "CONFIRM" ? "ink" : "secondary"}
          leadingIcon={alert.myVote === "CONFIRM" ? "check" : "thumbUp"}
          aria-pressed={alert.myVote === "CONFIRM"}
          disabled={!alert.canVote}
          loading={vote.isPending && vote.variables === "CONFIRM"}
          onClick={() => vote.mutate("CONFIRM")}
        >
          Confirm ({alert.confirmCount})
        </Button>
        <Button
          variant={alert.myVote === "DISPUTE" ? "ink" : "secondary"}
          leadingIcon={alert.myVote === "DISPUTE" ? "check" : "thumbDown"}
          aria-pressed={alert.myVote === "DISPUTE"}
          disabled={!alert.canVote}
          loading={vote.isPending && vote.variables === "DISPUTE"}
          onClick={() => vote.mutate("DISPUTE")}
        >
          Dispute ({alert.disputeCount})
        </Button>
      </div>
      {!signedIn ? (
        <p className="text-[14px] leading-5">
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
          >
            Log in to confirm or dispute
          </Link>
        </p>
      ) : !alert.canVote && reason ? (
        <p className="text-[14px] leading-5 text-text-secondary" data-testid="vote-reason">
          {reason}
        </p>
      ) : null}
    </Card>
  );
}

function ActionsBar({ alert, signedIn, queryKey }: { alert: AlertDto; signedIn: boolean; queryKey: string[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [resolving, setResolving] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.show("Link copied. Send it to someone you trust.");
    } catch {
      toast.show("We couldn't copy the link. Copy it from the address bar.", "info");
    }
  }

  const resolve = useMutation({
    mutationFn: () => api(`/alerts/${alert.id}/resolve`, { method: "POST" }),
    onSuccess: () => {
      setResolving(false);
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: ["saferoute"] });
      toast.show("Alert marked resolved.");
    },
    onError: (err) => {
      setResolving(false);
      toast.show(errMsg(err, "We couldn't resolve that. Try again."), "error");
    },
  });

  return (
    <Card className="flex flex-col gap-3" data-testid="emergency-actions">
      <h2 className="type-h3">If you need help</h2>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="emergency-solid" leadingIcon="emergency">
          <a href="tel:112">Call 112</a>
        </Button>
        <Button variant="secondary" leadingIcon="share" onClick={() => void copyLink()}>
          Share with someone you trust
        </Button>
        {alert.canResolve ? (
          <Button variant="secondary" leadingIcon="check" onClick={() => setResolving(true)}>
            Resolve
          </Button>
        ) : null}
        {signedIn && !alert.isMine ? <FlagAction alertId={alert.id} /> : null}
      </div>
      <ConfirmDialog
        open={resolving}
        onOpenChange={setResolving}
        title="Mark this alert as resolved?"
        description="It stops showing in the feed for others."
        confirmLabel="Mark resolved"
        loading={resolve.isPending}
        onConfirm={() => resolve.mutate()}
      />
    </Card>
  );
}

function FlagAction({ alertId }: { alertId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const flag = useMutation({
    mutationFn: () =>
      api("/flags", { method: "POST", body: { targetType: "ALERT", targetId: alertId, reason: reason.trim() } }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      toast.show("Report sent. A moderator will take a look.");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setOpen(false);
        toast.show("You've already reported this alert.", "info");
      } else toast.show(errMsg(err, "We couldn't send that. Try again."), "error");
    },
  });
  const valid = reason.trim().length >= 3 && reason.trim().length <= 300;
  return (
    <>
      <Button variant="secondary" leadingIcon="flag" onClick={() => setOpen(true)}>
        Report alert
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Report this alert"
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
            Send report
          </Button>
        </form>
      </Modal>
    </>
  );
}

type ModStatus = "VERIFIED" | "DISMISSED" | "REMOVED";

function ModeratorPanel({ alert, queryKey }: { alert: AlertDto; queryKey: string[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Exclude<ModStatus, "VERIFIED"> | null>(null);
  const valid = reason.trim().length >= 3 && reason.trim().length <= 300;

  const change = useMutation({
    mutationFn: (status: ModStatus) =>
      api(`/admin/alerts/${alert.id}/status`, { method: "PATCH", body: { status, reason: reason.trim() } }),
    onSuccess: () => {
      setReason("");
      setError(null);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: ["saferoute"] });
      toast.show("Alert updated.");
    },
    onError: (err) => {
      setConfirm(null);
      setError(errMsg(err, "We couldn't update the alert. Try again."));
    },
  });

  function pick(status: ModStatus) {
    if (!valid) {
      setError("Add a reason of 3 to 300 characters.");
      return;
    }
    setError(null);
    if (status === "VERIFIED") change.mutate(status);
    else setConfirm(status);
  }

  return (
    <Card border="periwinkle-border" className="flex flex-col gap-3" data-testid="moderator-panel">
      <h2 className="type-h3">Moderator</h2>
      <TextArea
        label="Reason"
        hint="Required. Moderators and the audit log see this."
        maxLength={300}
        counter={{ value: reason.length, max: 300 }}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error ? (
        <Banner tone="amber-warn" icon="alert">
          {error}
        </Banner>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button leadingIcon="verified" loading={change.isPending && !confirm} onClick={() => pick("VERIFIED")}>
          Verify
        </Button>
        <Button variant="secondary" onClick={() => pick("DISMISSED")}>
          Dismiss
        </Button>
        <Button variant="emergency" leadingIcon="trash" onClick={() => pick("REMOVED")}>
          Remove
        </Button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "REMOVED" ? "Remove this alert?" : "Dismiss this alert?"}
        description={
          confirm === "REMOVED"
            ? "It is hidden from everyone. This counts against the author."
            : "It is closed as not credible. This counts against the author."
        }
        confirmLabel={confirm === "REMOVED" ? "Remove alert" : "Dismiss alert"}
        destructive
        loading={change.isPending}
        onConfirm={() => confirm && change.mutate(confirm)}
      />
    </Card>
  );
}
