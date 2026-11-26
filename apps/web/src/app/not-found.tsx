import { HomeButton } from "@/components/marketing/SystemLinks";
import { SystemPage } from "@/components/marketing/SystemPage";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <SystemPage
      code="404"
      title="We couldn't find that page"
      description="The link may be old or the page may have moved. Check the address or head back home."
      actions={<HomeButton />}
    />
  );
}
