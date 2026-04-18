<script lang="ts">
import type { ParameterExpertRow } from "../../lib/params/parameter-expert-view";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";

let props = $props<{
  row: ParameterExpertRow;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  envelopeKey: string;
  onStage: (row: ParameterExpertRow, nextValue: number) => void;
  onDiscard: (name: string) => void;
}>();

let draft = $state("");
let validationMessage = $state<string | null>(null);
let lastResetKey: string | null = null;

let resetKey = $derived(
  `${props.envelopeKey}:${props.row.value}:${props.row.stagedValue ?? "none"}:${props.row.isStaged}:${props.row.readOnly}:${props.row.editorKind}`,
);

$effect(() => {
  if (resetKey === lastResetKey) {
    return;
  }

  lastResetKey = resetKey;
  draft = String(props.row.stagedValue ?? props.row.value);
  validationMessage = null;
});

function isEditingDisabled() {
  return props.readiness !== "ready" || props.row.readOnly;
}

function stageLabel() {
  if (props.row.readOnly) {
    return "Read only";
  }

  return props.row.isStaged ? "Update staged" : "Stage edit";
}

function displayValue(valueText: string, valueLabel: string | null, units: string | null) {
  const suffix = units ? ` ${units}` : "";
  return valueLabel ? `${valueText}${suffix} · ${valueLabel}` : `${valueText}${suffix}`;
}

function submitStage(event: SubmitEvent) {
  event.preventDefault();

  const raw = draft.trim();
  if (raw.length === 0) {
    validationMessage = "Enter a value before staging.";
    return;
  }

  const nextValue = Number(raw);
  if (!Number.isFinite(nextValue)) {
    validationMessage = "Enter a valid number.";
    return;
  }

  if (props.row.editorKind === "bitmask" && !Number.isInteger(nextValue)) {
    validationMessage = "Enter a whole-number bitmask value.";
    return;
  }

  validationMessage = null;
  props.onStage(props.row, nextValue);
}
</script>

<form
  class={`rounded-lg border p-3 ${props.row.isHighlighted ? "border-accent/40 bg-accent/5" : "border-border bg-bg-primary/70"}`}
  data-highlighted={props.row.isHighlighted}
  data-param-name={props.row.name}
  data-testid={`${parameterWorkspaceTestIds.itemPrefix}-${props.row.name}`}
  onsubmit={submitStage}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-semibold text-text-primary">{props.row.label}</p>
        <span class="rounded-full border border-border bg-bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {props.row.userLevel === "Unknown" ? "standard" : props.row.userLevel}
        </span>
        {#if props.row.isHighlighted}
          <span
            class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent"
            data-testid={`${parameterWorkspaceTestIds.highlightPrefix}-${props.row.name}`}
          >
            workflow handoff
          </span>
        {/if}
        {#if props.row.readOnly}
          <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
            read only
          </span>
        {/if}
      </div>
      <p class="mt-1 font-mono text-xs text-text-muted">{props.row.rawName}</p>
      {#if props.row.description}
        <p class="mt-2 text-sm leading-6 text-text-secondary">{props.row.description}</p>
      {/if}
    </div>

    <div class="text-right">
      <p class="text-lg font-semibold text-text-primary">
        {props.row.valueText}{props.row.units ? ` ${props.row.units}` : ""}
      </p>
      {#if props.row.valueLabel}
        <p class="mt-1 text-sm text-text-secondary">{props.row.valueLabel}</p>
      {/if}
      {#if props.row.rebootRequired}
        <p
          class="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-warning"
          data-testid={`${parameterWorkspaceTestIds.rebootBadgePrefix}-${props.row.name}`}
        >
          Reboot required
        </p>
      {/if}
    </div>
  </div>

  {#if props.row.failureMessage}
    <div
      class="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-3 text-sm text-danger"
      data-testid={`${parameterWorkspaceTestIds.failurePrefix}-${props.row.name}`}
    >
      {props.row.failureMessage}
    </div>
  {/if}

  {#if props.row.isStaged}
    <div
      class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-text-secondary"
      data-testid={`${parameterWorkspaceTestIds.diffPrefix}-${props.row.name}`}
    >
      <span>Current</span>
      <span class="rounded-full border border-border bg-bg-primary/80 px-2 py-0.5 font-mono text-xs text-text-muted">
        {displayValue(props.row.valueText, props.row.valueLabel, props.row.units)}
      </span>
      <span class="text-text-muted">→</span>
      <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
        {displayValue(props.row.stagedValueText ?? props.row.valueText, props.row.stagedValueLabel, props.row.units)}
      </span>
    </div>
  {/if}

  {#if props.row.editorKind === "bitmask" && props.row.bitmaskOptions.length > 0}
    <div class="mt-3 flex flex-wrap gap-2">
      {#each props.row.bitmaskOptions as option (`${props.row.name}:${option.bit}`)}
        <span class={`rounded-full border px-2 py-1 text-xs ${option.enabled ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-secondary text-text-secondary"}`}>
          Bit {option.bit} · {option.label}
        </span>
      {/each}
    </div>
  {/if}

  <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
    <label class="block">
      <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
        {props.row.editorKind === "enum" ? "Choose a value" : "Stage a local edit"}
      </span>

      {#if props.row.editorKind === "enum"}
        <select
          class="mt-2 w-full rounded-lg border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${parameterWorkspaceTestIds.inputPrefix}-${props.row.name}`}
          disabled={isEditingDisabled()}
          onchange={(event) => {
            draft = (event.currentTarget as HTMLSelectElement).value;
            validationMessage = null;
          }}
          value={draft}
        >
          {#each props.row.enumOptions as option (`${props.row.name}:${option.code}`)}
            <option value={String(option.code)}>{option.code} · {option.label}</option>
          {/each}
        </select>
      {:else}
        <input
          class="mt-2 w-full rounded-lg border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${parameterWorkspaceTestIds.inputPrefix}-${props.row.name}`}
          disabled={isEditingDisabled()}
          max={props.row.range?.max}
          min={props.row.range?.min}
          name={`param-${props.row.name}`}
          oninput={(event) => {
            draft = (event.currentTarget as HTMLInputElement).value;
            validationMessage = null;
          }}
          placeholder={props.row.valueText}
          step={props.row.editorKind === "bitmask" ? 1 : props.row.increment ?? "any"}
          type="number"
          value={draft}
        />
      {/if}
    </label>

    <button
      class="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={`${parameterWorkspaceTestIds.stageButtonPrefix}-${props.row.name}`}
      disabled={isEditingDisabled()}
      type="submit"
    >
      {stageLabel()}
    </button>

    {#if props.row.isStaged}
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-danger/40 hover:text-danger"
        data-testid={`${parameterWorkspaceTestIds.discardButtonPrefix}-${props.row.name}`}
        onclick={() => props.onDiscard(props.row.name)}
        type="button"
      >
        Unstage
      </button>
    {/if}
  </div>

  {#if validationMessage}
    <p class="mt-2 text-sm text-danger">{validationMessage}</p>
  {/if}
</form>
