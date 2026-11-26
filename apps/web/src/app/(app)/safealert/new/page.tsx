import type { Metadata } from "next";
import { NewAlertForm } from "@/components/safealert/NewAlertForm";

export const metadata: Metadata = { title: "Post an alert" };

export default function NewAlertPage() {
  return <NewAlertForm />;
}
