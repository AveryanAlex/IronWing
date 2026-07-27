import { expect, type Page } from "@playwright/test";

import { expectLayoutTargetsReachable, noopLayoutAudit, type LayoutAudit } from "../layout";
import { expectLiveMetric } from "./utils";

const ids = {
  altitude: "telemetry-alt-value",
  battery: "telemetry-battery-value",
  gps: "telemetry-gps-text",
  speed: "telemetry-speed-value",
} as const;

export class TelemetryWorkspacePage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async expectLiveMetrics(): Promise<void> {
    await expectLiveMetric(this.page, ids.altitude);
    await expectLiveMetric(this.page, ids.speed);
    await expectLiveMetric(this.page, ids.battery);
    await expectLiveMetric(this.page, ids.gps);
    await this.auditLayout("telemetry live metrics");
  }

  async expectAttitudeVisualization(): Promise<void> {
    const attitudeRegion = this.page.getByRole("region", { name: "Vehicle attitude orientation" });
    const attitude = attitudeRegion.getByRole("img", {
      name: "Three-dimensional vehicle attitude, north referenced",
    });
    const canvas = attitude.locator("canvas");
    await expect(attitude).toBeVisible();

    const supportsWebGl2 = await canvas.evaluate((element) => {
      return Boolean((element as HTMLCanvasElement).getContext("webgl2"));
    });

    if (supportsWebGl2) {
      await expect(canvas).toHaveClass(/opacity-100/);
    } else {
      await expect(attitudeRegion.getByRole("status")).toContainText("3D view unavailable");
    }

    await expect(attitudeRegion.getByText("live", { exact: true })).toBeVisible();
  }

  async expectPrimarySurfacesReachable(label = "telemetry"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "altitude metric", locator: this.page.getByTestId(ids.altitude).first() },
      { label: "speed metric", locator: this.page.getByTestId(ids.speed).first() },
      { label: "battery metric", locator: this.page.getByTestId(ids.battery).first() },
      { label: "GPS metric", locator: this.page.getByTestId(ids.gps).first() },
    ]);
  }
}
