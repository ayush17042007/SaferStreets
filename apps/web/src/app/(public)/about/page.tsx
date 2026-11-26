import type { Metadata } from "next";
import { GrievanceBlock, LegalPage } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "About", description: "What SaferStreets is and who it is for." };

export default function AboutPage() {
  return (
    <LegalPage
      draft={false}
      title="About SaferStreets"
      intro="Safer Streets. Smarter Journeys. Stronger Communities."
      sections={[
        {
          id: "why",
          title: "Why we built it",
          body: (
            <p>
              Dark roads, potholes and lonely stretches are known locally but rarely recorded anywhere useful. Students
              overpay for solo autos on shared routes. People travelling alone have no light way to leave a record with
              someone they trust. SaferStreets puts these four needs in one account.
            </p>
          ),
        },
        {
          id: "tools",
          title: "The four tools",
          body: (
            <ul>
              <li>SafeRoute: report broken lights and unsafe spots and follow them to resolution.</li>
              <li>AutoMate: share an auto and split the fare.</li>
              <li>JourneyGuard: tell a trusted person where you&apos;re going and when you&apos;ll arrive.</li>
              <li>SafeAlert: warn opted-in people nearby when something goes wrong.</li>
            </ul>
          ),
        },
        {
          id: "honest",
          title: "What it isn't",
          body: (
            <p>
              It isn&apos;t an emergency service, doesn&apos;t track live location and isn&apos;t connected to the
              police. See the Safety disclaimer for details.
            </p>
          ),
        },
        { id: "contact", title: "Contact", body: <GrievanceBlock /> },
      ]}
    />
  );
}
