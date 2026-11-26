import { HomeButton, LoginButton } from "@/components/marketing/SystemLinks";
import { SystemPage } from "@/components/marketing/SystemPage";

export const metadata = { title: "No access", robots: { index: false } };

export default function ForbiddenPage() {
  return (
    <SystemPage
      code="403"
      art="rides"
      title="You don't have access to this page"
      description="Your account doesn't have permission to open it. If you think that's a mistake, log in with the right account."
      actions={
        <>
          <LoginButton />
          <HomeButton label="Home" />
        </>
      }
    />
  );
}
