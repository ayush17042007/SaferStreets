import type { Metadata } from "next";
import { MyReports } from "@/components/saferoute/MyReports";

export const metadata: Metadata = { title: "My reports" };

export default function MyReportsPage() {
  return <MyReports />;
}
