import { Banner, Button } from "@/components/ui";

/** Coral banner with the always-visible 112 line. SaferStreets never contacts emergency services. */
export function EmergencyBanner({ text }: { text: string }) {
  return (
    <Banner
      tone="coral"
      icon="alert"
      className="max-sm:flex-wrap"
      action={
        <Button asChild variant="emergency-solid" size="mobile">
          <a href="tel:112">Call 112</a>
        </Button>
      }
    >
      <span className="font-medium text-ink">{text}</span>
    </Banner>
  );
}
