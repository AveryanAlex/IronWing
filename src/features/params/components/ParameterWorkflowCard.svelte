<script lang="ts">
import { BATTERY_CHEMISTRIES } from "../../../data/battery-presets";
import type {
  ParameterWorkflowCard as ParameterWorkflowCardModel,
  ParameterWorkflowCardId,
  ParameterWorkflowRecommendation,
} from "../../../lib/params/parameter-workflows";
import { ActionRow, Alert, Badge, Button, Card, Eyebrow, Field, HelperText, Input, MonoValue, NativeSelect, RebootRequiredBadge } from "../../../components/ui";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";

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

const batteryChemistryOptions = BATTERY_CHEMISTRIES.map((chemistry, index) => ({
  value: String(index),
  label: chemistry.label,
}));

let {
  card,
  batteryControls = null,
  flightControls = null,
  replayReadonly = false,
  onStage,
  onOpenAdvanced,
}: {
  card: ParameterWorkflowCardModel;
  batteryControls?: BatteryControls | null;
  flightControls?: FlightControls | null;
  replayReadonly?: boolean;
  onStage: (cardId: ParameterWorkflowCardId) => void;
  onOpenAdvanced: (cardId: ParameterWorkflowCardId) => void;
} = $props();

let validationMessage = $derived(
  card.id === "battery"
    ? batteryControls?.validationMessage ?? null
    : card.id === "flight"
      ? flightControls?.validationMessage ?? null
      : null,
);

function stageButtonDisabled() {
  return replayReadonly || card.status !== "ready" || card.changedCount === 0 || card.queuedCount === card.changedCount || Boolean(validationMessage);
}

function stageButtonLabel() {
  if (card.status !== "ready") {
    return "Guided changes unavailable";
  }

  if (replayReadonly) {
    return "Replay is read-only";
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

function rowStateVariant(row: ParameterWorkflowRecommendation): "muted" | "accent" | "warning" | "outline" {
  if (!row.changed) {
    return "muted";
  }

  if (row.isQueued) {
    return "accent";
  }

  if (row.hasQueuedOverride) {
    return "warning";
  }

  return "outline";
}

function valueText(valueText: string, valueLabel: string | null, units: string | null) {
  const suffix = units ? ` ${units}` : "";
  return valueLabel ? `${valueText}${suffix} · ${valueLabel}` : `${valueText}${suffix}`;
}
</script>

<Card.Root
  as="article"
  density="compact"
  surface="primary"
  testId={`${parameterWorkspaceTestIds.workflowCardPrefix}-${card.id}`}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <Eyebrow>{card.eyebrow}</Eyebrow>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">{card.title}</h3>
      <HelperText class="mt-2">{card.description}</HelperText>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Badge shape="rounded" size="lg" variant={card.status === "ready" ? "success" : "warning"}>
        {card.status === "ready" ? "ready" : "guided disabled"}
      </Badge>
      {#if card.changedCount > 0}
        <Badge shape="rounded" size="lg" variant="muted">
          {card.changedCount} change{card.changedCount === 1 ? "" : "s"}
        </Badge>
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
    <HelperText class="mt-2">{card.detail}</HelperText>
  {/if}

  {#if card.id === "battery" && batteryControls}
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      <Field.Root invalid={Boolean(validationMessage)}>
        <Field.Label>Battery cells</Field.Label>
        <Input
          invalid={Boolean(validationMessage)}
          testId={`${parameterWorkspaceTestIds.workflowInputPrefix}-${card.id}-cells`}
          disabled={replayReadonly}
          min="1"
          oninput={(event) => batteryControls.onCellCountInput((event.currentTarget as HTMLInputElement).value)}
          placeholder="4"
          step="1"
          type="number"
          value={batteryControls.cellCountInput}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Chemistry</Field.Label>
        <NativeSelect
          testId={`${parameterWorkspaceTestIds.workflowInputPrefix}-${card.id}-chemistry`}
          disabled={replayReadonly}
          onchange={(event) => batteryControls.onChemistryChange(Number((event.currentTarget as HTMLSelectElement).value))}
          options={batteryChemistryOptions}
          value={String(batteryControls.chemistryIndex)}
        />
      </Field.Root>
    </div>
  {/if}

  {#if card.id === "flight" && flightControls}
    <div class="mt-4 grid gap-3 md:max-w-xs">
      <Field.Root invalid={Boolean(validationMessage)}>
        <Field.Label>Prop size (in)</Field.Label>
        <Input
          invalid={Boolean(validationMessage)}
          testId={`${parameterWorkspaceTestIds.workflowInputPrefix}-${card.id}-prop`}
          disabled={replayReadonly}
          min="1"
          oninput={(event) => flightControls.onPropInchesInput((event.currentTarget as HTMLInputElement).value)}
          placeholder="9"
          step="0.1"
          type="number"
          value={flightControls.propInchesInput}
        />
      </Field.Root>
    </div>
  {/if}

  {#if validationMessage}
    <Alert
      class="mt-4"
      density="compact"
      description="Showing the last valid recommendation set until the inputs are corrected."
      title={validationMessage}
      variant="warning"
    />
  {/if}

  {#if card.status !== "ready"}
    <Alert
      class="mt-4"
      density="compact"
      testId={`${parameterWorkspaceTestIds.workflowDisabledPrefix}-${card.id}`}
      variant="warning"
    >
      <HelperText tone="warning">{card.disabledMessage}</HelperText>
      <Button
        class="mt-3"
        testId={`${parameterWorkspaceTestIds.workflowOpenAdvancedPrefix}-${card.id}`}
        onclick={() => onOpenAdvanced(card.id)}
        variant="outline"
      >
        Open Advanced parameters
      </Button>
    </Alert>
  {:else}
    <div class="mt-4 space-y-3">
      {#each card.recommendations as recommendation (recommendation.name)}
        <Card.Root
          density="compact"
          surface="secondary"
          testId={`${parameterWorkspaceTestIds.workflowRecommendationPrefix}-${card.id}-${recommendation.name}`}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-text-primary">{recommendation.label}</p>
              <MonoValue class="mt-1 block" size="xs" tone="muted" value={recommendation.name} />
              {#if recommendation.description}
                <HelperText class="mt-2">{recommendation.description}</HelperText>
              {/if}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              {#if recommendation.rebootRequired}
                <RebootRequiredBadge label="reboot required" />
              {/if}
              <Badge
                shape="rounded"
                size="lg"
                testId={`${parameterWorkspaceTestIds.workflowRowStatePrefix}-${card.id}-${recommendation.name}`}
                variant={rowStateVariant(recommendation)}
              >
                {rowStateText(recommendation)}
              </Badge>
            </div>
          </div>

          <div class="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <Eyebrow>Current</Eyebrow>
              <MonoValue
                as="p"
                class="mt-2 rounded-lg border border-border bg-bg-primary/80 px-3 py-2"
                testId={`${parameterWorkspaceTestIds.workflowCurrentPrefix}-${card.id}-${recommendation.name}`}
                tone="secondary"
                value={valueText(recommendation.currentValueText, recommendation.currentValueLabel, recommendation.units)}
                wrap
              />
            </div>
            <div>
              <Eyebrow>Proposed</Eyebrow>
              <MonoValue
                as="p"
                class={`mt-2 rounded-lg border px-3 py-2 ${recommendation.changed ? "border-accent/30 bg-accent/10" : "border-border bg-bg-primary/80"}`}
                testId={`${parameterWorkspaceTestIds.workflowProposedPrefix}-${card.id}-${recommendation.name}`}
                tone={recommendation.changed ? "accent" : "secondary"}
                value={valueText(recommendation.proposedValueText, recommendation.proposedValueLabel, recommendation.units)}
                wrap
              />
            </div>
          </div>
        </Card.Root>
      {/each}
    </div>

    {#if card.unavailableCount > 0}
      <HelperText class="mt-4" testId={`${parameterWorkspaceTestIds.workflowUnavailablePrefix}-${card.id}`}>
        {card.unavailableCount} recommendation{card.unavailableCount === 1 ? "" : "s"} hidden because the current snapshot does not expose those labeled parameters.
      </HelperText>
    {/if}

    <ActionRow align="between" class="mt-4">
      <Eyebrow>
        Queue from this card, inspect the raw parameters, then review and apply everything from the shared tray.
      </Eyebrow>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          testId={`${parameterWorkspaceTestIds.workflowOpenAdvancedPrefix}-${card.id}`}
          disabled={replayReadonly}
          onclick={() => onOpenAdvanced(card.id)}
          variant="outline"
        >
          Inspect raw parameters
        </Button>
        <Button
          testId={`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-${card.id}`}
          disabled={stageButtonDisabled()}
          onclick={() => onStage(card.id)}
        >
          {stageButtonLabel()}
        </Button>
      </div>
    </ActionRow>
  {/if}
</Card.Root>
