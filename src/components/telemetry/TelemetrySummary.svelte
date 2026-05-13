<script lang="ts">
import { fromStore } from "svelte/store";

import { getSessionViewStoreContext } from "../../app/shell/runtime-context";
import type { TelemetrySummaryTone } from "../../lib/telemetry-selectors";
import { MetricGroup, MetricTile, Panel, SectionHeader, StatusPill } from "../ui";

type MetricTone = "neutral" | "info" | "success" | "warning" | "danger";

const sessionView = fromStore(getSessionViewStoreContext());

function mapTone(tone: TelemetrySummaryTone): MetricTone {
  switch (tone) {
    case "positive":
      return "success";
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

let view = $derived(sessionView.current);
let summary = $derived(view.telemetrySummary);
</script>

<Panel>
  <SectionHeader eyebrow="Telemetry summary" title="Live flight metrics">
    {#snippet actions()}
      <StatusPill>{summary.sessionLabel}</StatusPill>
    {/snippet}
  </SectionHeader>

  <div class="mt-3">
    <MetricGroup columns={5}>
      <MetricTile label="Altitude" value={summary.altitudeText} testId="telemetry-alt-value" />
      <MetricTile label="Speed" value={summary.speedText} testId="telemetry-speed-value" />
      <MetricTile
        label="Battery"
        value={summary.batteryText}
        tone={mapTone(summary.batteryTone)}
        testId="telemetry-battery-value"
      />
      <MetricTile label="Heading" value={summary.headingText} testId="telemetry-heading-value" />
      <MetricTile
        label="GPS"
        value={summary.gpsText}
        tone={mapTone(summary.gpsTone)}
        testId="telemetry-gps-text"
      />
    </MetricGroup>
  </div>
</Panel>
