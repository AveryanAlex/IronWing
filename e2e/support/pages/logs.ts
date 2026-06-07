import { expect, type Page } from "@playwright/test";

import { expectLayoutTargetsReachable, noopLayoutAudit, type LayoutAudit } from "../layout";

const ids = {
  libraryEmpty: "logs-library-empty",
  libraryPanel: "logs-library-panel",
  playbackLabel: "logs-playback-label",
  recordingPanel: "logs-recording-panel",
  recordingStatus: "logs-recording-status",
  replayPanel: "logs-replay-panel",
  root: "logs-workspace-root",
} as const;

export class LogsWorkspacePage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async expectEmptyAndIdle(): Promise<void> {
    await expect(this.page.getByTestId(ids.root)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.libraryPanel)).toBeVisible();
    await expect(this.page.getByTestId(ids.libraryEmpty)).toBeVisible();
    await expect(this.page.getByTestId(ids.recordingPanel)).toBeVisible();
    await expect(this.page.getByTestId(ids.recordingStatus)).toContainText(/Recorder idle/i);
    await expect(this.page.getByTestId(ids.replayPanel)).toBeVisible();
    await expect(this.page.getByTestId(ids.playbackLabel)).toContainText(/Replay idle/i);
    await expect(this.page.getByText("Select a log to inspect it.")).toBeVisible();
    await this.auditLayout("logs empty idle");
  }

  async expectPrimarySurfacesReachable(label = "logs"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "log library", locator: this.page.getByTestId(ids.libraryPanel) },
      { label: "recording panel", locator: this.page.getByTestId(ids.recordingPanel) },
      { label: "replay panel", locator: this.page.getByTestId(ids.replayPanel) },
    ]);
  }
}
