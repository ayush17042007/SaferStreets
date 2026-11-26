import Link from "next/link";
import { Button } from "@/components/ui";

export function HomeButton({ label = "Back to home" }: { label?: string }) {
  return (
    <Button asChild size="mobile">
      <Link href="/">{label}</Link>
    </Button>
  );
}

export function LoginButton() {
  return (
    <Button asChild size="mobile">
      <Link href="/login">Log in</Link>
    </Button>
  );
}
