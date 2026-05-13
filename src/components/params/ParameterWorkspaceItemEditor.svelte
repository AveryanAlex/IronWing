<script lang="ts">
import type { ParameterWorkspaceItemView } from "../../lib/stores/params";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";

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

function canStage() {
  return !isEditingDisabled();
}

function stageLabel() {
  if (props.item.readOnly) {
    return "Read only";
  }

  return props.item.isStaged ? "Update staged" : "Stage edit";
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

  validationMessage = null;
  props.onStage(props.item, nextValue);
}
</script>

<form
  class="rounded-lg border border-border bg-bg-secondary/70 p-3"
  data-param-name={props.item.name}
  data-testid={`${parameterWorkspaceTestIds.itemPrefix}-${props.item.name}`}
  onsubmit={submitStage}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-sm font-semibold text-text-primary">{props.item.label}</p>
      <p class="mt-1 font-mono text-xs text-text-muted">{props.item.rawName}</p>
    </div>
    <div class="text-right">
      <p class="text-lg font-semibold text-text-primary">{props.item.valueText}{props.item.units ? ` ${props.item.units}` : ""}</p>
      {#if props.item.rebootRequired}
        <p
          class="mt-1 text-xs font-semibold uppercase tracking-wide text-warning"
          data-testid={`${parameterWorkspaceTestIds.rebootBadgePrefix}-${props.item.name}`}
        >
          Reboot required
        </p>
      {/if}
    </div>
  </div>

  {#if props.item.description}
    <p class="mt-3 text-sm leading-6 text-text-secondary">{props.item.description}</p>
  {/if}

  {#if props.item.isStaged}
    <div
      class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-text-secondary"
      data-testid={`${parameterWorkspaceTestIds.diffPrefix}-${props.item.name}`}
    >
      <span>Current</span>
      <span class="rounded-full border border-border bg-bg-primary/80 px-2 py-0.5 font-mono text-xs text-text-muted">
        {props.item.valueText}{props.item.units ? ` ${props.item.units}` : ""}
      </span>
      <span class="text-text-muted">→</span>
      <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
        {props.item.stagedValueText}{props.item.units ? ` ${props.item.units}` : ""}
      </span>
    </div>
  {/if}

  <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
    <label class="block">
      <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Stage a local edit</span>
      <input
        class="mt-2 w-full rounded-lg border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`${parameterWorkspaceTestIds.inputPrefix}-${props.item.name}`}
        disabled={isEditingDisabled()}
        max={props.item.range?.max}
        min={props.item.range?.min}
        name={`param-${props.item.name}`}
        oninput={(event) => {
          draft = (event.currentTarget as HTMLInputElement).value;
          validationMessage = null;
        }}
        placeholder={props.item.valueText}
        step={props.item.increment ?? "any"}
        type="number"
        value={draft}
      />
    </label>

    <button
      class="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={`${parameterWorkspaceTestIds.stageButtonPrefix}-${props.item.name}`}
      disabled={!canStage()}
      type="submit"
    >
      {stageLabel()}
    </button>

    {#if props.item.isStaged}
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-danger/40 hover:text-danger"
        data-testid={`${parameterWorkspaceTestIds.discardButtonPrefix}-${props.item.name}`}
        onclick={() => props.onDiscard(props.item.name)}
        type="button"
      >
        Discard
      </button>
    {/if}
  </div>

  {#if validationMessage}
    <p class="mt-2 text-sm text-danger">{validationMessage}</p>
  {/if}
</form>
