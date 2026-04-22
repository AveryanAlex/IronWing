// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import InfoWidget from "./InfoWidget.svelte";

describe("InfoWidget", () => {
  afterEach(() => {
    cleanup();
  });

  it("toggles its popup content and closes on outside click", async () => {
    render(InfoWidget, {
      title: "Details",
      description: "Shared planning context description.",
      testId: "info-widget-button",
      panelTestId: "info-widget-panel",
      contentTestId: "info-widget-content",
    });

    expect(screen.queryByTestId("info-widget-panel")).toBeNull();

    await fireEvent.click(screen.getByTestId("info-widget-button"));
    await waitFor(() => {
      expect(screen.getByTestId("info-widget-panel")).toBeTruthy();
    });

    expect(screen.getByTestId("info-widget-content").textContent).toContain("Shared planning context description.");

    await fireEvent.click(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId("info-widget-panel")).toBeNull();
    });
  });

  it("closes with Escape", async () => {
    render(InfoWidget, {
      description: "Escapable info.",
      testId: "info-widget-button",
      panelTestId: "info-widget-panel",
    });

    await fireEvent.click(screen.getByTestId("info-widget-button"));
    await waitFor(() => {
      expect(screen.getByTestId("info-widget-panel")).toBeTruthy();
    });

    await fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("info-widget-panel")).toBeNull();
    });
  });
});
