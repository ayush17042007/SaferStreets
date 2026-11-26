import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { SosControl } from "@/components/dashboard/SosControl";
import type { SosAlarmController, SosAudioStatus } from "@/lib/sos-alarm";
import { SosBanner } from "./SosBanner";
import { SosProvider } from "./SosProvider";

function makeFakeAlarm(status: SosAudioStatus = "playing"): SosAlarmController & {
  startSpy: ReturnType<typeof vi.fn>;
  stopSpy: ReturnType<typeof vi.fn>;
} {
  let playing = false;
  const startSpy = vi.fn(async () => {
    playing = status === "playing";
    return status;
  });
  const stopSpy = vi.fn(() => {
    playing = false;
  });
  return {
    start: startSpy,
    stop: stopSpy,
    isPlaying: () => playing,
    startSpy,
    stopSpy,
  };
}

describe("SOS emergency alarm UI", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires confirmation, activates SOS, stops cleanly, and passes axe", async () => {
    const alarm = makeFakeAlarm("playing");
    const { container, unmount } = render(
      <SosProvider createAlarm={() => alarm}>
        <SosBanner />
        <SosControl />
      </SosProvider>,
    );

    // Idle state: prominent SOS button, no active banner, no axe violations.
    const trigger = screen.getByRole("button", { name: "SOS: Activate emergency alarm" });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByText("SOS ACTIVE")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Clicking opens confirmation dialog; alarm does not start yet.
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(alarm.startSpy).not.toHaveBeenCalled();

    // Confirming starts the alarm and shows the active banner + Stop SOS.
    await userEvent.click(screen.getByRole("button", { name: "Activate SOS alarm" }));
    expect(alarm.startSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("SOS ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("Emergency alarm is playing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Post a SafeAlert/ })).toHaveAttribute("href", "/safealert/new");
    expect(await axe(container)).toHaveNoViolations();

    // Stopping resets the UI and stops the audio controller.
    await userEvent.click(screen.getByRole("button", { name: "Stop SOS" }));
    expect(alarm.stopSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("SOS ACTIVE")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SOS: Activate emergency alarm" })).toBeInTheDocument();

    unmount();
    expect(alarm.stopSpy).toHaveBeenCalledTimes(2);
  });

  it("shows a calm fallback message when browser audio is blocked", async () => {
    const alarm = makeFakeAlarm("blocked");
    render(
      <SosProvider createAlarm={() => alarm}>
        <SosBanner />
        <SosControl />
      </SosProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "SOS: Activate emergency alarm" }));
    await userEvent.click(screen.getByRole("button", { name: "Activate SOS alarm" }));

    expect(await screen.findByText("SOS ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("Alarm state active (audio blocked by browser)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop SOS" })).toBeInTheDocument();
  });
});
