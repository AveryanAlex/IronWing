import { expect, type Page } from "@playwright/test";

import { expectLayoutTargetsReachable } from "../layout";
import { expectLiveMetric } from "./utils";

const ids = {
  disconnected: "operator-workspace-disconnected",
  map: "overview-map-root",
  readiness: "operator-workspace-readiness",
  root: "app-shell-operator-workspace",
  telemetryAltitude: "telemetry-alt-value",
  telemetryMode: "telemetry-mode-value",
  telemetrySpeed: "telemetry-speed-value",
  telemetryState: "telemetry-state-value",
} as const;

export class OverviewWorkspacePage {
  constructor(private readonly page: Page) {}

  async expectLive(): Promise<void> {
    await expect(this.page.getByTestId(ids.root)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.map)).toBeVisible();
    await expect(this.page.getByTestId(ids.disconnected)).toHaveCount(0);
    await expect(this.page.getByTestId(ids.readiness)).toBeVisible();
    await this.expectLiveSummaryMetrics();
  }

  async expectLiveSummaryMetrics(): Promise<void> {
    await expectLiveMetric(this.page, ids.telemetryState);
    await expectLiveMetric(this.page, ids.telemetryMode);
    await expectLiveMetric(this.page, ids.telemetryAltitude);
    await expectLiveMetric(this.page, ids.telemetrySpeed);
  }

  async expectPrimarySurfacesReachable(label = "overview"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "overview map", locator: this.page.getByTestId(ids.map) },
      { label: "readiness summary", locator: this.page.getByTestId(ids.readiness) },
      { label: "altitude metric", locator: this.page.getByTestId(ids.telemetryAltitude).first() },
      { label: "speed metric", locator: this.page.getByTestId(ids.telemetrySpeed).first() },
    ]);
  }
}
