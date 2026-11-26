"use client";

import type { MeResponse, EmailPrefs } from "@saferstreets/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Banner, Button, Card, ConfirmDialog, Skeleton, StatusChip, Switch, cn, useToast } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { AlertAreaSettings } from "@/components/safealert/AlertAreaSettings";
import { ContactsManager } from "./ContactsManager";

const TABS = [
  { id: "account", label: "Account" },
  { id: "privacy", label: "Privacy" },
  { id: "notifications", label: "Notifications" },
  { id: "alerts", label: "Safety alerts" },
  { id: "contacts", label: "Contacts" },
  { id: "sessions", label: "Sessions" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** S27: left tab list on desktop, stacked sections on mobile (A5.8). */
export function SettingsView({ me }: { me: MeResponse }) {
  const [chosen, setActive] = useState<TabId | null>(null);
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    () => window.location.hash.slice(1),
    () => "",
  );
  const active: TabId = chosen ?? TABS.find((t) => t.id === hash)?.id ?? "account";
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="type-h1">Settings</h1>
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="hidden md:block">
          <ul className="flex flex-col gap-1">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-current={active === t.id ? "page" : undefined}
                  onClick={() => setActive(t.id)}
                  className={cn(
                    "flex h-11 w-full items-center rounded-control-sm px-3 text-left text-[14px] leading-5",
                    active === t.id ? "bg-ink font-semibold text-white" : "text-text-secondary hover:bg-neutral-bubble",
                  )}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-6">
          <Section id="account" title="Account" active={active}>
            <AccountSection me={me} />
          </Section>
          <Section id="privacy" title="Privacy" active={active}>
            <PrivacySection />
          </Section>
          <Section id="notifications" title="Notifications" active={active}>
            <NotificationsSection prefs={me.emailPrefs} />
          </Section>
          <Section id="alerts" title="Safety alerts" active={active}>
            <AlertAreaSettings />
          </Section>
          <Section id="contacts" title="Trusted contacts" active={active}>
            <ContactsManager />
          </Section>
          <Section id="sessions" title="Sessions" active={active}>
            <SessionsSection />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  active,
  children,
}: {
  id: TabId;
  title: string;
  active: TabId;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-h`}
      className={cn("flex-col gap-3", active === id ? "flex" : "hidden max-md:flex")}
    >
      <h2 id={`settings-${id}-h`} className="type-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AccountSection({ me }: { me: MeResponse }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const del = useMutation({
    mutationFn: () => api("/me", { method: "DELETE" }),
    onSuccess: () => {
      router.replace("/");
      router.refresh();
    },
    onError: () => {
      toast.show("We couldn't delete your account. Try again.", "error");
      setConfirm(false);
    },
  });
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-[14px] leading-5">
        <span className="text-text-secondary">Email</span>
        <span className="flex items-center gap-2 font-medium">
          {me.email}
          <StatusChip tone="mint" label="Verified" icon="verified" />
        </span>
      </div>
      <div className="border-t border-line pt-4">
        <p className="text-[14px] leading-5 font-medium">Delete account</p>
        <p className="mb-3 text-[14px] leading-5 text-text-secondary">
          We close your account now and remove your email, name, phone and photo after 30 days. Reports you made stay,
          without your name.
        </p>
        <Button variant="emergency" size="mobile" onClick={() => setConfirm(true)}>
          Delete my account
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete your account?"
        description="You'll be logged out everywhere. This starts a 30-day countdown after which your personal details are removed."
        confirmLabel="Delete account"
        destructive
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </Card>
  );
}

function PrivacySection() {
  return (
    <Card className="flex flex-col gap-3 text-[14px] leading-5">
      <div>
        <p className="font-medium">Who sees your phone number</p>
        <p className="text-text-secondary">
          Only the person who offered a ride and riders they accepted, for that ride. Nobody else.
        </p>
      </div>
      <div className="border-t border-line pt-3">
        <p className="font-medium">Your email address</p>
        <p className="text-text-secondary">
          Never shown to other members. Rides show your first name and last initial.
        </p>
      </div>
      <div className="border-t border-line pt-3">
        <p className="font-medium">Your location</p>
        <p className="text-text-secondary">
          We don&apos;t track it. A place is saved only when you drop a pin or choose it.
        </p>
      </div>
    </Card>
  );
}

function NotificationsSection({ prefs }: { prefs: EmailPrefs }) {
  const toast = useToast();
  const router = useRouter();
  const [value, setValue] = useState<EmailPrefs>(prefs);
  const save = useMutation({
    mutationFn: (next: EmailPrefs) => api("/me", { method: "PATCH", body: { emailPrefs: next } }),
    onSuccess: () => {
      toast.show("Email preferences saved.");
      router.refresh();
    },
    onError: (_e, _next, _ctx) => {
      setValue(prefs);
      toast.show("We couldn't save that. Try again.", "error");
    },
  });
  function toggle(key: keyof EmailPrefs, on: boolean) {
    const next = { ...value, [key]: on };
    setValue(next);
    save.mutate(next);
  }
  return (
    <Card className="flex flex-col divide-y divide-line">
      <Switch
        checked={value.saferoute}
        onCheckedChange={(v) => toggle("saferoute", v)}
        label="SafeRoute"
        description="Emails when a report you made or confirmed changes status."
      />
      <Switch
        checked={value.automate}
        onCheckedChange={(v) => toggle("automate", v)}
        label="AutoMate"
        description="Emails about ride requests and decisions."
      />
      <Switch
        checked={value.safealert}
        onCheckedChange={(v) => toggle("safealert", v)}
        label="SafeAlert"
        description="Emails about community alerts, if you opted in."
      />
      <div className="pt-3">
        <Banner tone="neutral" icon="journeyguard" title="JourneyGuard emails are always on">
          Reminders to you and updates to your trusted contact are safety emails, so they can&apos;t be switched off.
        </Banner>
      </div>
    </Card>
  );
}

interface SessionRow {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
}

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
}

const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function SessionsSection() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const list = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<{ data: SessionRow[] }>("/me/sessions").then((r) => r.data),
  });
  const out = useMutation({
    mutationFn: () => api("/auth/logout-all", { method: "POST" }),
    onSettled: () => {
      router.replace("/login");
      router.refresh();
    },
  });
  return (
    <Card className="flex flex-col gap-4">
      {list.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : list.isError ? (
        <p role="alert" className="text-[14px] leading-5 text-coral-text">
          {list.error instanceof ApiError ? list.error.message : "We couldn't load your sessions."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {list.data.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-[14px] leading-5 font-medium">{describeAgent(s.userAgent)}</p>
                <p className="text-[12px] leading-4 text-text-secondary">
                  Signed in {when.format(new Date(s.createdAt))}
                </p>
              </div>
              {s.current ? <StatusChip tone="mint" label="This device" /> : null}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line pt-4">
        <Button variant="secondary" size="mobile" onClick={() => setConfirm(true)}>
          Log out everywhere
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Log out everywhere?"
        description="Every device, including this one, will need a new code to log in."
        confirmLabel="Log out everywhere"
        loading={out.isPending}
        onConfirm={() => out.mutate()}
      />
    </Card>
  );
}
