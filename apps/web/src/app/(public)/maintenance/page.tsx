import { SystemPage } from "@/components/marketing/SystemPage";

export const metadata = { title: "Back soon", robots: { index: false } };

export default function MaintenancePage() {
  return (
    <SystemPage
      code="503"
      title="We're making improvements"
      description="SaferStreets is paused for a short while. Your reports, rides and journeys are safe. Check back soon."
      note={
        <p className="text-[14px] leading-5 text-text-secondary">
          While we&apos;re away, reminders and emails may be delayed. If you need help now, call 112.
        </p>
      }
    />
  );
}
