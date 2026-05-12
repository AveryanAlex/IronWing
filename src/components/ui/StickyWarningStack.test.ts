// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import StickyWarningStack from "./StickyWarningStack.svelte";
import type { Warning } from "../../lib/warnings/warning-model";

describe("StickyWarningStack", () => {
  afterEach(() => {
    cleanup();
  });

  it("orders warnings by severity (blocking before danger before warning before info)", () => {
    const warnings: Warning[] = [
      { id: "a", severity: "info", title: "Info note" },
      { id: "b", severity: "blocking", title: "Blocking issue" },
      { id: "c", severity: "warning", title: "Caution" },
      { id: "d", severity: "danger", title: "Danger ahead" },
    ];
    const { container } = render(StickyWarningStack, { props: { warnings } });
    const titles = Array.from(container.querySelectorAll(".ui-banner__title")).map((el) => el.textContent);
    expect(titles).toEqual(["Blocking issue", "Danger ahead", "Caution", "Info note"]);
  });

  it("renders only the first maxVisible warnings and shows an overflow counter", () => {
    const warnings: Warning[] = Array.from({ length: 6 }, (_, i) => ({
      id: `w-${i}`,
      severity: "warning" as const,
      title: `Warning ${i}`,
    }));
    const { container, getByText } = render(StickyWarningStack, { props: { warnings, maxVisible: 4 } });
    const titles = Array.from(container.querySelectorAll(".ui-banner__title")).map((el) => el.textContent);
    expect(titles).toEqual(["Warning 0", "Warning 1", "Warning 2", "Warning 3"]);
    expect(getByText("2 more warnings")).toBeTruthy();
  });

  it("uses singular overflow copy when exactly one warning is hidden", () => {
    const warnings: Warning[] = Array.from({ length: 5 }, (_, i) => ({
      id: `w-${i}`,
      severity: "warning" as const,
      title: `Warning ${i}`,
    }));
    const { getByText } = render(StickyWarningStack, { props: { warnings, maxVisible: 4 } });
    expect(getByText("1 more warning")).toBeTruthy();
  });

  it("threads per-warning callbacks and testIds to the underlying Banner", async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const warnings: Warning[] = [
      {
        id: "x",
        severity: "warning",
        title: "Stale data",
        message: "Refresh to continue.",
        actionLabel: "Refresh",
        onAction,
        dismissible: true,
        onDismiss,
        testId: "warning-x",
        actionTestId: "warning-x-action",
        dismissTestId: "warning-x-dismiss",
      },
    ];
    const { getByTestId } = render(StickyWarningStack, {
      props: { warnings, testId: "stack" },
    });

    expect(getByTestId("stack")).toBeTruthy();
    expect(getByTestId("warning-x")).toBeTruthy();

    await fireEvent.click(getByTestId("warning-x-action"));
    await fireEvent.click(getByTestId("warning-x-dismiss"));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders detail lines from warning.details", () => {
    const warnings: Warning[] = [
      {
        id: "y",
        severity: "warning",
        title: "Details inside",
        details: ["First detail", "Second detail"],
      },
    ];
    const { getByText } = render(StickyWarningStack, { props: { warnings } });
    expect(getByText("First detail")).toBeTruthy();
    expect(getByText("Second detail")).toBeTruthy();
  });
});
