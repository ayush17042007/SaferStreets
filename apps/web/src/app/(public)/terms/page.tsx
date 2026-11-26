import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Terms of use", description: "The rules for using SaferStreets." };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro="These terms explain how you may use SaferStreets, what we do and don't do, and what we expect from you."
      sections={[
        {
          id: "who",
          title: "Who can use SaferStreets",
          body: (
            <>
              <p>You must be 18 or older and log in with an email address you control. One person, one account.</p>
              <p>We may suspend accounts that break these terms or put other people at risk.</p>
            </>
          ),
        },
        {
          id: "service",
          title: "What the service is",
          body: (
            <>
              <p>
                SaferStreets lets you report unsafe places, share auto rides, tell a trusted contact about a journey and
                share community alerts. It is a community tool.
              </p>
              <p>
                It is not an emergency service. It does not track live location, it is not connected to the police or
                any authority, and it does not guarantee that an alert, email or reminder is delivered. In danger, call
                112.
              </p>
            </>
          ),
        },
        {
          id: "content",
          title: "Your content",
          body: (
            <>
              <p>
                You are responsible for what you post. Don&apos;t post anything false, abusive, unlawful or private to
                someone else.
              </p>
              <ul>
                <li>
                  Reports, alerts and rides may be reviewed, labelled &quot;Unverified&quot;, changed in status or
                  removed by moderators.
                </li>
                <li>False or abusive alerts can lead to strikes and loss of access to SafeAlert or your account.</li>
                <li>You keep ownership of your content and allow us to show it as the service needs.</li>
              </ul>
            </>
          ),
        },
        {
          id: "rides",
          title: "Shared rides",
          body: (
            <>
              <p>
                AutoMate connects people. We don&apos;t run the rides, check drivers or vehicles, or handle payments.
                Fares are estimates and riders settle them in person.
              </p>
              <p>Choose public, well-lit pickup points and use your own judgement. You can report or block any user.</p>
            </>
          ),
        },
        {
          id: "contacts",
          title: "Trusted contacts",
          body: (
            <p>
              Only add someone as a trusted contact if you have told them. They receive emails you trigger and can stop
              them at any time.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Limits of our responsibility",
          body: (
            <p>
              We provide SaferStreets as is. To the extent the law allows, we are not responsible for loss or harm
              arising from reliance on the service, delays or failures in notifications, or the actions of other users
              or authorities.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes and ending your account",
          body: (
            <p>
              We may update these terms and will tell you about important changes. You can delete your account at any
              time from settings. See the Privacy policy for what happens to your data.
            </p>
          ),
        },
      ]}
    />
  );
}
