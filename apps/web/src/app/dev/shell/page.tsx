import { notFound } from "next/navigation";
import { ShellPreview } from "./ShellPreview";

export const metadata = { title: "Shell · SaferStreets dev", robots: { index: false } };

/** Dev-only: renders the app shell with clearly labelled dev props so it can be screenshotted. */
export default function DevShellPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string; active?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  return <ShellPreview searchParams={searchParams} />;
}
