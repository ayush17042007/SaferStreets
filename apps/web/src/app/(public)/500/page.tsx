import { HomeButton } from "@/components/marketing/SystemLinks";
import { SystemPage } from "@/components/marketing/SystemPage";

export const metadata = { title: "Something went wrong", robots: { index: false } };

/** Static copy of the 500 page so it can be reviewed and linked; the live boundary is app/error.tsx. */
export default function ServerErrorPage() {
  return (
    <SystemPage
      code="500"
      art="reports"
      title="Something went wrong on our side"
      description="We couldn't load this page. Try again in a moment."
      actions={<HomeButton />}
    />
  );
}
