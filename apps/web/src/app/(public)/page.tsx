import type { Metadata } from "next";
import { Footer } from "@/components/marketing/Footer";
import { LandingNav } from "@/components/marketing/LandingNav";
import {
  CtaBand,
  Faq,
  Hero,
  HowItWorks,
  ModuleBento,
  SafetyAndLimits,
  SpeedStrip,
} from "@/components/marketing/LandingSections";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: { absolute: `${site.name}: light up every journey` },
  description: site.description,
  alternates: { canonical: "/" },
};

// Static: no data fetching, no cookies. Rendered at build time.
export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main id="main">
        <Hero />
        <SpeedStrip />
        <ModuleBento />
        <HowItWorks />
        <SafetyAndLimits />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
