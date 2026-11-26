import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { Button, Icon } from "@/components/ui";

export const metadata: Metadata = {
  title: "Safety disclaimer",
  description: "What SaferStreets can and can't do. In danger, call 112 first.",
};

export default function SafetyPage() {
  return (
    <LegalPage
      title="Safety disclaimer"
      intro="SaferStreets helps neighbours look out for each other. It is not a replacement for emergency services."
      sections={[
        {
          id: "call",
          title: "In danger, call 112 first",
          body: (
            <>
              <p>
                112 is India&apos;s national emergency number. Other numbers: police 100, fire 101, ambulance 108, women
                helpline 1091. Numbers can change, so check them locally.
              </p>
              <Button asChild variant="emergency-solid" size="mobile" className="self-start">
                <a href="tel:112">
                  <Icon name="emergency" size={16} />
                  Call 112
                </a>
              </Button>
            </>
          ),
        },
        {
          id: "cannot",
          title: "What SaferStreets doesn't do",
          body: (
            <ul>
              <li>It is not an emergency service and cannot send help.</li>
              <li>It doesn&apos;t track your live location.</li>
              <li>It has no police or authority integration and never contacts them automatically.</li>
              <li>It doesn&apos;t guarantee that alerts, emails or reminders are delivered or read.</li>
              <li>It doesn&apos;t take payments. Ride fares are estimates settled in person.</li>
            </ul>
          ),
        },
        {
          id: "alerts",
          title: "Alerts and reports",
          body: (
            <p>
              Community alerts are labelled &quot;Unverified&quot; until a moderator checks them. They can be wrong or
              out of date. Reports describe problems; fixing them depends on the people responsible for the place.
            </p>
          ),
        },
        {
          id: "journeys",
          title: "Journeys and trusted contacts",
          body: (
            <p>
              JourneyGuard emails your trusted contact when you start a journey and again if you haven&apos;t checked in
              after your expected arrival and the wait you chose. If an email fails, we tell you so you can call them
              yourself.
            </p>
          ),
        },
        {
          id: "rides",
          title: "Sharing rides",
          body: (
            <ul>
              <li>Meet at public, well-lit pickup points.</li>
              <li>Tell a trusted person where you&apos;re going, for example with a journey.</li>
              <li>You can say no to any request, leave a ride, and report or block a user.</li>
            </ul>
          ),
        },
      ]}
    />
  );
}
