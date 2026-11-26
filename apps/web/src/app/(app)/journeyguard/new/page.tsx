import { redirect } from "next/navigation";

// The start form lives on the JourneyGuard home; older links still land there.
export default function NewJourneyPage() {
  redirect("/journeyguard");
}
