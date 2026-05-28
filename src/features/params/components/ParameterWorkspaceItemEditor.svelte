<script lang="ts">
import type { ParameterWorkspaceItemView } from "../../../lib/stores/params";
import { Field, HelperText, InfoBlock, Input, MonoValue, RebootRequiredBadge, StagedBadge } from "../../../components/ui";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";

let props = $props<{
  item: ParameterWorkspaceItemView;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  envelopeKey: string;
  onStage: (item: ParameterWorkspaceItemView, nextValue: number) => void;
  onDiscard: (name: string) => void;
}>();

let draft = $state("");
let validationMessage = $state<string | null>(null);
let lastResetKey: string | null = null;

let resetKey = $derived(
  `${props.envelopeKey}:${props.item.value}:${props.item.stagedValue ?? "none"}:${props.item.isStaged}:${props.item.readOnly}`,
);

$effect(() => {
  if (resetKey === lastResetKey) {
    return;
  }

  lastResetKey = resetKey;
  draft = String(props.item.stagedValue ?? props.item.value);
  validationMessage = null;
});

function isEditingDisabled() {
  return props.readiness !== "ready" || props.item.readOnly;
}

function stageDraft(value: string) {
  draft = value;
  const raw = value.trim();
  if (raw.length === 0) {
    validationMessage = "Enter a value before staging locally.";
    return;
  }

  const nextValue = Number(raw);
  if (!Number.isFinite(nextValue)) {
    validationMessage = "Enter a valid number.";
    return;
  }

  validationMessage = null;
  props.onStage(props.item, nextValue);
}
</script>

<form
  class="rounded-lg border border-border bg-bg-secondary/70 p-3"
  data-param-name={props.item.name}
  data-testid={`${parameterWorkspaceTestIds.itemPrefix}-${props.item.name}`}
  onsubmit={(event) => event.preventDefault()}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-sm font-semibold text-text-primary">{props.item.label}</p>
      <MonoValue class="mt-1 block" size="xs" tone="muted" value={props.item.rawName} />
      {#if props.item.isStaged}
        <p class="mt-2">
          <StagedBadge
            name={props.item.name}
            onUnstage={props.onDiscard}
            testId={`${parameterWorkspaceTestIds.discardButtonPrefix}-${props.item.name}`}
          />
        </p>
      {/if}
    </div>
    <div class="text-right">
      <MonoValue as="p" class="text-lg font-semibold" size="lg" value={`${props.item.valueText}${props.item.units ? ` ${props.item.units}` : ""}`} />
      {#if props.item.rebootRequired}
        <p class="mt-1 flex justify-end">
          <RebootRequiredBadge label="requires reboot" testId={`${parameterWorkspaceTestIds.rebootBadgePrefix}-${props.item.name}`} />
        </p>
      {/if}
    </div>
  </div>

  {#if props.item.description}
    <HelperText class="mt-3">{props.item.description}</HelperText>
  {/if}

  {#if props.item.isStaged}
    <InfoBlock
      class="mt-3 flex flex-wrap items-center gap-2"
      size="sm"
      testId={`${parameterWorkspaceTestIds.diffPrefix}-${props.item.name}`}
      tone="info"
    >
      <span>Current</span>
      <MonoValue class="rounded-full border border-border bg-bg-primary/80 px-2 py-0.5" size="xs" tone="muted" value={`${props.item.valueText}${props.item.units ? ` ${props.item.units}` : ""}`} />
      <span class="text-text-muted">→</span>
      <MonoValue class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-semibold" size="xs" tone="accent" value={`${props.item.stagedValueText}${props.item.units ? ` ${props.item.units}` : ""}`} />
    </InfoBlock>
  {/if}

  <div class="mt-4">
    <Field.Root invalid={Boolean(validationMessage)}>
      <Field.Label>Local staged value</Field.Label>
      <Input
        invalid={Boolean(validationMessage)}
        testId={`${parameterWorkspaceTestIds.inputPrefix}-${props.item.name}`}
        disabled={isEditingDisabled()}
        max={props.item.range?.max}
        min={props.item.range?.min}
        name={`param-${props.item.name}`}
        oninput={(event) => stageDraft((event.currentTarget as HTMLInputElement).value)}
        placeholder={props.item.valueText}
        step={props.item.increment ?? "any"}
        type="number"
        value={draft}
      />
      <Field.Error message={validationMessage ?? undefined} />
    </Field.Root>
  </div>
</form>
