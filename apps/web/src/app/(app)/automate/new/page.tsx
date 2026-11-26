import type { Metadata } from "next";
import NewRideForm from "@/components/automate/NewRideForm";

export const metadata: Metadata = { title: "Offer a ride" };

export default function NewRidePage() {
  return <NewRideForm />;
}
