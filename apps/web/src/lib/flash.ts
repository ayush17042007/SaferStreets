// A one-shot message that survives navigation between route groups (each group has its own providers,
// so a toast shown right before router.push would be lost). Shown by <FlashToast /> in AppProviders.
const KEY = "ss_flash";

export function setFlash(message: string): void {
  try {
    window.sessionStorage.setItem(KEY, message);
  } catch {
    /* storage unavailable: the message is simply skipped */
  }
}

export function consumeFlash(): string | null {
  try {
    const m = window.sessionStorage.getItem(KEY);
    if (m) window.sessionStorage.removeItem(KEY);
    return m;
  } catch {
    return null;
  }
}
