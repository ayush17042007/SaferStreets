import { ContactsManager } from "@/components/profile/ContactsManager";
import { Banner } from "@/components/ui";

export const metadata = { title: "Trusted contacts" };

export default function ContactsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="type-h1">Trusted contacts</h1>
        <p className="text-[14px] leading-5 text-text-secondary">
          People who get an email when you start a journey, and again if you haven&apos;t checked in.
        </p>
      </div>
      <Banner tone="neutral" icon="alert">
        We email your contact and show them a status page. SaferStreets doesn&apos;t track your live location.
      </Banner>
      <ContactsManager />
    </div>
  );
}
