<script lang="ts">
import type {
  ParameterExpertBitmaskOption,
  ParameterExpertEnumOption,
  ParameterExpertRow,
} from "../../lib/params/parameter-expert-view";
import { Select } from "../ui";
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

function stageEnumValue(next: string) {
  draft = next;
  validationMessage = null;
  const parsed = Number(next);
  if (!Number.isFinite(parsed)) {
    return;
  }

  props.onStage(props.row, parsed);
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

let enumSelectOptions = $derived(
  props.row.enumOptions.map((option: ParameterExpertEnumOption) => ({
    value: String(option.code),
    label: `${option.code} · ${option.label}`,
  })),
);

let displayValueText = $derived(
  `${props.row.valueText}${props.row.units ? ` ${props.row.units}` : ""}`,
);
</script>

<form
  class="param-row"
  data-failure={props.row.failureMessage ? "" : undefined}
  data-highlighted={props.row.isHighlighted ? "" : undefined}
  data-param-name={props.row.name}
  data-readonly={props.row.readOnly ? "" : undefined}
  data-staged={props.row.isStaged ? "" : undefined}
  data-testid={`${parameterWorkspaceTestIds.itemPrefix}-${props.row.name}`}
  onsubmit={submitStage}
>
  <div class="param-row__main">
    <span class="param-row__name">{props.row.rawName}</span>
    <span class="param-row__label">
      <span class="param-row__label-text">{props.row.label}</span>
      {#if props.row.isHighlighted}
        <span
          class="param-row__badge param-row__badge--highlight"
          data-testid={`${parameterWorkspaceTestIds.highlightPrefix}-${props.row.name}`}
        >
          workflow handoff
        </span>
      {/if}
      {#if props.row.readOnly}
        <span class="param-row__badge param-row__badge--readonly">read only</span>
      {/if}
      {#if props.row.rebootRequired}
        <span
          class="param-row__badge param-row__badge--reboot"
          data-testid={`${parameterWorkspaceTestIds.rebootBadgePrefix}-${props.row.name}`}
        >
          reboot
        </span>
      {/if}
    </span>
    <span class="param-row__value" title={displayValueText}>
      {displayValueText}
    </span>
    <div class="param-row__actions">
      {#if props.row.editorKind === "enum"}
        <div class="param-row__editor param-row__editor--enum">
          <Select
            disabled={isEditingDisabled()}
            onChange={stageEnumValue}
            options={enumSelectOptions}
            testId={`${parameterWorkspaceTestIds.inputPrefix}-${props.row.name}`}
            value={draft}
          />
        </div>
      {:else}
        <input
          class="param-row__input"
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
      {#if props.row.editorKind !== "enum"}
        <button
          class="param-row__stage"
          data-testid={`${parameterWorkspaceTestIds.stageButtonPrefix}-${props.row.name}`}
          disabled={isEditingDisabled()}
          type="submit"
        >
          {stageLabel()}
        </button>
      {/if}
      {#if props.row.isStaged}
        <button
          class="param-row__discard"
          data-testid={`${parameterWorkspaceTestIds.discardButtonPrefix}-${props.row.name}`}
          onclick={() => props.onDiscard(props.row.name)}
          type="button"
        >
          Unstage
        </button>
      {/if}
    </div>
  </div>

  {#if props.row.description}
    <p class="param-row__description">{props.row.description}</p>
  {/if}

  {#if props.row.editorKind === "bitmask" && props.row.bitmaskOptions.length > 0}
    <div class="param-row__bitmask">
      <ParameterExpertBitmaskEditor
        disabled={isEditingDisabled()}
        onToggle={(nextValue) => {
          draft = String(nextValue);
          validationMessage = null;
        }}
        options={bitmaskDraftOptions}
        value={bitmaskDraftValue}
      />
    </div>
  {/if}

  {#if props.row.isStaged}
    <div
      class="param-row__diff"
      data-testid={`${parameterWorkspaceTestIds.diffPrefix}-${props.row.name}`}
    >
      <span class="param-row__diff-label">Current</span>
      <span class="param-row__diff-current">
        {displayValue(props.row.valueText, props.row.valueLabel, props.row.units)}
      </span>
      <span class="param-row__diff-arrow">→</span>
      <span class="param-row__diff-next">
        {displayValue(props.row.stagedValueText ?? props.row.valueText, props.row.stagedValueLabel, props.row.units)}
      </span>
    </div>
  {/if}

  {#if props.row.failureMessage}
    <div
      class="param-row__failure"
      data-testid={`${parameterWorkspaceTestIds.failurePrefix}-${props.row.name}`}
    >
      {props.row.failureMessage}
    </div>
  {/if}

  {#if validationMessage}
    <p class="param-row__validation">{validationMessage}</p>
  {/if}
</form>

<style>
.param-row {
  display: grid;
  grid-template-rows: auto;
  gap: 0;
  padding: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  font-size: 0.84rem;
}
.param-row__main {
  display: grid;
  grid-template-columns: minmax(120px, 200px) minmax(0, 1fr) minmax(80px, 140px) minmax(180px, 260px);
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-2);
  min-height: var(--density-row-compact);
}
.param-row__name {
  font-family: "SFMono-Regular", "SF Mono", Consolas, monospace;
  color: var(--color-accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.param-row__label {
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}
.param-row__label-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.param-row__value {
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.param-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-1);
  align-items: center;
}
.param-row__editor {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}
.param-row__editor--enum :global(.ui-select__trigger) {
  min-width: 0;
  width: 100%;
}
.param-row__input {
  width: 100%;
  min-width: 0;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-primary) 80%, transparent);
  color: var(--color-text-primary);
  font-size: 0.84rem;
  font-variant-numeric: tabular-nums;
}
.param-row__input:focus { outline: none; border-color: var(--color-accent); }
.param-row__input:disabled { opacity: 0.6; cursor: not-allowed; }
.param-row__stage {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-accent) 40%, transparent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  color: var(--color-accent);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.param-row__stage:hover { border-color: var(--color-accent); }
.param-row__stage:disabled { opacity: 0.5; cursor: not-allowed; }
.param-row__discard {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-primary) 80%, transparent);
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.param-row__discard:hover { border-color: color-mix(in srgb, var(--color-danger) 40%, transparent); color: var(--color-danger); }
.param-row__badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.param-row__badge--highlight {
  border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  color: var(--color-accent);
}
.param-row__badge--readonly {
  border-color: color-mix(in srgb, var(--color-warning) 40%, transparent);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
}
.param-row__badge--reboot {
  border-color: color-mix(in srgb, var(--color-warning) 40%, transparent);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
}
.param-row__description {
  margin: 0;
  padding: 0 var(--space-2) 6px;
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  line-height: 1.4;
}
.param-row__bitmask {
  padding: 0 var(--space-2) 8px;
}
.param-row__diff {
  margin: 0 var(--space-2) 6px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
  background: color-mix(in srgb, var(--color-accent) 5%, transparent);
  font-size: 0.76rem;
  color: var(--color-text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: baseline;
}
.param-row__diff-label { color: var(--color-text-muted); }
.param-row__diff-current { color: var(--color-text-muted); font-family: "SFMono-Regular", "SF Mono", Consolas, monospace; }
.param-row__diff-arrow { color: var(--color-text-muted); padding: 0 4px; }
.param-row__diff-next { color: var(--color-accent); font-weight: 600; font-family: "SFMono-Regular", "SF Mono", Consolas, monospace; }
.param-row__failure {
  margin: 0 var(--space-2) 6px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  font-size: 0.76rem;
  color: var(--color-danger);
}
.param-row__validation {
  margin: 0 var(--space-2) 6px;
  padding: 0;
  color: var(--color-danger);
  font-size: 0.76rem;
}
.param-row[data-staged] { background: color-mix(in srgb, var(--color-accent) 6%, transparent); }
.param-row[data-failure] { background: color-mix(in srgb, var(--color-danger) 6%, transparent); }
.param-row[data-highlighted] { background: color-mix(in srgb, var(--color-accent) 8%, transparent); }
@media (max-width: 767px) {
  .param-row__main {
    grid-template-columns: 1fr;
    min-height: 0;
    padding: var(--space-2);
    gap: var(--space-1);
  }
  .param-row__name { font-size: 0.78rem; }
  .param-row__actions { justify-content: flex-start; padding-top: var(--space-1); flex-wrap: wrap; }
  .param-row__editor { width: 100%; }
}
</style>
