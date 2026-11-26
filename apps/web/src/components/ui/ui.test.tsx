import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, OTPInput, StatusChip, chipVariants, statusTone, type StatusName } from "@/components/ui";
import { icons } from "@/design/icons";
import { focusRing, sizes } from "@/design/tokens";
import { readFileSync } from "node:fs";

function Harness({ onComplete }: { onComplete?: (v: string) => void }) {
  const [v, setV] = useState("");
  return <OTPInput value={v} onChange={setV} {...(onComplete ? { onComplete } : {})} />;
}

describe("OTPInput", () => {
  it("renders six boxes sized 48 x 56 with labels", () => {
    render(<Harness />);
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(6);
    expect(boxes[0]).toHaveAttribute("aria-label", "Digit 1 of 6");
    expect(boxes[0]).toHaveClass("h-14", "w-12"); // 56 x 48 on the 4 px grid
    expect(sizes["otp-box-w"]).toBe(48);
    expect(sizes["otp-box-h"]).toBe(56);
  });

  it("auto-advances after each digit and completes on the sixth", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const boxes = screen.getAllByRole("textbox");
    boxes[0]!.focus();
    await user.keyboard("123");
    expect(boxes[3]).toHaveFocus();
    expect((boxes[0] as HTMLInputElement).value).toBe("1");
    await user.keyboard("456");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("ignores non-digits", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const boxes = screen.getAllByRole("textbox");
    boxes[0]!.focus();
    await user.keyboard("a1b");
    expect((boxes[0] as HTMLInputElement).value).toBe("1");
    expect(boxes[1]).toHaveFocus();
  });

  it("fills all boxes from a pasted code", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const boxes = screen.getAllByRole("textbox");
    boxes[2]!.focus();
    await user.paste("48 29-17");
    expect(boxes.map((b) => (b as HTMLInputElement).value).join("")).toBe("482917");
    expect(onComplete).toHaveBeenCalledWith("482917");
  });

  it("backspace clears the box, then steps back and clears the previous one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const boxes = screen.getAllByRole("textbox");
    boxes[0]!.focus();
    await user.keyboard("12");
    expect(boxes[2]).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(boxes[1]).toHaveFocus();
    expect((boxes[1] as HTMLInputElement).value).toBe("");
    expect((boxes[0] as HTMLInputElement).value).toBe("1");
    await user.keyboard("{Backspace}");
    expect((boxes[0] as HTMLInputElement).value).toBe("");
    expect(boxes[0]).toHaveFocus();
  });

  it("shows an error with role alert and marks boxes invalid", () => {
    render(<OTPInput value="123456" onChange={() => {}} error="That code has expired. Request a new one." />);
    expect(screen.getByRole("alert")).toHaveTextContent("That code has expired.");
    expect(screen.getAllByRole("textbox")[0]).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("group")).toHaveClass("shake");
  });
});

describe("Button", () => {
  it("loading disables the button, shows a spinner and sets aria-busy", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector("svg.spin")).not.toBeNull();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled does not fire clicks and has a visible disabled style", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Continue
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Continue" });
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn.className).toContain("disabled:opacity-50");
  });

  it("uses the A2 heights: 40 default, 44 mobile, 48 hero", () => {
    render(
      <>
        <Button>a</Button>
        <Button size="mobile">b</Button>
        <Button size="hero">c</Button>
      </>,
    );
    expect(screen.getByText("a")).toHaveClass("h-10");
    expect(screen.getByText("b")).toHaveClass("h-11");
    expect(screen.getByText("c")).toHaveClass("h-12");
  });

  it("adds a trailing amber arrow on ink buttons", () => {
    render(<Button trailingArrow>Continue</Button>);
    expect(screen.getByRole("button").querySelector("svg.text-amber")).not.toBeNull();
  });

  it("forced focus applies the global focus-ring class", () => {
    render(<Button forceState="focus">Focus</Button>);
    expect(screen.getByRole("button")).toHaveClass("force-focus");
  });
});

describe("StatusChip", () => {
  it("maps every A2 status to its tint and text colours", () => {
    const expected: Record<string, keyof typeof chipVariants> = {
      Submitted: "neutral",
      Full: "neutral",
      Cancelled: "neutral",
      "Under review": "amber",
      Unverified: "amber",
      Verified: "mint",
      Resolved: "mint",
      Accepted: "mint",
      "In progress": "periwinkle",
      "Active journey": "periwinkle",
      Rejected: "coral",
      Overdue: "coral",
      Dismissed: "coral",
    };
    for (const [status, tone] of Object.entries(expected)) {
      expect(statusTone[status as StatusName]).toBe(tone);
      const { unmount } = render(<StatusChip status={status as StatusName} />);
      const chip = screen.getByText(status);
      for (const cls of chipVariants[tone].cls.split(" ")) expect(chip).toHaveClass(cls);
      unmount();
    }
  });

  it("is 24 px high, pill shaped, 12 px text, and always shows the label (never colour alone)", () => {
    render(<StatusChip status="Verified" icon="verified" />);
    const chip = screen.getByText("Verified");
    expect(chip).toHaveClass("h-6", "rounded-chip", "text-[12px]", "font-medium");
    expect(chip).toHaveTextContent("Verified");
    expect(sizes.chip).toBe(24);
    expect(chip.querySelector("svg")).not.toBeNull();
  });
});

describe("focus ring and touch targets", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("globals.css applies the A2 focus ring to every interactive element", () => {
    expect(css).toMatch(/:where\(a, button, input, textarea, select[^)]*\):focus-visible/);
    expect(css).toContain("outline: var(--focus-outline)");
    expect(css).toContain("outline-offset: var(--focus-offset)");
    expect(css).toContain("box-shadow: var(--focus-glow)");
    expect(focusRing.outline).toBe("2px solid #111A3B");
    expect(focusRing.offset).toBe("2px");
    expect(focusRing.glow).toBe("0 0 0 4px rgba(255,176,32,0.45)");
  });

  it("honours prefers-reduced-motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("keeps the 44 px minimum touch target token", () => {
    expect(sizes["touch-min"]).toBe(44);
  });

  it("maps the A3 icon names", () => {
    for (const name of [
      "logo",
      "dashboard",
      "saferoute",
      "automate",
      "journeyguard",
      "safealert",
      "emergency",
      "streetlight",
      "poorLighting",
      "pothole",
      "damagedRoad",
      "footpath",
      "isolatedArea",
    ] as const) {
      expect(icons[name]).toBeDefined();
    }
  });
});
