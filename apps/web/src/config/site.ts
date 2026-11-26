// Site-wide constants. Contact details for legal pages are placeholders until the team fills them in.
export const site = {
  name: "SaferStreets",
  tagline: "Safer Streets. Smarter Journeys. Stronger Communities.",
  description:
    "Report unsafe spots, share an auto, and let someone you trust know you're on your way. One account, four tools, built for campuses and commuters in India.",
  origin: process.env.APP_ORIGIN?.trim() || "http://localhost:3000",
  /** Shown on legal pages. Replace before launch (DPDP Act grievance officer). */
  grievance: {
    officer: "[Grievance officer name: to be added before launch]",
    email: "[grievance contact email: to be added before launch]",
    responseDays: 15,
  },
  /** Last edit date of the draft legal texts. */
  legalUpdated: "25 November 2026",
  draftNotice: "Draft: review with a lawyer before launch",
} as const;

export const publicLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/safety", label: "Safety disclaimer" },
  { href: "/about", label: "About" },
] as const;

/** Public pages for the sitemap. */
export const sitemapPaths = ["/", "/terms", "/privacy", "/safety", "/about"] as const;

/** 112 is the national emergency number (appendix-01 A1). Used only if the numbers API is unreachable. */
export const fallbackEmergencyNumbers = [{ key: "emergency", label: "Emergency", number: "112" }] as const;
