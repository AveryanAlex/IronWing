<script lang="ts">
import { fromStore } from "svelte/store";

import type { CompactStatusNotice } from "../../statustext";
import type { ViewTone } from "../../lib/session-selectors";
import type { OperatorMetricState, OperatorMetricView } from "../../lib/telemetry-selectors";
import { appShellTestIds } from "./chrome-state";
import { getOperatorWorkspaceViewStoreContext, getShellChromeStoreContext } from "./runtime-context";

const operatorWorkspace = fromStore(getOperatorWorkspaceViewStoreContext());
const chrome = fromStore(getShellChromeStoreContext());

type StateCard = {
  key: string;
  label: string;
  value: string;
  tone: ViewTone;
  testId?: string;
};

type MetricCard = {
  key: string;
  label: string;
  metric: OperatorMetricView;
  testId?: string;
};

let view = $derived(operatorWorkspace.current);
let tier = $derived(chrome.current.tier);

function toneTextClass(tone: ViewTone): string {
  switch (tone) {
    case "positive":
      return "text-success";
    case "caution":
      return "text-warning";
    case "critical":
      return "text-danger";
    default:
      return "text-text-primary";
  }
}

function toneBadgeClass(tone: ViewTone): string {
  switch (tone) {
    case "positive":
      return "operator-workspace__badge--positive";
    case "caution":
      return "operator-workspace__badge--caution";
    case "critical":
      return "operator-workspace__badge--critical";
    default:
      return "operator-workspace__badge--neutral";
  }
}

function metricStateLabel(state: OperatorMetricState): string {
  switch (state) {
    case "live":
      return "live";
    case "degraded":
      return "degraded";
    case "stale":
      return "stale";
    default:
      return "unavailable";
  }
}

function metricStateClass(state: OperatorMetricState): string {
  switch (state) {
    case "live":
      return "operator-workspace__badge--positive";
    case "degraded":
      return "operator-workspace__badge--caution";
    case "stale":
      return "operator-workspace__badge--critical";
    default:
      return "operator-workspace__badge--neutral";
  }
}

function metricValueClass(metric: OperatorMetricView): string {
  if (metric.state === "stale") {
    return "text-text-secondary";
  }

  switch (metric.tone) {
    case "positive":
      return "text-success";
    case "caution":
      return "text-warning";
    case "critical":
      return "text-danger";
    default:
      return "text-text-primary";
  }
}

function noticeToneClass(notice: CompactStatusNotice): string {
  switch (notice.tone) {
    case "critical":
      return "operator-workspace__notice--critical";
    case "caution":
      return "operator-workspace__notice--caution";
    case "positive":
      return "operator-workspace__notice--positive";
    default:
      return "operator-workspace__notice--neutral";
  }
}

let stateCards = $derived.by<StateCard[]>(() => [
  {
    key: "arm",
    label: "Arm state",
    value: view.lifecycle.armStateText,
    tone: view.lifecycle.armStateTone,
    testId: "telemetry-state-value",
  },
  {
    key: "link",
    label: "Link",
    value: view.lifecycle.linkText,
    tone: view.lifecycle.linkTone,
  },
  {
    key: "mode",
    label: "Mode",
    value: view.lifecycle.modeText,
    tone: "neutral",
    testId: "telemetry-mode-value",
  },
  {
    key: "source",
    label: "Data feed",
    value: view.lifecycle.sourceText,
    tone: "neutral",
  },
]);

let primaryMetricCards = $derived.by<MetricCard[]>(() => [
  {
    key: "altitude",
    label: "Altitude",
    metric: view.primaryMetrics.altitude,
    testId: "telemetry-alt-value",
  },
  {
    key: "speed",
    label: "Speed",
    metric: view.primaryMetrics.speed,
    testId: "telemetry-speed-value",
  },
  {
    key: "battery",
    label: "Battery",
    metric: view.primaryMetrics.battery,
    testId: "telemetry-battery-value",
  },
  {
    key: "gps",
    label: "GPS",
    metric: view.primaryMetrics.gps,
    testId: "telemetry-gps-text",
  },
]);

let secondaryMetricCards = $derived.by<MetricCard[]>(() => [
  {
    key: "heading",
    label: "Heading",
    metric: view.secondaryMetrics.heading,
    testId: "telemetry-heading-value",
  },
  {
    key: "climb-rate",
    label: "Climb rate",
    metric: view.secondaryMetrics.climbRate,
  },
  {
    key: "battery-voltage",
    label: "Battery voltage",
    metric: view.secondaryMetrics.batteryVoltage,
  },
  {
    key: "satellites",
    label: "Satellites",
    metric: view.secondaryMetrics.satellites,
  },
]);
</script>

<section
  class="operator-workspace"
  data-shell-tier={tier}
  data-testid={appShellTestIds.operatorWorkspace}
>
  <div class="operator-workspace__overview">
    <section class="operator-card operator-workspace__hero" data-testid="operator-workspace-primary">
      <div class="operator-workspace__section-heading">
        <div>
          <p class="runtime-eyebrow">Operator overview</p>
          <h2 class="operator-workspace__title">Flight-critical state</h2>
        </div>
        <span
          class={`operator-workspace__badge ${toneBadgeClass(view.attentionTone)}`}
          data-testid="operator-workspace-attention"
        >
          {view.lifecycle.sessionLabel}
        </span>
      </div>

      <p class="operator-workspace__summary" data-testid="operator-workspace-summary">
        {view.readiness.label} · {view.lifecycle.systemText} · phase {view.lastPhase}
      </p>

      <div class="operator-workspace__badge-row" data-testid="operator-workspace-quality">
        <span
          class={`operator-workspace__badge ${toneBadgeClass(view.readiness.tone)}`}
          data-testid="operator-workspace-readiness"
        >
          {view.readiness.label}
        </span>

        {#if view.quality.stale}
          <span
            class="operator-workspace__badge operator-workspace__badge--critical"
            data-testid="operator-workspace-stale"
          >
            retained stale snapshot
          </span>
        {/if}

        {#if view.quality.disconnected}
          <span
            class="operator-workspace__badge operator-workspace__badge--neutral"
            data-testid="operator-workspace-disconnected"
          >
            link disconnected
          </span>
        {/if}

        {#if view.quality.telemetry.degraded}
          <span
            class="operator-workspace__badge operator-workspace__badge--caution"
            data-testid="operator-workspace-degraded-telemetry"
          >
            telemetry degraded
          </span>
        {/if}

        {#if view.quality.support.degraded}
          <span
            class="operator-workspace__badge operator-workspace__badge--caution"
            data-testid="operator-workspace-degraded-support"
          >
            support degraded
          </span>
        {/if}

        {#if view.quality.notices.degraded}
          <span
            class="operator-workspace__badge operator-workspace__badge--caution"
            data-testid="operator-workspace-degraded-notices"
          >
            notices degraded
          </span>
        {/if}
      </div>

      {#if view.lastError}
        <div class="operator-workspace__alert" data-testid="operator-workspace-last-error">
          <p class="operator-workspace__alert-label">Last error</p>
          <p class="operator-workspace__alert-copy">{view.lastError}</p>
        </div>
      {/if}

      <dl class="operator-workspace__state-grid">
        {#each stateCards as card (card.key)}
          <div class="operator-workspace__state-card" data-testid={card.testId}>
            <dt class="operator-workspace__card-label">{card.label}</dt>
            <dd class={`operator-workspace__state-value ${toneTextClass(card.tone)}`}>{card.value}</dd>
          </div>
        {/each}
      </dl>
    </section>

    <section class="operator-card operator-workspace__metrics" data-testid="operator-workspace-metrics">
      <div class="operator-workspace__section-heading">
        <div>
          <p class="runtime-eyebrow">Primary telemetry</p>
          <h2 class="operator-workspace__title">Immediate flight metrics</h2>
        </div>
        <span class="operator-workspace__section-copy">
          {view.quality.telemetry.provenance}
        </span>
      </div>

      <dl class="operator-workspace__metric-grid">
        {#each primaryMetricCards as card (card.key)}
          <div class="operator-workspace__metric-card" data-testid={card.testId}>
            <div class="operator-workspace__metric-header">
              <dt class="operator-workspace__card-label">{card.label}</dt>
              <span class={`operator-workspace__badge ${metricStateClass(card.metric.state)}`}>
                {metricStateLabel(card.metric.state)}
              </span>
            </div>
            <dd class={`operator-workspace__metric-value ${metricValueClass(card.metric)}`}>{card.metric.text}</dd>
          </div>
        {/each}
      </dl>
    </section>
  </div>

  <section class="operator-card" data-testid="operator-workspace-secondary">
    <div class="operator-workspace__section-heading">
      <div>
        <p class="runtime-eyebrow">Operational detail</p>
        <h2 class="operator-workspace__title">Second-layer metrics</h2>
      </div>
      <span class="operator-workspace__section-copy">
        {view.lifecycle.linkText} · {view.lifecycle.sourceText}
      </span>
    </div>

    <dl class="operator-workspace__metric-grid operator-workspace__metric-grid--secondary">
      {#each secondaryMetricCards as card (card.key)}
        <div class="operator-workspace__metric-card" data-testid={card.testId}>
          <div class="operator-workspace__metric-header">
            <dt class="operator-workspace__card-label">{card.label}</dt>
            <span class={`operator-workspace__badge ${metricStateClass(card.metric.state)}`}>
              {metricStateLabel(card.metric.state)}
            </span>
          </div>
          <dd class={`operator-workspace__metric-value ${metricValueClass(card.metric)}`}>{card.metric.text}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <section class="operator-card" data-testid="operator-workspace-notices">
    <div class="operator-workspace__section-heading">
      <div>
        <p class="runtime-eyebrow">Notice strip</p>
        <h2 class="operator-workspace__title">Scoped operator notices</h2>
      </div>
      <span class="operator-workspace__section-copy" data-testid="operator-workspace-notice-count">
        {view.notices.length} shown
      </span>
    </div>

    {#if view.notices.length > 0}
      <ul class="operator-workspace__notice-list">
        {#each view.notices as notice (notice.id)}
          <li
            class={`operator-workspace__notice ${noticeToneClass(notice)}`}
            data-notice-id={notice.id}
          >
            <span class="operator-workspace__notice-severity">{notice.severity}</span>
            <span class="operator-workspace__notice-text">{notice.text}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="operator-workspace__notice-empty" data-testid="operator-workspace-notices-empty">
        No active notices for this scope.
      </div>
    {/if}
  </section>
</section>
