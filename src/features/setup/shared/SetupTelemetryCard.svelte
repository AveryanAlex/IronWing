<script lang="ts">
import type { SvelteComponent } from "svelte";

import { HelperText, MetricGroup, MetricTile, StatusPill } from "../../../components/ui";
import SetupSectionCard from "./SetupSectionCard.svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export type SetupTelemetryMetric = {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  tone?: Tone;
  stale?: boolean;
  unavailable?: boolean;
  mono?: boolean;
  testId?: string;
};

type Props = {
  icon?: IconComponent;
  title: string;
  description?: string;
  statusText?: string;
  statusTone?: Tone;
  statusTestId?: string;
  metrics: SetupTelemetryMetric[];
  columns?: number;
  testId?: string;
};

let {
  icon,
  title,
  description,
  statusText,
  statusTone = "neutral",
  statusTestId,
  metrics,
  columns = 4,
  testId,
}: Props = $props();
</script>

{#snippet statusBadge()}
  {#if statusText}
    <StatusPill tone={statusTone} testId={statusTestId}>{statusText}</StatusPill>
  {/if}
{/snippet}

<SetupSectionCard {icon} {title} {description} status={statusText ? statusBadge : undefined} {testId}>
  <MetricGroup {columns}>
    {#each metrics as metric (metric.label)}
      <div class="min-w-0">
        <MetricTile
          label={metric.label}
          value={metric.value}
          unit={metric.unit}
          tone={metric.tone ?? "neutral"}
          stale={metric.stale ?? false}
          unavailable={metric.unavailable ?? false}
          mono={metric.mono ?? false}
          testId={metric.testId}
        />
        {#if metric.detail}
          <HelperText class="mt-1" size="xs" tone="muted">{metric.detail}</HelperText>
        {/if}
      </div>
    {/each}
  </MetricGroup>
</SetupSectionCard>
