import type { Metadata } from "next";
import { QueueView } from "@/components/admin/QueueView";

export const metadata: Metadata = { title: "Moderation queue" };

export default function Page() {
  return <QueueView />;
}
