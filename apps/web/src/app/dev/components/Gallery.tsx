"use client";

import { useState, type ReactNode } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { NightMap } from "@/components/brand/NightMap";
import { lightColors, type ColorToken } from "@/design/tokens";
import {
  Accordion,
  AlertCard,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Card,
  CategoryTile,
  ConfirmDialog,
  CountdownRing,
  DataTable,
  DateTimePicker,
  EmergencySheet,
  EmptyState,
  ErrorState,
  FilterBar,
  IconBubble,
  IconButton,
  ImageUploader,
  InfiniteList,
  JourneyCard,
  Modal,
  NotificationItem,
  OTPInput,
  Pagination,
  ProgressBar,
  ReportCard,
  RideCard,
  Select,
  Skeleton,
  Stepper,
  StatusChip,
  Tabs,
  TextArea,
  TextField,
  Timeline,
  Toast,
  statusTone,
  type StatusName,
  type UploadItem,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { icons, type IconName } from "@/design/icons";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-4">
      <h2 id={`${id}-h`} className="type-h2 border-b border-line pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function State({ label, children, onDark }: { label: string; children: ReactNode; onDark?: boolean }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2">
      <p className={`text-[12px] leading-4 font-medium ${onDark ? "text-ink-muted-on-dark" : "text-text-secondary"}`}>
        {label}
      </p>
      {children}
    </div>
  );
}

const row = "flex flex-wrap items-start gap-4";

function Colors() {
  const names = Object.keys(lightColors) as ColorToken[];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
      {names.map((n) => (
        <div key={n} className="rounded-control border border-line bg-card p-2 text-[12px] leading-4">
          <span
            className="mb-1 block h-8 rounded-logo border border-line"
            style={{ background: `var(--color-${n})` }}
          />
          <p className="font-medium">{n}</p>
          <p className="text-text-secondary">{lightColors[n]}</p>
        </div>
      ))}
    </div>
  );
}

function Typography() {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2">
      <p className="type-display">Light up every journey.</p>
      <p className="type-h1">H1 Report an issue</p>
      <p className="type-h2">H2 Good afternoon, Riya</p>
      <p className="type-h3">H3 Campus to Bus Stand</p>
      <p className="type-body">
        Body 16/24. Report unsafe spots, share an auto, and let someone you trust know you&apos;re on your way.
      </p>
      <p className="type-small">Small 14/20. Station Rd · 0.6 km · 8 min</p>
      <p className="type-caption">Caption 12/16 is the minimum text size.</p>
      <p className="type-number">23 min left</p>
    </div>
  );
}

const CATEGORIES: Array<{ icon: IconName; label: string }> = [
  { icon: "streetlight", label: "Broken streetlight" },
  { icon: "poorLighting", label: "Poor lighting" },
  { icon: "pothole", label: "Pothole" },
  { icon: "damagedRoad", label: "Damaged road" },
  { icon: "footpath", label: "Footpath" },
  { icon: "isolatedArea", label: "Isolated area" },
];

interface Person {
  id: string;
  name: string;
  status: StatusName;
}
const PEOPLE: Person[] = [
  { id: "1", name: "Riya S.", status: "Verified" },
  { id: "2", name: "Arjun K.", status: "Under review" },
  { id: "3", name: "Meera P.", status: "Rejected" },
];

function Interactive() {
  const [otp, setOtp] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [cat, setCat] = useState(0);
  const [chip, setChip] = useState("nearby");
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [page, setPage] = useState(2);
  const [files, setFiles] = useState<UploadItem[]>([
    {
      id: "a",
      name: "gate-2.jpg",
      previewUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'/>",
      progress: 60,
    },
  ]);
  return (
    <>
      <Section id="otp" title="OTP input">
        <div className={row}>
          <State label="Default">
            <OTPInput
              value={otp}
              onChange={setOtp}
              onComplete={(v) => setOtpErr(v === "123456" ? "" : "That code isn't right. Check it and try again.")}
            />
          </State>
          <State label="Error (shakes once)">
            <OTPInput value="123456" onChange={() => {}} error="That code has expired. Request a new one." />
          </State>
          <State label="Disabled">
            <OTPInput value="12" onChange={() => {}} disabled />
          </State>
          {otpErr ? <p className="text-[12px] leading-4 text-text-secondary">Typed code result: {otpErr}</p> : null}
        </div>
      </Section>

      <Section id="tiles" title="Category tiles and filter chips">
        <div className="grid max-w-md grid-cols-2 gap-3" role="radiogroup" aria-label="Problem category">
          {CATEGORIES.map((c, i) => (
            <CategoryTile key={c.label} icon={c.icon} label={c.label} selected={cat === i} onSelect={() => setCat(i)} />
          ))}
        </div>
        <FilterBar
          label="Alert filters"
          selected={chip}
          onSelect={setChip}
          chips={[
            { value: "nearby", label: "Nearby" },
            { value: "all", label: "All" },
            { value: "accident", label: "Accident" },
            { value: "medical", label: "Medical" },
            { value: "fire", label: "Fire" },
          ]}
        />
      </Section>

      <Section id="overlays" title="Modal, confirm dialog, bottom sheet, emergency sheet">
        <div className={row}>
          <Button variant="secondary" onClick={() => setModal(true)}>
            Open modal
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Open confirm dialog
          </Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Open bottom sheet
          </Button>
          <Button variant="emergency" leadingIcon="emergency" onClick={() => setEmergency(true)}>
            Emergency
          </Button>
        </div>
        <Modal
          open={modal}
          onOpenChange={setModal}
          title="Request to join"
          description="Add an optional message for the host."
        >
          <TextArea label="Message" optional placeholder="Hi, I'm heading to the station too." />
        </Modal>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Cancel this ride?"
          description="Riders will be told. Add a reason on the next step."
          confirmLabel="Cancel ride"
          cancelLabel="Keep ride"
          destructive
          onConfirm={() => setConfirm(false)}
        />
        <BottomSheet open={sheet} onOpenChange={setSheet} title="Nearby alerts" description="Sorted by distance.">
          <AlertCard
            title="Road accident"
            meta="Station Rd crossing · 0.6 km · 8 min"
            status="Unverified"
            footnote="4 confirmed"
          />
        </BottomSheet>
        <EmergencySheet
          open={emergency}
          onOpenChange={setEmergency}
          numbers={[
            { key: "emergency", label: "Emergency", number: "112" },
            { key: "police", label: "Police", number: "100" },
            { key: "ambulance", label: "Ambulance", number: "108" },
            { key: "womenHelpline", label: "Women helpline", number: "1091" },
          ]}
        />
      </Section>

      <Section id="uploader" title="Image uploader">
        <div className="max-w-md">
          <ImageUploader
            items={files}
            onAdd={() => {}}
            onRemove={(id) => setFiles((f) => f.filter((x) => x.id !== id))}
          />
        </div>
      </Section>

      <Section id="lists" title="Data table, pagination, infinite list">
        <DataTable<Person>
          caption="People"
          rows={PEOPLE}
          rowKey={(r) => r.id}
          columns={[
            { key: "name", header: "Name", cell: (r) => r.name, sortable: true },
            { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} /> },
          ]}
          sort={{ key: "name", dir: "asc" }}
        />
        <DataTable<Person>
          caption="Loading people"
          rows={[]}
          rowKey={(r) => r.id}
          loading
          columns={[{ key: "n", header: "Name", cell: (r) => r.name }]}
        />
        <DataTable<Person>
          caption="Empty people"
          rows={[]}
          rowKey={(r) => r.id}
          columns={[{ key: "n", header: "Name", cell: (r) => r.name }]}
          emptyLabel="No users match your filters."
        />
        <Pagination page={page} pageCount={5} onPageChange={setPage} />
        <InfiniteList hasMore onLoadMore={() => {}}>
          <ReportCard
            title="Streetlight out near hostel gate"
            meta="Main Road · 40 m"
            icon="streetlight"
            status="Under review"
            confirmations={3}
          />
        </InfiniteList>
        <InfiniteList hasMore={false}>
          <ReportCard title="Pothole on Ring Rd" meta="Ring Rd · 1.2 km" icon="pothole" status="Resolved" />
        </InfiniteList>
      </Section>
    </>
  );
}

export function Gallery() {
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-8 md:px-8" data-testid="gallery">
      <header className="flex flex-col gap-2">
        <Logo />
        <h1 className="type-h1">Component gallery</h1>
        <p className="max-w-xl text-[14px] leading-5 text-text-secondary">
          Every Lamplight component in every state. Development only: this page returns 404 in production.
        </p>
      </header>

      <Section id="colors" title="Colour tokens">
        <Colors />
      </Section>
      <Section id="type" title="Typography">
        <Typography />
      </Section>

      <Section id="brand" title="Logo, night map, empty-state art">
        <div className={row}>
          <Logo />
          <LogoMark />
          <div className="h-[240px] w-[320px] overflow-hidden rounded-hero">
            <NightMap />
          </div>
          <div className="flex flex-wrap gap-4">
            <EmptyState art="quiet" title="All quiet around you." />
            <EmptyState art="reports" title="Be the first to report an issue nearby." />
            <EmptyState art="rides" title="Create one, others will find it." />
          </div>
        </div>
      </Section>

      <Section id="icons" title="Icons (Tabler outline, A3 mapping)">
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-8">
          {(Object.keys(icons) as IconName[]).map((n) => (
            <div
              key={n}
              className="flex flex-col items-center gap-1 rounded-control border border-line bg-card p-2 text-[12px] leading-4"
            >
              <Icon name={n} size={24} />
              {n}
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className="flex flex-col gap-4">
          {(["ink", "amber", "secondary", "emergency", "emergency-solid"] as const).map((v) => (
            <div key={v} className={row}>
              <State label={`${v} · default`}>
                <Button
                  variant={v}
                  trailingArrow={v === "ink"}
                  leadingIcon={v.startsWith("emergency") ? "emergency" : (undefined as never)}
                >
                  {v === "ink"
                    ? "Continue"
                    : v === "amber"
                      ? "Get started free"
                      : v === "secondary"
                        ? "Extend ETA"
                        : "Call 112"}
                </Button>
              </State>
              <State label="hover">
                <Button variant={v} forceState="hover">
                  Hover
                </Button>
              </State>
              <State label="focus">
                <Button variant={v} forceState="focus">
                  Focus
                </Button>
              </State>
              <State label="loading">
                <Button variant={v} loading>
                  Saving
                </Button>
              </State>
              <State label="disabled">
                <Button variant={v} disabled>
                  Disabled
                </Button>
              </State>
            </div>
          ))}
          <div className="flex flex-wrap items-start gap-4 rounded-hero bg-ink p-4">
            <State onDark label="ghost-on-dark (on ink)">
              <Button variant="ghost-on-dark">Report an issue</Button>
            </State>
            <State onDark label="amber on ink">
              <Button variant="amber">Start a journey</Button>
            </State>
          </div>
          <div className={row}>
            <State label="size 40 / 44 / 48 / 32">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="default">40</Button>
                <Button size="mobile">44</Button>
                <Button size="hero" variant="amber">
                  48 hero
                </Button>
                <Button size="sm">32 small</Button>
              </div>
            </State>
            <State label="icon buttons (44 x 44)">
              <div className="flex gap-2">
                <IconButton icon="notifications" label="Notifications" dot />
                <IconButton icon="search" label="Search" />
                <IconButton icon="close" label="Close" disabled />
              </div>
            </State>
          </div>
        </div>
      </Section>

      <Section id="fields" title="Fields">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField label="Email" type="email" placeholder="you@example.com" hint="We'll send a 6-digit code." />
          <TextField label="Email" type="email" defaultValue="riya@" error="Enter a valid email address." />
          <TextField
            label="Search"
            placeholder="Search reports, rides, places"
            leading={<Icon name="search" size={18} />}
          />
          <TextField label="Focused field" forceFocus placeholder="Focus ring" />
          <TextField label="Disabled" disabled defaultValue="Locked" />
          <TextArea label="Description" counter={{ value: 12, max: 1000 }} placeholder="What's wrong?" />
          <TextArea label="Description" error="Add at least 10 characters." defaultValue="Dark." />
          <Select
            label="Status"
            placeholder="All statuses"
            options={[
              { value: "submitted", label: "Submitted" },
              { value: "review", label: "Under review" },
              { value: "verified", label: "Verified" },
            ]}
          />
          <Select label="Status" error="Pick a status." options={[{ value: "a", label: "Submitted" }]} />
          <DateTimePicker label="Departure" hint="At least 15 minutes from now." />
        </div>
      </Section>

      <Section id="chips" title="Status chips and badges">
        <div className={row}>
          {(Object.keys(statusTone) as StatusName[]).map((s) => (
            <StatusChip key={s} status={s} />
          ))}
          <StatusChip tone="mint" label="2 seats left" icon="verified" />
          <Badge>3</Badge>
          <Badge tone="amber">New</Badge>
          <Badge tone="neutral">Draft</Badge>
        </div>
      </Section>

      <Section id="cards" title="Cards, icon bubbles, avatars">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>Flat card</Card>
          <Card interactive>Hover-lift card</Card>
          <Card interactive forceHover>
            Hover state
          </Card>
          <Card tone="amber">
            <div className="flex gap-3">
              <IconBubble icon="saferoute" tone="amber" />
              <div>
                <p className="type-h3">SafeRoute</p>
                <p className="text-[14px] leading-5">
                  Report broken lights and unsafe spots, then watch them get fixed.
                </p>
              </div>
            </div>
          </Card>
          <Card tone="mint">
            <div className="flex gap-3">
              <IconBubble icon="automate" tone="mint" />
              <div>
                <p className="type-h3">AutoMate</p>
                <p className="text-[14px] leading-5">Share an auto with people heading your way and split the fare.</p>
              </div>
            </div>
          </Card>
          <Card tone="periwinkle">
            <div className="flex gap-3">
              <IconBubble icon="journeyguard" tone="periwinkle" />
              <div>
                <p className="type-h3">JourneyGuard</p>
                <p className="text-[14px] leading-5">
                  Tell a trusted person where you&apos;re going and when you&apos;ll arrive.
                </p>
              </div>
            </div>
          </Card>
          <Card tone="coral">
            <div className="flex gap-3">
              <IconBubble icon="safealert" tone="coral" />
              <div>
                <p className="type-h3">SafeAlert</p>
                <p className="text-[14px] leading-5">Warn opted-in people nearby when something goes wrong.</p>
              </div>
            </div>
          </Card>
        </div>
        <div className={row}>
          {(["amber", "mint", "periwinkle", "coral", "neutral"] as const).map((t) => (
            <IconBubble key={t} icon="check" tone={t} />
          ))}
          {(["amber", "mint", "periwinkle", "coral", "neutral"] as const).map((t) => (
            <IconBubble key={`t-${t}`} icon="check" tone={t} variant="tint" />
          ))}
          <IconBubble icon="check" size={28} />
          <Avatar name="Riya Sharma" />
          <Avatar name="Arjun K" size={32} />
        </div>
      </Section>

      <Section id="feature-cards" title="Ride, alert, report, journey, notification cards">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RideCard
            time="6:30 pm"
            seatsLabel="2 seats left"
            hostName="Riya S."
            hostMeta="Verified email · 4 rides"
            price="₹40"
            onRequest={() => {}}
          />
          <RideCard
            time="7:10 pm"
            seatsLabel="Full"
            full
            hostName="Arjun K."
            hostMeta="Verified email · 9 rides"
            price="₹50"
          />
          <RideCard
            time="8:15 pm"
            seatsLabel="1 seat left"
            hostName="Meera P."
            hostMeta="Verified email · 1 ride"
            price="₹60"
            requesting
          />
          <AlertCard
            title="Road accident"
            meta="Station Rd crossing · 0.6 km · 8 min ago"
            status="Unverified"
            footnote="4 confirmed"
          />
          <AlertCard
            title="Fallen tree"
            meta="Ring Rd · 1.2 km · 25 min ago"
            status="Verified"
            footnote="Moderator checked"
            tone="amber"
          />
          <ReportCard
            title="Streetlight out near hostel gate"
            meta="Main Road · 40 m"
            icon="streetlight"
            status="In progress"
            confirmations={3}
          />
          <JourneyCard
            title="Hostel Gate to Railway Station"
            arriveBy="6:45 pm"
            progress={62}
            caption="23 min left. Mom is emailed if you're late."
          />
          <Card>
            <NotificationItem
              icon="streetlight"
              tone="amber"
              text="Your report was verified."
              time="2 min ago"
              unread
            />
            <NotificationItem icon="automate" tone="mint" text="Riya accepted your request." time="Yesterday" />
          </Card>
        </div>
      </Section>

      <Section id="progress" title="Progress, stepper, countdown ring, timeline">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ProgressBar value={62} label="Journey progress" />
          <Stepper step={1} label="Report step" />
          <Stepper step={3} label="Report step" />
          <div className="flex items-center gap-6">
            <CountdownRing minutesLeft={23} totalMinutes={45} />
            <CountdownRing minutesLeft={0} totalMinutes={45} overdue />
          </div>
          <Timeline
            entries={[
              { title: "Under review", time: "Today, 6:10 pm", note: "A moderator is checking this." },
              { title: "Submitted", time: "Today, 5:58 pm" },
            ]}
          />
        </div>
      </Section>

      <Section id="banners" title="Banners and toasts">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Banner tone="neutral" title="Not an emergency service">
            SaferStreets doesn&apos;t track your live location.
          </Banner>
          <Banner tone="amber-warn" title="Is this the same issue?">
            Broken streetlight · 40 m away · 3 people confirmed
          </Banner>
          <Banner
            tone="coral"
            title="In danger?"
            action={
              <Button variant="emergency-solid" leadingIcon="emergency" size="mobile">
                Call 112
              </Button>
            }
          >
            Call 112 first.
          </Banner>
          <Toast tone="success">Report submitted.</Toast>
          <Toast tone="info">You&apos;re offline. Changes won&apos;t be saved.</Toast>
          <Toast tone="error">We couldn&apos;t send that. Try again.</Toast>
        </div>
      </Section>

      <Section id="states" title="Skeleton, empty and error states">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="flex flex-col gap-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
          <Card>
            <EmptyState
              art="quiet"
              title="All quiet around you."
              description="New alerts near you will show up here."
              actionLabel="Set alert area"
            />
          </Card>
          <Card>
            <ErrorState code="INTERNAL" />
          </Card>
        </div>
      </Section>

      <Section id="tabs" title="Tabs and accordion">
        <Tabs
          label="My rides"
          items={[
            {
              value: "created",
              label: "Created",
              content: <p className="text-[14px] leading-5">Rides you offered.</p>,
            },
            { value: "joined", label: "Joined", content: <p className="text-[14px] leading-5">Rides you joined.</p> },
            { value: "history", label: "History", content: <p className="text-[14px] leading-5">Past rides.</p> },
          ]}
        />
        <Accordion
          items={[
            {
              value: "a",
              question: "Is SaferStreets an emergency service?",
              answer: "No. If anyone is in danger, call 112 first.",
            },
            {
              value: "b",
              question: "Does it track my live location?",
              answer: "No. Location is only saved when you drop a pin or choose it yourself.",
            },
          ]}
        />
      </Section>

      <Interactive />

      <Section id="frames" title="Preview frames">
        <div className="flex flex-wrap items-start gap-8">
          <State label="Mobile frame 390">
            <div
              className="w-[390px] max-w-full overflow-hidden rounded-hero border border-line-frame bg-cream p-4"
              data-testid="frame-mobile"
            >
              <div className="flex flex-col gap-3">
                <Stepper step={1} />
                <h3 className="type-h3">What&apos;s the problem?</h3>
                <p className="text-[12px] leading-4 text-text-secondary">
                  Pick the closest match. You can add details next.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {CATEGORIES.map((c, i) => (
                    <CategoryTile key={c.label} icon={c.icon} label={c.label} selected={i === 0} />
                  ))}
                </div>
                <Button fullWidth size="mobile" trailingArrow>
                  Continue
                </Button>
              </div>
            </div>
          </State>
          <State label="Desktop frame 720">
            <div
              className="w-[720px] max-w-full overflow-hidden rounded-hero border border-line-frame bg-cream"
              data-testid="frame-desktop"
            >
              <div className="grid grid-cols-1 overflow-hidden rounded-panel bg-ink md:grid-cols-[1.2fr_1fr]">
                <div className="flex flex-col gap-3 p-6">
                  <h3 className="type-h2 text-white">Good afternoon, Riya</h3>
                  <p className="text-[14px] leading-5 text-ink-muted-on-dark">
                    You&apos;re covered. 1 trusted contact, alerts on within 3 km.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="amber">Start a journey</Button>
                    <Button variant="ghost-on-dark">Report an issue</Button>
                  </div>
                </div>
                <div className="min-h-[160px]">
                  <NightMap />
                </div>
              </div>
            </div>
          </State>
        </div>
      </Section>
    </main>
  );
}
