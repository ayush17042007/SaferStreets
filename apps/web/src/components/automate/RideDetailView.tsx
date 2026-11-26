"use client";

import * as Popover from "@radix-ui/react-popover";
import {
  MAX_FARE,
  MAX_SEATS,
  MIN_FARE,
  MIN_SEATS,
  type RideDetailDto,
  type RideMemberDto,
  type RideRequestDto,
} from "@saferstreets/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Avatar,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DateTimePicker,
  ErrorState,
  Icon,
  Modal,
  Select,
  Skeleton,
  StatusChip,
  TextArea,
  TextField,
  useToast,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import {
  RIDE_STATUS_LABEL,
  RIDE_STATUS_NAME,
  formatRideTime,
  formatRupees,
  isoToIstInput,
  istInputToIso,
  istInputValue,
  perPersonPreview,
  seatsLabel,
} from "@/lib/automate";

type RideResponse = { data: RideDetailDto };

const errMsg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** S12: ride detail. The API decides what each viewer may see; the buttons mirror canEdit / canRequest. */
export function RideDetailView({ id, viewerId }: { id: string; viewerId: string | null }) {
  const key = ["ride", id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<RideResponse>(`/rides/${id}`),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 2,
  });

  if (q.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState
          title={gone ? "This ride isn't available" : "We couldn't load this ride"}
          description={
            gone ? "It may have been removed, or it isn't visible to you." : "Check your connection and try again."
          }
          onRetry={() => void q.refetch()}
        />
        <p className="text-center">
          <Link
            href="/automate"
            className="text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
          >
            Back to rides
          </Link>
        </p>
      </div>
    );
  }
  return <Loaded ride={q.data.data} viewerId={viewerId} queryKey={key} />;
}

function useRideAction<T = unknown>(
  ride: RideDetailDto,
  queryKey: string[],
  run: (arg: T) => Promise<unknown>,
  opts: { done?: string; onDone?: () => void; conflict?: string } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      if (opts.done) toast.show(opts.done);
      opts.onDone?.();
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["ride-requests", ride.id] });
      void qc.invalidateQueries({ queryKey: ["rides"] });
      void qc.invalidateQueries({ queryKey: ["my-rides"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && opts.conflict) toast.show(opts.conflict, "info");
      else toast.show(errMsg(err, "We couldn't do that. Try again."), "error");
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["ride-requests", ride.id] });
    },
  });
}

function Loaded({ ride, viewerId, queryKey }: { ride: RideDetailDto; viewerId: string | null; queryKey: string[] }) {
  const signedIn = viewerId !== null;
  const params = useSearchParams();
  const closed = ride.status === "COMPLETED" || ride.status === "CANCELLED";
  const host = ride.members.find((m) => m.role === "host");
  const others = ride.members.filter((m) => m.role === "rider");
  const share = perPersonPreview(ride.estimatedTotalFare, ride.seatsTotal);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link
        href="/automate"
        className="inline-flex min-h-11 items-center gap-1 text-[14px] leading-5 font-medium text-text-secondary"
      >
        <Icon name="back" size={16} />
        All rides
      </Link>

      {params.get("created") === "1" ? (
        <Banner tone="neutral" icon="verified" title="Ride offered">
          Riders can now ask to join. You will be notified when someone does.
        </Banner>
      ) : null}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            status={RIDE_STATUS_NAME[ride.status]}
            label={RIDE_STATUS_LABEL[ride.status]}
            icon={ride.status === "COMPLETED" ? "check" : undefined}
          />
          {ride.status === "OPEN" ? <StatusChip tone="mint" label={seatsLabel(ride.seatsLeft)} /> : null}
          {ride.isMine ? <StatusChip tone="periwinkle" label="You are the host" /> : null}
          {ride.joined ? <StatusChip tone="mint" label="You are riding" /> : null}
        </div>
        <h1 className="type-h1">{formatRideTime(ride.departureAt)}</h1>
        <ol aria-label="Route" className="flex flex-col gap-1 text-[16px] leading-6">
          <li className="flex items-start gap-2">
            <Icon name="saferoute" size={18} className="mt-1 shrink-0 text-text-secondary" />
            <span>
              <span className="sr-only">From </span>
              {ride.sourceText}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Icon name="arrow" size={18} className="mt-1 shrink-0 text-text-secondary" />
            <span>
              <span className="sr-only">To </span>
              {ride.destText}
            </span>
          </li>
        </ol>
      </header>

      {ride.status === "CANCELLED" ? (
        <Banner tone="neutral" icon="alert" title="This ride was cancelled">
          {ride.cancelReason ?? "The host did not give a reason."}
        </Banner>
      ) : null}

      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-display text-[28px] leading-8 font-semibold" data-testid="per-person-fare">
              {formatRupees(ride.perPersonFare)}
              <span className="ml-1 text-[14px] leading-5 font-normal text-text-secondary">each, est.</span>
            </p>
            <p className="text-[14px] leading-5 text-text-secondary">
              Total {formatRupees(ride.estimatedTotalFare)} for the auto, shared by the host and up to {ride.seatsTotal}{" "}
              {ride.seatsTotal === 1 ? "rider" : "riders"} ({formatRupees(share)} each when full).
            </p>
          </div>
        </div>
        <p className="text-[12px] leading-4 text-text-secondary">
          Fare is shared between riders in cash, outside SaferStreets. There is no chat and no payment in the app.
        </p>
      </Card>

      {ride.note ? (
        <Card>
          <h2 className="type-h3">Note from the host</h2>
          <p className="mt-1 text-[16px] leading-6 whitespace-pre-line">{ride.note}</p>
        </Card>
      ) : null}

      <ActionCard ride={ride} signedIn={signedIn} queryKey={queryKey} closed={closed} />

      {ride.isMine && !closed ? <RequestsCard ride={ride} queryKey={queryKey} /> : null}

      {signedIn && ride.members.length > 0 ? (
        <MembersCard ride={ride} host={host} riders={others} viewerId={viewerId} />
      ) : ride.host ? (
        <Card className="flex items-center gap-3">
          <Avatar name={ride.host.displayName} imageUrl={ride.host.avatarUrl} size={40} />
          <p className="text-[14px] leading-5">
            <span className="font-medium">{ride.host.displayName}</span> is driving.{" "}
            <span className="text-text-secondary">{ride.host.completedRides} rides completed.</span>
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-[14px] leading-5 text-text-secondary">Log in to see who is driving.</p>
        </Card>
      )}
    </article>
  );
}

function ActionCard({
  ride,
  signedIn,
  queryKey,
  closed,
}: {
  ride: RideDetailDto;
  signedIn: boolean;
  queryKey: string[];
  closed: boolean;
}) {
  const [requesting, setRequesting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");

  const request = useRideAction(
    ride,
    queryKey,
    () =>
      api(`/rides/${ride.id}/requests`, { method: "POST", body: message.trim() ? { message: message.trim() } : {} }),
    {
      done: "Request sent. The host will reply here and by email.",
      onDone: () => setRequesting(false),
      conflict: "You've already asked to join, or the ride is full.",
    },
  );
  const withdraw = useRideAction(ride, queryKey, () => api(`/rides/${ride.id}/requests/mine`, { method: "DELETE" }), {
    done: "Request withdrawn.",
  });
  const leave = useRideAction(ride, queryKey, () => api(`/rides/${ride.id}/leave`, { method: "POST" }), {
    done: "You left the ride.",
    onDone: () => setLeaving(false),
  });
  const start = useRideAction(ride, queryKey, () => api(`/rides/${ride.id}/start`, { method: "POST" }), {
    done: "Ride marked as started.",
  });
  const complete = useRideAction(ride, queryKey, () => api(`/rides/${ride.id}/complete`, { method: "POST" }), {
    done: "Ride marked as completed.",
  });
  const cancel = useRideAction(
    ride,
    queryKey,
    () => api(`/rides/${ride.id}/cancel`, { method: "POST", body: { reason: reason.trim() } }),
    { done: "Ride cancelled. Riders will be told.", onDone: () => setCancelling(false) },
  );

  let body: ReactNode;
  if (!signedIn) {
    body = (
      <>
        <p className="text-[14px] leading-5 text-text-secondary">Log in to ask to join this ride.</p>
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent(`/automate/${ride.id}`)}`}>Log in to request</Link>
        </Button>
      </>
    );
  } else if (ride.isMine) {
    body = closed ? (
      <p className="text-[14px] leading-5 text-text-secondary">
        This ride is {RIDE_STATUS_LABEL[ride.status].toLowerCase()}.
      </p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {ride.status === "IN_PROGRESS" ? (
          <Button loading={complete.isPending} onClick={() => complete.mutate(undefined)}>
            Complete ride
          </Button>
        ) : (
          <Button loading={start.isPending} onClick={() => start.mutate(undefined)} disabled={ride.members.length < 2}>
            Start ride
          </Button>
        )}
        {ride.canEdit ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
        {ride.status !== "IN_PROGRESS" ? (
          <Button variant="emergency" onClick={() => setCancelling(true)}>
            Cancel ride
          </Button>
        ) : null}
        {ride.status !== "IN_PROGRESS" && ride.members.length < 2 ? (
          <p className="w-full text-[12px] leading-4 text-text-secondary">
            Start is available once at least one rider has joined. You can edit until the first request is accepted.
          </p>
        ) : null}
      </div>
    );
  } else if (ride.joined) {
    body = closed ? (
      <p className="text-[14px] leading-5 text-text-secondary">
        This ride is {RIDE_STATUS_LABEL[ride.status].toLowerCase()}.
      </p>
    ) : (
      <>
        <p className="text-[14px] leading-5">You are on this ride. Contact details are in the list below.</p>
        {ride.status !== "IN_PROGRESS" ? (
          <Button variant="emergency" onClick={() => setLeaving(true)}>
            Leave ride
          </Button>
        ) : null}
      </>
    );
  } else if (ride.myRequest === "PENDING") {
    body = (
      <>
        <div className="flex items-center gap-2">
          <StatusChip tone="amber" label="Request pending" icon="clock" />
          <p className="text-[14px] leading-5 text-text-secondary">Waiting for the host.</p>
        </div>
        <Button variant="secondary" loading={withdraw.isPending} onClick={() => withdraw.mutate(undefined)}>
          Withdraw request
        </Button>
      </>
    );
  } else if (ride.myRequest === "REJECTED") {
    body = <StatusChip status="Rejected" label="Request declined" />;
  } else if (ride.canRequest) {
    body = (
      <Button onClick={() => setRequesting(true)} trailingArrow>
        Request to join
      </Button>
    );
  } else if (ride.status === "FULL") {
    body = (
      <Button variant="secondary" disabled>
        Full
      </Button>
    );
  } else {
    body = <p className="text-[14px] leading-5 text-text-secondary">You can&apos;t request this ride right now.</p>;
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="ride-actions">
      {body}

      <Modal
        open={requesting}
        onOpenChange={setRequesting}
        title="Request to join"
        description="The host sees your name and your message. Your phone number is shared only if they accept."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate(undefined);
          }}
        >
          <TextArea
            label="Message"
            optional
            maxLength={300}
            counter={{ value: message.length, max: 300 }}
            hint="For example, where exactly you will wait."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button type="submit" loading={request.isPending} fullWidth>
            Send request
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave this ride?"
        description="Your seat goes back to the list and the host is told."
        confirmLabel="Leave ride"
        destructive
        loading={leave.isPending}
        onConfirm={() => leave.mutate(undefined)}
      />

      <Modal
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this ride?"
        description="Everyone on the ride is told, with your reason."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3) cancel.mutate(undefined);
          }}
        >
          <TextArea
            label="Reason"
            maxLength={300}
            counter={{ value: reason.length, max: 300 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="submit"
            variant="emergency"
            disabled={reason.trim().length < 3}
            loading={cancel.isPending}
            fullWidth
          >
            Cancel ride
          </Button>
        </form>
      </Modal>

      {editing ? <EditDialog ride={ride} queryKey={queryKey} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function EditDialog({ ride, queryKey, onClose }: { ride: RideDetailDto; queryKey: string[]; onClose: () => void }) {
  const [when, setWhen] = useState(isoToIstInput(ride.departureAt));
  const [seats, setSeats] = useState(String(ride.seatsTotal));
  const [fare, setFare] = useState(String(ride.estimatedTotalFare));
  const [note, setNote] = useState(ride.note ?? "");
  const fareNum = Number(fare);
  const fareOk = Number.isInteger(fareNum) && fareNum >= MIN_FARE && fareNum <= MAX_FARE;

  const save = useRideAction(
    ride,
    queryKey,
    () => {
      const body: Record<string, unknown> = { version: ride.version };
      if (when && istInputToIso(when) !== new Date(ride.departureAt).toISOString())
        body.departureAt = istInputToIso(when);
      if (Number(seats) !== ride.seatsTotal) body.seatsTotal = Number(seats);
      if (fareNum !== ride.estimatedTotalFare) body.estimatedTotalFare = fareNum;
      if (note.trim() !== (ride.note ?? "")) body.note = note.trim() || null;
      if (Object.keys(body).length === 1)
        return Promise.reject(new ApiError(0, "VALIDATION_ERROR", "Nothing to change."));
      return api(`/rides/${ride.id}`, { method: "PATCH", body });
    },
    { done: "Ride updated.", onDone: onClose, conflict: "Someone changed this ride. It has been reloaded." },
  );

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit ride"
      description="Changes are possible until a request is accepted."
    >
      <form
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (fareOk) save.mutate(undefined);
        }}
      >
        <DateTimePicker
          label="Departure (India time)"
          min={istInputValue()}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <Select
          label="Seats offered"
          value={seats}
          onValueChange={setSeats}
          options={Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => ({
            value: String(MIN_SEATS + i),
            label: String(MIN_SEATS + i),
          }))}
        />
        <TextField
          label="Total fare (INR)"
          type="number"
          inputMode="numeric"
          value={fare}
          onChange={(e) => setFare(e.target.value)}
          error={
            fareOk ? undefined : `Enter a whole number from ${formatRupees(MIN_FARE)} to ${formatRupees(MAX_FARE)}.`
          }
        />
        <TextArea label="Note" optional maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" loading={save.isPending} disabled={!fareOk} fullWidth>
          Save changes
        </Button>
      </form>
    </Modal>
  );
}

function RequestsCard({ ride, queryKey }: { ride: RideDetailDto; queryKey: string[] }) {
  const q = useQuery({
    queryKey: ["ride-requests", ride.id],
    queryFn: () => api<{ data: RideRequestDto[] }>(`/rides/${ride.id}/requests`),
  });
  const pending = (q.data?.data ?? []).filter((r) => r.status === "PENDING");
  const full = ride.seatsLeft <= 0;

  return (
    <Card className="flex flex-col gap-3" data-testid="requests-card">
      <h2 className="type-h3">Requests</h2>
      {q.isPending ? (
        <Skeleton className="h-16" />
      ) : q.isError ? (
        <p className="text-[14px] leading-5 text-text-secondary">
          We couldn&apos;t load requests. Reload to try again.
        </p>
      ) : pending.length === 0 ? (
        <p className="text-[14px] leading-5 text-text-secondary">No pending requests.</p>
      ) : (
        <>
          {full ? (
            <p className="text-[14px] leading-5 text-text-secondary">
              All seats are taken. Reject the rest or wait for someone to leave.
            </p>
          ) : null}
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((r) => (
              <RequestRow key={r.id} ride={ride} request={r} full={full} queryKey={queryKey} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function RequestRow({
  ride,
  request,
  full,
  queryKey,
}: {
  ride: RideDetailDto;
  request: RideRequestDto;
  full: boolean;
  queryKey: string[];
}) {
  const accept = useRideAction(
    ride,
    queryKey,
    () => api(`/rides/${ride.id}/requests/${request.id}/accept`, { method: "POST" }),
    {
      done: `${request.rider.displayName} is on the ride.`,
      conflict: "No seats left",
    },
  );
  const reject = useRideAction(
    ride,
    queryKey,
    () => api(`/rides/${ride.id}/requests/${request.id}/reject`, { method: "POST" }),
    {
      done: "Request declined.",
    },
  );
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-testid="request-row">
      <div className="flex items-center gap-3">
        <Avatar name={request.rider.displayName} imageUrl={request.rider.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-medium">{request.rider.displayName}</p>
          {request.message ? <p className="text-[14px] leading-5 text-text-secondary">{request.message}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={full} loading={accept.isPending} onClick={() => accept.mutate(undefined)}>
          Accept
        </Button>
        <Button size="sm" variant="secondary" loading={reject.isPending} onClick={() => reject.mutate(undefined)}>
          Reject
        </Button>
        {full ? <span className="self-center text-[12px] leading-4 text-text-secondary">No seats left</span> : null}
      </div>
    </li>
  );
}

function MembersCard({
  ride,
  host,
  riders,
  viewerId,
}: {
  ride: RideDetailDto;
  host: RideMemberDto | undefined;
  riders: RideMemberDto[];
  viewerId: string | null;
}) {
  const list = [...(host ? [host] : []), ...riders];
  const canSeePhones = ride.isMine || ride.joined;
  return (
    <Card className="flex flex-col gap-3" data-testid="members-card">
      <h2 className="type-h3">On this ride</h2>
      <ul className="flex flex-col divide-y divide-line">
        {list.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" data-testid="member-row">
            <Avatar name={m.displayName} imageUrl={m.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-5 font-medium">
                {m.displayName}
                <span className="ml-2 text-[12px] leading-4 font-normal text-text-secondary">
                  {m.role === "host" ? "Host" : "Rider"}
                </span>
              </p>
              {m.phone ? (
                <a
                  href={`tel:${m.phone}`}
                  className="inline-flex min-h-8 items-center gap-1 text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
                  data-testid="member-phone"
                >
                  <Icon name="emergency" size={16} />
                  {m.phone}
                </a>
              ) : null}
            </div>
            {m.userId !== viewerId ? <MemberMenu member={m} /> : null}
          </li>
        ))}
      </ul>
      {canSeePhones ? (
        <p className="text-[12px] leading-4 text-text-secondary">
          Phone numbers are shown only to the host and accepted riders. Share them with no one else.
        </p>
      ) : null}
    </Card>
  );
}

function MemberMenu({ member }: { member: RideMemberDto }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");

  const block = useMutation({
    mutationFn: () => api(`/users/${member.userId}/block`, { method: "POST" }),
    onSuccess: () => {
      setBlocking(false);
      toast.show("Blocked. You won't see each other's rides.");
      void qc.invalidateQueries({ queryKey: ["rides"] });
      void qc.invalidateQueries({ queryKey: ["ride"] });
    },
    onError: (err) => toast.show(errMsg(err, "We couldn't block that person. Try again."), "error"),
  });
  const report = useMutation({
    mutationFn: () =>
      api("/flags", { method: "POST", body: { targetType: "USER", targetId: member.userId, reason: reason.trim() } }),
    onSuccess: () => {
      setReporting(false);
      setReason("");
      toast.show("Thanks. A moderator will take a look.");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setReporting(false);
        toast.show("You've already reported this person.", "info");
      } else toast.show(errMsg(err, "We couldn't send that. Try again."), "error");
    },
  });

  const itemCls =
    "flex min-h-11 w-full items-center gap-2 px-3 text-left text-[14px] leading-5 hover:bg-neutral-bubble";
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={`More actions for ${member.displayName}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-neutral-bubble"
        >
          <span aria-hidden="true" className="text-[20px] leading-none font-semibold">
            &hellip;
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={4}
            className="z-40 w-52 overflow-hidden rounded-control border border-line bg-card shadow-popover"
          >
            <button
              type="button"
              className={itemCls}
              onClick={() => {
                setOpen(false);
                setReporting(true);
              }}
            >
              <Icon name="flag" size={16} />
              Report user
            </button>
            <button
              type="button"
              className={`${itemCls} text-coral-text`}
              onClick={() => {
                setOpen(false);
                setBlocking(true);
              }}
            >
              <Icon name="close" size={16} />
              Block user
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <ConfirmDialog
        open={blocking}
        onOpenChange={setBlocking}
        title={`Block ${member.displayName}?`}
        description="You will not see each other's rides or requests. You can unblock later in settings."
        confirmLabel="Block"
        destructive
        loading={block.isPending}
        onConfirm={() => block.mutate()}
      />
      <Modal
        open={reporting}
        onOpenChange={setReporting}
        title={`Report ${member.displayName}`}
        description="Tell moderators what happened. Only moderators see your reason."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3) report.mutate();
          }}
        >
          <TextArea
            label="Reason"
            maxLength={300}
            counter={{ value: reason.length, max: 300 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" disabled={reason.trim().length < 3} loading={report.isPending} fullWidth>
            Send report
          </Button>
        </form>
      </Modal>
    </>
  );
}
