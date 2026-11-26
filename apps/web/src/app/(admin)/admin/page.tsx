import type { Metadata } from "next";
import { OverviewView } from "@/components/admin/OverviewView";

export const metadata: Metadata = { title: "Admin overview" };

export default function Page() {
  return <OverviewView />;
}
