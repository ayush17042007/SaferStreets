"use client";

import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, Icon } from "@/components/ui";
import { api } from "@/lib/api";

export interface ShellUser {
  name: string;
  avatarUrl?: string | null | undefined;
}

/** Avatar button with a menu: Profile, Settings, Log out (the profile menu from A5.7). */
export function UserMenu({ user, size = 32 }: { user: ShellUser; size?: 32 | 40 }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Even if the call fails, leave: the cookie may already be gone.
    }
    router.replace("/login");
    router.refresh();
  }

  const item =
    "flex min-h-11 items-center gap-3 rounded-control-sm px-3 text-[14px] leading-5 font-medium text-ink hover:bg-neutral-bubble";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Account menu for ${user.name}`}
        className="flex h-11 w-11 items-center justify-center rounded-avatar"
      >
        <Avatar name={user.name} size={size} imageUrl={user.avatarUrl ?? null} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="fade-in z-50 w-56 rounded-card border border-line bg-card p-2 shadow-popover"
        >
          <p className="truncate px-3 py-2 text-[12px] leading-4 text-text-secondary">{user.name}</p>
          <Link href="/profile" className={item} onClick={() => setOpen(false)}>
            <Icon name="profile" size={18} />
            Profile
          </Link>
          <Link href="/settings" className={item} onClick={() => setOpen(false)}>
            <Icon name="settings" size={18} />
            Settings
          </Link>
          <button type="button" className={`${item} w-full text-left`} onClick={logout} disabled={busy}>
            <Icon name="back" size={18} />
            Log out
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
