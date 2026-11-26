import type { Metadata } from "next";
import { FlagsView } from "@/components/admin/FlagsView";

export const metadata: Metadata = { title: "Flags" };

export default function Page() {
  return <FlagsView />;
}
