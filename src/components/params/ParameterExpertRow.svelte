<script lang="ts">
import type {
  ParameterExpertBitmaskOption,
  ParameterExpertRow,
} from "../../lib/params/parameter-expert-view";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";
import ParameterExpertBitmaskEditor from "./ParameterExpertBitmaskEditor.svelte";

let props = $props<{
  row: ParameterExpertRow;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  replayReadonly?: boolean;
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
  return props.readiness !== "ready" || props.row.readOnly || props.replayReadonly === true;
}

function stageLabel() {
  if (props.row.readOnly || props.replayReadonly) {
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

let bitmaskDraftValue = $derived.by(() => {
  const nextValue = Number(draft.trim());
  if (Number.isFinite(nextValue) && Number.isInteger(nextValue)) {
    return nextValue;
  }

  return props.row.stagedValue ?? props.row.value;
});

let bitmaskDraftOptions = $derived(
  props.row.bitmaskOptions.map((option: ParameterExpertBitmaskOption) => ({
    ...option,
    enabled: Math.floor(bitmaskDraftValue / (2 ** option.bit)) % 2 === 1,
  })),
);
</script>

<form
  class={`rounded-md border px-3 py-2.5 ${props.row.isHighlighted ? "border-accent/40 bg-accent/5" : "border-border bg-bg-primary/70"}`}
  data-highlighted={props.row.isHighlighted}
  data-param-name={props.row.name}
  data-testid={`${parameterWorkspaceTestIds.itemPrefix}-${props.row.name}`}
  onsubmit={submitStage}
>
  <div class="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto] xl:items-start">
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
      <p class="mt-1 font-mono text-[11px] text-text-muted">{props.row.rawName}</p>
      {#if props.row.description}
        <p class="mt-1 text-xs leading-5 text-text-secondary">{props.row.description}</p>
      {/if}
    </div>

    <div class="min-w-0 xl:text-right">
      <p class="text-sm font-semibold text-text-primary">
        {props.row.valueText}{props.row.units ? ` ${props.row.units}` : ""}
      </p>
      {#if props.row.valueLabel}
        <p class="mt-1 text-xs text-text-secondary">{props.row.valueLabel}</p>
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
    <div class="space-y-2">
      <label class="block">
        <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {props.row.editorKind === "enum" ? "Choose a value" : props.row.editorKind === "bitmask" ? "Bitmask editor" : "Stage a local edit"}
        </span>

        {#if props.row.editorKind === "enum"}
          <select
            class="mt-1.5 w-full rounded-md border border-border bg-bg-primary/80 px-2.5 py-2 text-sm text-text-primary outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
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
            class="mt-1.5 w-full rounded-md border border-border bg-bg-primary/80 px-2.5 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
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

      {#if props.row.editorKind === "bitmask" && props.row.bitmaskOptions.length > 0}
        <ParameterExpertBitmaskEditor
          disabled={isEditingDisabled()}
          onToggle={(nextValue) => {
            draft = String(nextValue);
            validationMessage = null;
          }}
          options={bitmaskDraftOptions}
          value={bitmaskDraftValue}
        />
      {/if}
    </div>

    <div class="space-y-2 xl:text-right">
      {#if props.row.isStaged}
        <div
          class="rounded-md border border-accent/20 bg-accent/5 px-2.5 py-2 text-xs text-text-secondary"
          data-testid={`${parameterWorkspaceTestIds.diffPrefix}-${props.row.name}`}
        >
          <span class="text-text-muted">Current </span>
          <span class="font-mono text-text-muted">
            {displayValue(props.row.valueText, props.row.valueLabel, props.row.units)}
          </span>
          <span class="px-1 text-text-muted">→</span>
          <span class="font-mono font-semibold text-accent">
            {displayValue(props.row.stagedValueText ?? props.row.valueText, props.row.stagedValueLabel, props.row.units)}
          </span>
        </div>
      {/if}

      {#if props.row.failureMessage}
        <div
          class="rounded-md border border-danger/30 bg-danger/10 px-2.5 py-2 text-xs text-danger"
          data-testid={`${parameterWorkspaceTestIds.failurePrefix}-${props.row.name}`}
        >
          {props.row.failureMessage}
        </div>
      {/if}
    </div>

    <div class="flex flex-wrap items-start gap-2 xl:justify-end">
      <button
        class="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`${parameterWorkspaceTestIds.stageButtonPrefix}-${props.row.name}`}
        disabled={isEditingDisabled()}
        type="submit"
      >
        {stageLabel()}
      </button>

      {#if props.row.isStaged}
        <button
          class="rounded-md border border-border bg-bg-primary/80 px-3 py-2 text-sm font-semibold text-text-secondary transition hover:border-danger/40 hover:text-danger"
          data-testid={`${parameterWorkspaceTestIds.discardButtonPrefix}-${props.row.name}`}
          onclick={() => props.onDiscard(props.row.name)}
          type="button"
        >
          Unstage
        </button>
      {/if}
    </div>
  </div>

  {#if validationMessage}
    <p class="mt-2 text-sm text-danger">{validationMessage}</p>
  {/if}
</form>
