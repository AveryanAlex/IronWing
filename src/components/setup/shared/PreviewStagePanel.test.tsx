// @vitest-environment jsdom

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { PreviewStagePanel, type PreviewRow } from "./PreviewStagePanel";

afterEach(() => {
  cleanup();
});

describe("PreviewStagePanel", () => {
  it("derives the header and stage button label from change counts", () => {
    const rows: PreviewRow[] = [
      { key: "rtl", label: "RTL Altitude", willChange: true },
      { key: "land", label: "Land Speed", willChange: false },
    ];

    render(
      <PreviewStagePanel
        rows={rows}
        onStage={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText("Preview: 1 of 2 will change")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stage 1 Change" })).toBeTruthy();
  });

  it("disables the stage button when nothing will change", () => {
    const rows: PreviewRow[] = [
      { key: "rtl", label: "RTL Altitude", willChange: false },
      { key: "land", label: "Land Speed", willChange: false },
    ];

    render(
      <PreviewStagePanel
        rows={rows}
        onStage={() => {}}
        onCancel={() => {}}
      />,
    );

    const stageButton = screen.getByRole("button", { name: "Stage 0 Changes" });
    expect((stageButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("already set")).toHaveLength(2);
  });

  it("makes only changed rows interactive and supports mouse plus keyboard activation", () => {
    const onRowClick = vi.fn();
    const rows: PreviewRow[] = [
      {
        key: "rtl",
        label: "RTL Altitude",
        paramName: "RTL_ALT",
        detail: "15 m → 25 m",
        willChange: true,
      },
      {
        key: "land",
        label: "Land Speed",
        paramName: "LAND_SPEED",
        willChange: false,
      },
    ];

    render(
      <PreviewStagePanel
        rows={rows}
        onStage={() => {}}
        onCancel={() => {}}
        onRowClick={onRowClick}
      />,
    );

    const rowButton = screen.getByRole("button", { name: /RTL Altitude/i });
    fireEvent.click(rowButton);
    fireEvent.keyDown(rowButton, { key: "Enter" });

    expect(onRowClick).toHaveBeenNthCalledWith(1, rows[0]);
    expect(onRowClick).toHaveBeenNthCalledWith(2, rows[0]);
    expect(screen.queryByRole("button", { name: /Land Speed/i })).toBeNull();
  });

  it("renders footer content and wires the cancel action", () => {
    const onCancel = vi.fn();

    render(
      <PreviewStagePanel
        rows={[{ key: "rtl", label: "RTL Altitude", willChange: true }]}
        onStage={() => {}}
        onCancel={onCancel}
        footer={<div>Preview footer</div>}
      />,
    );

    expect(screen.getByText("Preview footer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
