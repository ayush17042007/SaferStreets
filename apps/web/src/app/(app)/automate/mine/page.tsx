import type { Metadata } from "next";
import { MyRides } from "@/components/automate/MyRides";

export const metadata: Metadata = { title: "My rides" };

export default function MyRidesPage() {
  return <MyRides />;
}
