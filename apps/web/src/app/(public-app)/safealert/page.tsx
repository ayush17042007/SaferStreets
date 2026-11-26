import type { Metadata } from "next";
import { AlertsFeed } from "@/components/safealert/AlertsFeed";
import { getMeOrNull } from "@/lib/session";

export const metadata: Metadata = { title: "SafeAlert" };

export default async function SafeAlertPage() {
  const me = await getMeOrNull();
  return <AlertsFeed signedIn={me !== null} />;
}
