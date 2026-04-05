<script lang="ts">
import { BATTERY_CHEMISTRIES } from "../../data/battery-presets";
import type {
  ParameterWorkflowCard as ParameterWorkflowCardModel,
  ParameterWorkflowCardId,
  ParameterWorkflowRecommendation,
} from "../../lib/params/parameter-workflows";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";

type BatteryControls = {
  cellCountInput: string;
  chemistryIndex: number;
  validationMessage: string | null;
  onCellCountInput: (value: string) => void;
  onChemistryChange: (value: number) => void;
};

type FlightControls = {
  propInchesInput: string;
  validationMessage: string | null;
  onPropInchesInput: (value: string) => void;
};

let {
  card,
  batteryControls = null,
  flightControls = null,
  onStage,
  onOpenAdvanced,
}: {
  card: ParameterWorkflowCardModel;
  batteryControls?: BatteryControls | null;
  flightControls?: FlightControls | null;
  onStage: (cardId: ParameterWorkflowCardId) => void;
  onOpenAdvanced: () => void;
} = $props();

let validationMessage = $derived(
  card.id === "battery"
    ? batteryControls?.validationMessage ?? null
    : card.id === "flight"
      ? flightControls?.validationMessage ?? null
      : null,
);

function stageButtonDisabled() {
  return card.status !== "ready" || card.changedCount === 0 || card.queuedCount === card.changedCount || Boolean(validationMessage);
}

function stageButtonLabel() {
  if (card.status !== "ready") {
    return "Guided changes unavailable";
  }

  if (validationMessage) {
    return "Fix inputs to queue";
  }

  if (card.changedCount === 0) {
    return "Already aligned";
  }

  if (card.queuedCount === card.changedCount) {
    return "Queued in tray";
  }

  const remaining = card.changedCount - card.queuedCount;
  return `Queue ${remaining} change${remaining === 1 ? "" : "s"}`;
}

function rowStateText(row: ParameterWorkflowRecommendation) {
  if (!row.changed) {
    return "Current";
  }

  if (row.isQueued) {
    return "Queued";
  }

  if (row.hasQueuedOverride) {
    return `Queued ${row.queuedValueText ?? row.queuedValue ?? ""}`.trim();
  }

  return "Recommended";
}

function rowStateClass(row: ParameterWorkflowRecommendation) {
  if (!row.changed) {
    return "border-border bg-bg-secondary text-text-secondary";
  }

  if (row.isQueued) {
    return "border-accent/40 bg-accent/10 text-accent";
  }

  if (row.hasQueuedOverride) {
    return "border-warning/40 bg-warning/10 text-warning";
  }

  return "border-border bg-bg-primary/80 text-text-primary";
}

function valueText(valueText: string, valueLabel: string | null, units: string | null) {
  const suffix = units ? ` ${units}` : "";
  return valueLabel ? `${valueText}${suffix} · ${valueLabel}` : `${valueText}${suffix}`;
}
</script>

<article
  class="rounded-[24px] border border-border bg-bg-primary/70 p-4"
  data-testid={`${parameterWorkspaceTestIds.workflowCardPrefix}-${card.id}`}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{card.eyebrow}</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">{card.title}</h3>
      <p class="mt-2 text-sm leading-6 text-text-secondary">{card.description}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${card.status === "ready" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}
      >
        {card.status === "ready" ? "ready" : "guided disabled"}
      </span>
      {#if card.changedCount > 0}
        <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {card.changedCount} change{card.changedCount === 1 ? "" : "s"}
        </span>
      {/if}
    </div>
  </div>

  <p
    class="mt-3 text-sm font-medium text-text-primary"
    data-testid={`${parameterWorkspaceTestIds.workflowSummaryPrefix}-${card.id}`}
  >
    {card.summary}
  </p>

  {#if card.detail}
    <p class="mt-2 text-sm text-text-secondary">{card.detail}</p>
  {/if}

  {#if card.id === "battery" && batteryControls}
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Battery cells</span>
        <input
          class="mt-2 w-full rounded-2xl border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent"
          data-testid={`${parameterWorkspaceTestIds.workflowInputPrefix}-${card.id}-cells`}
          min="1"
          oninput={(event) => batteryControls.onCellCountInput((event.currentTarget as HTMLInputElement).value)}
          placeholder="4"
          step="1"
          type="number"
          value={batteryControls.cellCountInput}
        />
      </label>

      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Chemistry</span>
        <select
          class="mt-2 w-full rounded-2xl border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent"
          data-testid={`${parameterWorkspaceTestIds.workflowInputPrefix}-${card.id}-chemistry`}
          onchange={(event) => batteryControls.onChemistryChange(Number((event.currentTarget as HTMLSelectElement).value))}
          value={String(batteryControls.chemistryIndex)}
        >
          {#each BATTERY_CHEMISTRIES as chemistry, index (`${chemistry.label}:${index}`)}
            <option value={index}>{chemistry.label}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}

  {#if card.id === "flight" && flightControls}
    <div class="mt-4 grid gap-3 md:max-w-xs">
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Prop size (in)</span>
        <input
          class="mt-2 w-full rounded-2xl border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent"
          data-testid={`${parameterWorkspaceTestIds.workflowInputPrefix}-${card.id}-prop`}
          min="1"
          oninput={(event) => flightControls.onPropInchesInput((event.currentTarget as HTMLInputElement).value)}
          placeholder="9"
          step="0.1"
          type="number"
          value={flightControls.propInchesInput}
        />
      </label>
    </div>
  {/if}

  {#if validationMessage}
    <div class="mt-4 rounded-2xl border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-warning">
      <p class="font-medium">{validationMessage}</p>
      <p class="mt-1 text-xs uppercase tracking-[0.16em] text-warning/80">
        Showing the last valid recommendation set until the inputs are corrected.
      </p>
    </div>
  {/if}

  {#if card.status !== "ready"}
    <div
      class="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-warning"
      data-testid={`${parameterWorkspaceTestIds.workflowDisabledPrefix}-${card.id}`}
    >
      <p>{card.disabledMessage}</p>
      <button
        class="mt-3 rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={`${parameterWorkspaceTestIds.workflowOpenAdvancedPrefix}-${card.id}`}
        onclick={onOpenAdvanced}
        type="button"
      >
        Open Advanced parameters
      </button>
    </div>
  {:else}
    <div class="mt-4 space-y-3">
      {#each card.recommendations as recommendation (recommendation.name)}
        <div
          class="rounded-2xl border border-border bg-bg-secondary/70 p-3"
          data-testid={`${parameterWorkspaceTestIds.workflowRecommendationPrefix}-${card.id}-${recommendation.name}`}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-text-primary">{recommendation.label}</p>
              <p class="mt-1 font-mono text-xs text-text-muted">{recommendation.name}</p>
              {#if recommendation.description}
                <p class="mt-2 text-sm text-text-secondary">{recommendation.description}</p>
              {/if}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              {#if recommendation.rebootRequired}
                <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
                  reboot required
                </span>
              {/if}
              <span
                class={`rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${rowStateClass(recommendation)}`}
                data-testid={`${parameterWorkspaceTestIds.workflowRowStatePrefix}-${card.id}-${recommendation.name}`}
              >
                {rowStateText(recommendation)}
              </span>
            </div>
          </div>

          <div class="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Current</p>
              <p
                class="mt-2 rounded-2xl border border-border bg-bg-primary/80 px-3 py-2 text-sm font-mono text-text-secondary"
                data-testid={`${parameterWorkspaceTestIds.workflowCurrentPrefix}-${card.id}-${recommendation.name}`}
              >
                {valueText(recommendation.currentValueText, recommendation.currentValueLabel, recommendation.units)}
              </p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Proposed</p>
              <p
                class={`mt-2 rounded-2xl border px-3 py-2 text-sm font-mono ${recommendation.changed ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-primary/80 text-text-secondary"}`}
                data-testid={`${parameterWorkspaceTestIds.workflowProposedPrefix}-${card.id}-${recommendation.name}`}
              >
                {valueText(recommendation.proposedValueText, recommendation.proposedValueLabel, recommendation.units)}
              </p>
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if card.unavailableCount > 0}
      <p
        class="mt-4 text-sm text-text-secondary"
        data-testid={`${parameterWorkspaceTestIds.workflowUnavailablePrefix}-${card.id}`}
      >
        {card.unavailableCount} recommendation{card.unavailableCount === 1 ? "" : "s"} hidden because the current snapshot does not expose those labeled parameters.
      </p>
    {/if}

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
        Queue from this card, then review and apply everything from the shared tray.
      </p>
      <button
        class="rounded-full border border-accent/30 bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-${card.id}`}
        disabled={stageButtonDisabled()}
        onclick={() => onStage(card.id)}
        type="button"
      >
        {stageButtonLabel()}
      </button>
    </div>
  {/if}
</article>
