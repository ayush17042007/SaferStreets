import { SettingsView } from "@/components/profile/SettingsView";
import { requireMe } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireMe();
  return <SettingsView me={me} />;
}
