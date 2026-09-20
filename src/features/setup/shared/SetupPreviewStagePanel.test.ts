// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupControlLocked } from "../../../lib/setup/control-availability";
import SetupPreviewStagePanel from "./SetupPreviewStagePanel.svelte";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SetupPreviewStagePanel", () => {
  it("explains dependency locks without staging the preview", async () => {
    const onStage = vi.fn();
    render(SetupPreviewStagePanel, {
      props: {
        rows: [{ key: "mode-1", label: "Flight mode 1", willChange: true }],
        onStage,
        onCancel: () => {},
        stageAvailability: setupControlLocked(
          "dependency",
          "Live validation required",
          "Wait for the active vehicle to provide its available-mode list.",
        ),
      },
    });

    expect((screen.getByRole("button", { name: "Stage 1 Change" }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByLabelText(/Stage 1 Change.*Live validation required/i));
    expect(await screen.findByText(/available-mode list/i)).toBeTruthy();
    expect(onStage).not.toHaveBeenCalled();
  });
});
