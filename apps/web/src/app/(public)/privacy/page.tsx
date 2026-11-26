import type { Metadata } from "next";
import { GrievanceBlock, LegalPage } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How SaferStreets handles your personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="What we collect, why, how long we keep it and the choices you have, written with India's Digital Personal Data Protection Act, 2023 in mind."
      sections={[
        {
          id: "collect",
          title: "What we collect",
          body: (
            <ul>
              <li>Your email address (to log you in) and your name.</li>
              <li>Optional: phone number and profile photo.</li>
              <li>Content you create: reports, photos, rides, journeys, alerts and flags.</li>
              <li>Emergency contacts you add: name, email and optional phone.</li>
              <li>
                Places you choose: pins, addresses and a saved alert area centre. We don&apos;t track live location.
              </li>
              <li>
                Technical data: IP address and device details for security and rate limiting, kept in hashed or limited
                form.
              </li>
            </ul>
          ),
        },
        {
          id: "why",
          title: "Why we use it",
          body: (
            <p>
              To run the service you asked for, keep it safe from abuse, send the emails and notifications you trigger
              or opt into, and let moderators review content. We use data only for these purposes.
            </p>
          ),
        },
        {
          id: "consent",
          title: "Consent",
          body: (
            <>
              <p>
                We ask for your consent when you accept these terms and when you opt in to community alert
                notifications. We keep a record of what you agreed to and when. You can withdraw alert consent in
                settings at any time.
              </p>
              <p>Trusted contacts are asked by you, not by us. Each email to them has a one-click way to stop.</p>
            </>
          ),
        },
        {
          id: "sharing",
          title: "Who sees your data",
          body: (
            <ul>
              <li>Other users see your first name and last initial on rides, never your email address.</li>
              <li>Your phone number is shown only to the ride creator and accepted riders of the same ride.</li>
              <li>Reports and alerts hide the author from the public; moderators can see them.</li>
              <li>
                Our service providers (email delivery, image storage, maps, error monitoring) process data on our
                behalf.
              </li>
              <li>We don&apos;t sell personal data.</li>
            </ul>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <ul>
              <li>Login codes: removed 24 hours after they expire. Sessions: removed 30 days after they end.</li>
              <li>Journeys and their events: 90 days after completion. Notifications: 60 days.</li>
              <li>Alerts: 12 months, with the author link removed after 90 days. Moderation audit log: 2 years.</li>
              <li>
                Reports are kept as public-interest records; the author link is anonymised if you delete your account.
              </li>
            </ul>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <p>
                You can access, correct, download and delete your data, and withdraw consent, from settings or by
                contacting us.
              </p>
              <p>
                When you delete your account, we close it, and after a 30-day grace period we remove your email, name,
                phone and photo. Public content keeps anonymised authorship.
              </p>
            </>
          ),
        },
        { id: "grievance", title: "Grievances", body: <GrievanceBlock /> },
      ]}
    />
  );
}
