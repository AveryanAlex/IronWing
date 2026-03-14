// @vitest-environment jsdom

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { MissionTransferStatus } from "./MissionTransferStatus";
import type { TransferUi } from "../../hooks/use-mission";

afterEach(() => {
  cleanup();
});

function makeTransferUi(overrides: Partial<TransferUi> = {}): TransferUi {
  return {
    active: false,
    hasProgress: false,
    progressPct: 0,
    direction: null,
    completedItems: 0,
    totalItems: 0,
    ...overrides,
  };
}

describe("MissionTransferStatus", () => {
  it("renders nothing when there is no active transfer, progress, or roundtrip status", () => {
    const { container } = render(
      <MissionTransferStatus transferUi={makeTransferUi()} roundtripStatus="" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders upload progress and lets the user cancel an active transfer", () => {
    const onCancel = vi.fn();

    render(
      <MissionTransferStatus
        transferUi={makeTransferUi({
          active: true,
          hasProgress: true,
          progressPct: 40,
          direction: "upload",
          completedItems: 2,
          totalItems: 5,
        })}
        roundtripStatus=""
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Uploading")).toBeTruthy();
    expect(screen.getByText("2/5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders roundtrip status text when there is no progress bar to show", () => {
    render(
      <MissionTransferStatus
        transferUi={makeTransferUi({ direction: "download" })}
        roundtripStatus="Roundtrip: pass"
      />,
    );

    expect(screen.getByText("Roundtrip: pass")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
