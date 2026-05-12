// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import Banner from "./Banner.svelte";

describe("Banner", () => {
  afterEach(() => {
    cleanup();
  });

  it("calls onAction and onDismiss", async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const { getByRole, getByLabelText } = render(Banner, {
      props: {
        title: "Mission upload failed",
        message: "Vehicle did not acknowledge the last item.",
        severity: "danger",
        actionLabel: "Retry",
        onAction,
        dismissible: true,
        onDismiss,
      },
    });

    await fireEvent.click(getByRole("button", { name: "Retry" }));
    await fireEvent.click(getByLabelText("Dismiss"));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
