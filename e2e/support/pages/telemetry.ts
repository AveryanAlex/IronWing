import type { Page } from "@playwright/test";

import { expectLayoutTargetsReachable } from "../layout";
import { expectLiveMetric } from "./utils";

const ids = {
  altitude: "telemetry-alt-value",
  battery: "telemetry-battery-value",
  gps: "telemetry-gps-text",
  speed: "telemetry-speed-value",
} as const;

export class TelemetryWorkspacePage {
  constructor(private readonly page: Page) {}

  async expectLiveMetrics(): Promise<void> {
    await expectLiveMetric(this.page, ids.altitude);
    await expectLiveMetric(this.page, ids.speed);
    await expectLiveMetric(this.page, ids.battery);
    await expectLiveMetric(this.page, ids.gps);
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
