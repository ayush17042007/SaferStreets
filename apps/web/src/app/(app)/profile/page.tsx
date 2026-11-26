import { ProfileView } from "@/components/profile/ProfileView";
import { requireMe } from "@/lib/session";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const me = await requireMe();
  return <ProfileView me={me} />;
}
