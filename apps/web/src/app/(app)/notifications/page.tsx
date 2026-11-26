import type { Metadata } from "next";
import { NotificationsList } from "@/components/saferoute/NotificationsList";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationsList />;
}
