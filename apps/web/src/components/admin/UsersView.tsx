"use client";

import { MAX_SUSPENSION_DAYS, type AdminUserDto } from "@saferstreets/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, EmptyState, ErrorState, FilterBar, Select, Skeleton, TextField, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { AdminStatus, PageHeading, ReasonDialog, fmtDate, roleLabel, rowCls } from "./kit";
import { useAdminList } from "./useAdminList";

type Act = { kind: "suspend" | "restore" | "ban" | "role"; user: AdminUserDto };

const STATUSES = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "BANNED", label: "Banned" },
];
const ROLES = [
  { value: "", label: "Any role" },
  { value: "USER", label: "Members" },
  { value: "MODERATOR", label: "Moderators" },
  { value: "ADMIN", label: "Admins" },
];

export function UsersView({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [act, setAct] = useState<Act | null>(null);
  const [days, setDays] = useState("7");
  const [newRole, setNewRole] = useState("MODERATOR");
  const { query, items } = useAdminList<AdminUserDto>("/admin/users", {
    q: q || undefined,
    status: status || undefined,
    role: role || undefined,
  });

  const dayOptions = [1, 3, 7, 14, 30, ...(isAdmin ? [90, 365] : [])].filter(
    (d) => isAdmin || d <= MAX_SUSPENSION_DAYS,
  );

  async function run(reason: string) {
    if (!act) return;
    const base = `/admin/users/${act.user.id}`;
    if (act.kind === "suspend") {
      const until = new Date(Date.now() + Number(days) * 86_400_000).toISOString();
      await api(`${base}/suspend`, { method: "POST", body: { reason, until } });
    } else if (act.kind === "restore") await api(`${base}/restore`, { method: "POST", body: { reason } });
    else if (act.kind === "ban") await api(`${base}/ban`, { method: "POST", body: { reason } });
    else await api(`${base}/role`, { method: "PATCH", body: { role: newRole, reason } });
    toast.show("User updated.");
    await qc.invalidateQueries({ queryKey: ["admin"] });
  }

  const titles = {
    suspend: "Suspend this user?",
    restore: "Restore this user?",
    ban: "Ban this user?",
    role: "Change this user's role?",
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Users" />
      <form
        role="search"
        className="flex flex-col gap-2 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(text.trim());
        }}
      >
        <div className="md:flex-1">
          <TextField label="Search by name or email" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" size="mobile">
          Search
        </Button>
      </form>
      <FilterBar label="User status" chips={STATUSES} selected={status} onSelect={setStatus} />
      <FilterBar label="User role" chips={ROLES} selected={role} onSelect={setRole} />
      {query.isPending ? (
        <Skeleton className="h-20" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No users match" description="Try a different search or filter." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((u) => (
            <li key={u.id} className={`${rowCls} flex flex-col gap-2`} data-testid="user-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] leading-5 font-semibold">{u.name}</p>
                  <p className="truncate text-[13px] leading-5 text-text-secondary">{u.emailMasked}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] leading-4 font-medium text-text-secondary">{roleLabel(u.role)}</span>
                  <AdminStatus status={u.status} />
                </div>
              </div>
              <p className="text-[12px] leading-4 text-text-secondary">
                Joined {fmtDate(u.createdAt)} · {u.strikeCount} {u.strikeCount === 1 ? "strike" : "strikes"}
                {u.suspendedUntil ? ` · Suspended until ${fmtDate(u.suspendedUntil)}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {u.status === "ACTIVE" ? (
                  <Button variant="secondary" size="mobile" onClick={() => setAct({ kind: "suspend", user: u })}>
                    Suspend
                  </Button>
                ) : null}
                {u.status === "SUSPENDED" || (u.status === "BANNED" && isAdmin) ? (
                  <Button variant="secondary" size="mobile" onClick={() => setAct({ kind: "restore", user: u })}>
                    Restore
                  </Button>
                ) : null}
                {isAdmin && u.status !== "BANNED" ? (
                  <Button variant="secondary" size="mobile" onClick={() => setAct({ kind: "ban", user: u })}>
                    Ban
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button
                    variant="secondary"
                    size="mobile"
                    onClick={() => {
                      setNewRole(u.role === "USER" ? "MODERATOR" : "USER");
                      setAct({ kind: "role", user: u });
                    }}
                  >
                    Change role
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          fullWidth
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
      <ReasonDialog
        open={act !== null}
        onOpenChange={(o) => !o && setAct(null)}
        title={act ? titles[act.kind] : ""}
        description={
          act
            ? act.kind === "ban"
              ? `${act.user.name} loses access and every session is signed out. Only an admin can undo this.`
              : act.kind === "suspend"
                ? `${act.user.name} is signed out everywhere until the date you choose.${isAdmin ? "" : " Moderators can suspend for up to 30 days."}`
                : act.user.name
            : undefined
        }
        confirmLabel={
          act ? { suspend: "Suspend", restore: "Restore", ban: "Ban user", role: "Change role" }[act.kind] : "Confirm"
        }
        destructive={act?.kind === "ban"}
        onSubmit={run}
      >
        {act?.kind === "suspend" ? (
          <Select
            label="Suspend for"
            value={days}
            onValueChange={setDays}
            options={dayOptions.map((d) => ({ value: String(d), label: d === 1 ? "1 day" : `${d} days` }))}
          />
        ) : null}
        {act?.kind === "role" ? (
          <Select
            label="New role"
            value={newRole}
            onValueChange={setNewRole}
            options={[
              { value: "USER", label: "Member" },
              { value: "MODERATOR", label: "Moderator" },
              { value: "ADMIN", label: "Admin" },
            ]}
          />
        ) : null}
      </ReasonDialog>
    </div>
  );
}
