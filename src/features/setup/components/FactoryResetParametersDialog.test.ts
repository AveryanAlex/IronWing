// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import FactoryResetParametersDialog from "./FactoryResetParametersDialog.svelte";

afterEach(() => {
  cleanup();
});

describe("FactoryResetParametersDialog", () => {
  it("requires an explicit acknowledgement before requesting the reset", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(FactoryResetParametersDialog, { props: { onConfirm } });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewFactoryReset));

    const confirm = await screen.findByTestId(setupWorkspaceTestIds.overviewFactoryResetConfirm);
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/removes airframe settings, calibrations, flight modes/i)).toBeTruthy();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewFactoryResetAcknowledge));
    expect(confirm.hasAttribute("disabled")).toBe(false);

    await fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByTestId(setupWorkspaceTestIds.overviewFactoryResetDialog)).toBeNull();
    });
  });

  it("keeps the warning open when the reset operation fails", async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error("write failed");
    });
    render(FactoryResetParametersDialog, { props: { onConfirm } });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewFactoryReset));
    await fireEvent.click(await screen.findByTestId(setupWorkspaceTestIds.overviewFactoryResetAcknowledge));
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewFactoryResetConfirm));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewFactoryResetDialog)).toBeTruthy();
  });
});
