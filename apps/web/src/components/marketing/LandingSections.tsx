// Landing page sections (A5.1). Server components; the only client piece is the FAQ accordion.
import Link from "next/link";
import { NightMap } from "@/components/brand/NightMap";
import { Accordion, Button, Card, Icon, IconBubble, cn } from "@/components/ui";
import type { IconName } from "@/design/icons";

const container = "mx-auto w-full max-w-[1120px] px-4 md:px-6 lg:px-0";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className={cn(container, "py-8 md:py-12 lg:py-16")}>
      <div className="grid items-center gap-5 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="flex flex-col items-start gap-5">
          <p className="inline-flex items-center gap-2 rounded-chip border border-line bg-card px-3 py-1.5 text-[14px] leading-5 font-medium">
            <span className="h-[7px] w-[7px] rounded-avatar bg-mint" aria-hidden="true" />
            Free for campuses and commuters
          </p>
          <h1 id="hero-title" className="type-display">
            Light up
            <br />
            every <span className="inline-block rounded-control bg-amber px-3 text-ink">journey.</span>
          </h1>
          <p className="max-w-[480px] text-[18px] leading-7 text-text-secondary">
            Report unsafe spots, share an auto, and let someone you trust know you&apos;re on your way. One account,
            four tools.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="amber" size="hero">
              <Link href="/login">Get started free</Link>
            </Button>
            <Button asChild variant="secondary" size="hero" className="px-6">
              <a href="#how-it-works">
                <Icon name="play" size={16} />
                See how it works
              </a>
            </Button>
          </div>
          <ul className="flex flex-col gap-2 text-[14px] leading-5 text-text-secondary md:flex-row md:gap-6">
            {["Email login, no passwords", "No app download"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-mint-text" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-hero bg-ink">
          <div className="aspect-[4/3] w-full">
            <NightMap breathe />
          </div>
          <FloatingCard
            className="top-4 left-4"
            icon="verified"
            tone="mint"
            title="Streetlight fixed"
            meta="Gate 2 road"
          />
          <FloatingCard
            className="right-4 bottom-4"
            icon="automate"
            tone="amber"
            title="2 seats left"
            meta="About ₹40 each"
          />
        </div>
      </div>
    </section>
  );
}

function FloatingCard({
  className,
  icon,
  tone,
  title,
  meta,
}: {
  className: string;
  icon: IconName;
  tone: "mint" | "amber";
  title: string;
  meta: string;
}) {
  return (
    <div
      className={cn(
        "absolute flex items-center gap-3 rounded-banner border border-line bg-card p-3 pr-4 text-ink",
        className,
      )}
    >
      <IconBubble icon={icon} tone={tone} variant="tint" />
      <div>
        <p className="text-[14px] leading-5 font-semibold">{title}</p>
        <p className="text-[12px] leading-4 text-text-secondary">{meta}</p>
      </div>
    </div>
  );
}

/** Product targets (Appendix 1.5), to be proven by E2E timing tests in Prompt 13. Not measured stats. */
const speed = [
  { n: "60 sec", c: "to file a report" },
  { n: "5 taps", c: "to request a ride" },
  { n: "30 sec", c: "to start a journey" },
  { n: "45 sec", c: "to raise an alert" },
] as const;

export function SpeedStrip() {
  return (
    <section aria-label="What you can do quickly" className="border-y border-line bg-card">
      <ul className="mx-auto grid max-w-[1120px] grid-cols-2 md:grid-cols-4">
        {speed.map((s, i) => (
          <li
            key={s.n}
            className={cn(
              "flex flex-col items-center gap-0.5 border-line px-4 py-6 text-center",
              i % 2 === 0 && "border-r",
              i < 2 && "border-b md:border-b-0",
              "md:border-r md:last:border-r-0",
            )}
          >
            <span className="type-number">{s.n}</span>
            <span className="text-[14px] leading-5 text-text-secondary">{s.c}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const modules = [
  {
    tone: "amber",
    icon: "saferoute",
    title: "SafeRoute",
    text: "Report broken lights and unsafe spots, then watch them get fixed.",
  },
  {
    tone: "mint",
    icon: "automate",
    title: "AutoMate",
    text: "Share an auto with people heading your way and split the fare.",
  },
  {
    tone: "periwinkle",
    icon: "journeyguard",
    title: "JourneyGuard",
    text: "Tell a trusted person where you're going and when you'll arrive.",
  },
  {
    tone: "coral",
    icon: "safealert",
    title: "SafeAlert",
    text: "Warn opted-in people nearby when something goes wrong.",
  },
] as const;

export function ModuleBento() {
  return (
    <section id="features" aria-labelledby="features-title" className={cn(container, "scroll-mt-20 py-12 md:py-16")}>
      <h2 id="features-title" className="type-h1 mb-6">
        Four tools, one account
      </h2>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {modules.map((m) => (
          <li key={m.title}>
            <Card tone={m.tone} className="flex h-full items-start gap-4 p-5">
              <IconBubble icon={m.icon} tone={m.tone} />
              <div>
                <h3 className="type-h3">{m.title}</h3>
                <p className="text-[14px] leading-5">{m.text}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

const steps = [
  {
    title: "Make one account",
    text: "Log in with a code we email you. There are no passwords to remember and no app to download.",
  },
  {
    title: "Pick a tool",
    text: "Report an issue, offer or join a ride, start a journey or raise an alert, all from one dashboard.",
  },
  {
    title: "Stay in the loop",
    text: "Get updates in the app and by email when a report moves, a ride is accepted or a journey needs a check-in.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className={cn(container, "scroll-mt-20 py-12 md:py-16")}>
      <h2 id="how-title" className="type-h1 mb-6">
        How it works
      </h2>
      <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card className="flex h-full flex-col gap-3 p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-ink font-display text-[18px] leading-6 font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="type-h3">{s.title}</h3>
              <p className="text-[14px] leading-5 text-text-secondary">{s.text}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

const limits = [
  "SaferStreets is not an emergency service.",
  "It doesn't track your live location. A place is saved only when you drop a pin or choose it yourself.",
  "It isn't connected to the police or any authority, and it doesn't call anyone for you.",
  "Alerts and emails reach opted-in people by app and email. Delivery isn't guaranteed.",
] as const;

export function SafetyAndLimits() {
  return (
    <section id="safety" aria-labelledby="safety-title" className={cn(container, "scroll-mt-20 py-12 md:py-16")}>
      <div className="grid gap-6 rounded-hero border border-line bg-card p-6 md:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div className="flex flex-col gap-4">
          <h2 id="safety-title" className="type-h1">
            Safety and limits
          </h2>
          <p className="text-[16px] leading-6 text-text-secondary">
            We say plainly what SaferStreets does and doesn&apos;t do, so you know when to use it and when to call for
            help.
          </p>
          <ul className="flex flex-col gap-2">
            {limits.map((l) => (
              <li key={l} className="flex items-start gap-2 text-[14px] leading-5">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-mint-text" />
                {l}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3 rounded-card border border-coral-border bg-coral-tint p-5">
          <p className="type-h3 text-coral-text">In danger? Call 112 first.</p>
          <p className="text-[14px] leading-5 text-coral-text">
            112 is India&apos;s national emergency number. Local numbers for police, ambulance and women&apos;s
            helplines are in the emergency menu inside the app.
          </p>
          <Button asChild variant="emergency-solid" size="mobile" className="self-start">
            <a href="tel:112">
              <Icon name="emergency" size={16} />
              Call 112
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    value: "emergency",
    question: "Is SaferStreets an emergency service?",
    answer: "No. If anyone is in danger, call 112 first. SaferStreets can't send help and doesn't call anyone for you.",
  },
  {
    value: "location",
    question: "Does it track my live location?",
    answer:
      "No. A place is saved only when you drop a pin, search an address or choose to use your current location once.",
  },
  {
    value: "login",
    question: "How do I log in?",
    answer: "Enter your email and we send a 6-digit code. There are no passwords and nothing to install.",
  },
  {
    value: "phone",
    question: "Who can see my phone number?",
    answer:
      "Only the person who offered a ride and riders they accepted, and only for that ride. Phone numbers are optional.",
  },
  {
    value: "contact",
    question: "What does my trusted contact receive?",
    answer:
      "An email with your destination, your expected arrival time and a status link. The page doesn't show live location, and your contact can stop the emails at any time.",
  },
  {
    value: "cost",
    question: "Does it cost anything?",
    answer:
      "It's free for campuses and commuters. Fares in AutoMate are estimates that riders settle in person; SaferStreets doesn't handle payments.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={cn(container, "scroll-mt-20 py-12 md:py-16")}>
      <div className="mx-auto max-w-3xl">
        <h2 id="faq-title" className="type-h1 mb-6">
          Questions people ask
        </h2>
        <Accordion items={faqs.map((f) => ({ value: f.value, question: f.question, answer: f.answer }))} />
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className={cn(container, "pb-12 md:pb-16")}>
      <div className="flex flex-col items-start gap-4 rounded-hero bg-ink p-6 md:flex-row md:items-center md:justify-between md:p-10">
        <div className="max-w-xl">
          <h2 className="type-h1 text-white">Ready to light up your next journey?</h2>
          <p className="mt-2 text-[16px] leading-6 text-ink-muted-on-dark">
            Make an account with your email in under a minute.
          </p>
        </div>
        <Button asChild variant="amber" size="hero">
          <Link href="/login">Get started free</Link>
        </Button>
      </div>
    </section>
  );
}
