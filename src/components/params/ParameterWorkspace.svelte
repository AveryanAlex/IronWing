<svelte:options runes={false} />

<script lang="ts">
import {
  createParameterWorkspaceViewStore,
  params,
  type ParameterWorkspaceItemView,
  type ParamsStore,
} from "../../lib/stores/params";
import { parameterWorkspaceTestIds } from "./parameter-workspace-sections";

export let store: ParamsStore = params;

let view = createParameterWorkspaceViewStore(store);
let drafts: Record<string, string> = {};
let stagedNames: string[] = [];

$: view = createParameterWorkspaceViewStore(store);
$: {
  const nextStagedNames = $view.stagedEdits.map((edit) => edit.name);
  const nextDrafts = { ...drafts };
  let changed = false;

  for (const name of stagedNames) {
    if (!nextStagedNames.includes(name) && name in nextDrafts) {
      delete nextDrafts[name];
      changed = true;
    }
  }

  if (changed) {
    drafts = nextDrafts;
  }

  stagedNames = nextStagedNames;
}

function inputValueFor(item: ParameterWorkspaceItemView) {
  return drafts[item.name] ?? String(item.stagedValue ?? item.value);
}

function updateDraft(name: string, value: string) {
  drafts = {
    ...drafts,
    [name]: value,
  };
}

function isEditingDisabled(item: ParameterWorkspaceItemView) {
  return $view.readiness !== "ready" || item.readOnly;
}

function canStage(item: ParameterWorkspaceItemView) {
  return !isEditingDisabled(item);
}

function stageLabel(item: ParameterWorkspaceItemView) {
  if (item.readOnly) {
    return "Read only";
  }

  return item.isStaged ? "Update staged" : "Stage edit";
}

function submitStage(item: ParameterWorkspaceItemView, form: HTMLFormElement) {
  const value = new FormData(form).get(`param-${item.name}`);
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw.length === 0) {
    return;
  }

  const nextValue = Number(raw);
  if (!Number.isFinite(nextValue)) {
    return;
  }

  store.stageParameterEdit(item, nextValue);
  drafts = {
    ...drafts,
    [item.name]: raw,
  };
}

function discard(item: ParameterWorkspaceItemView) {
  store.discardStagedEdit(item.name);
  const nextDrafts = { ...drafts };
  delete nextDrafts[item.name];
  drafts = nextDrafts;
}
</script>

<section
  class="rounded-[24px] border border-border bg-bg-secondary/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
  data-domain-readiness={$view.readiness}
  data-workspace-state={$view.status}
  data-testid={parameterWorkspaceTestIds.root}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="runtime-eyebrow mb-2">Parameter workspace</p>
      <h2 class="text-xl font-semibold tracking-[-0.03em] text-text-primary">Scoped starter parameters</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
        This dedicated domain binds parameter bootstrap and stream updates to the active shell scope without widening the
        session store.
      </p>
    </div>

    <div
      class={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${$view.readiness === "ready" ? "border-success/30 bg-success/10 text-success" : $view.readiness === "bootstrapping" ? "border-warning/30 bg-warning/10 text-warning" : $view.readiness === "degraded" ? "border-warning/30 bg-warning/10 text-warning" : "border-border-light bg-bg-primary/70 text-text-secondary"}`}
      data-testid={parameterWorkspaceTestIds.readiness}
    >
      <span
        class={`h-2 w-2 rounded-full ${$view.readiness === "ready" ? "bg-success" : $view.readiness === "bootstrapping" ? "bg-warning" : $view.readiness === "degraded" ? "bg-warning" : "bg-text-muted"}`}
      ></span>
      {$view.readiness}
    </div>
  </div>

  <dl class="mt-5 grid gap-3 sm:grid-cols-3">
    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Workspace state</dt>
      <dd class="mt-3 text-sm font-semibold text-text-primary" data-testid={parameterWorkspaceTestIds.state}>
        {$view.status}
      </dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Active scope</dt>
      <dd class="mt-3 break-all font-mono text-xs text-text-secondary" data-testid={parameterWorkspaceTestIds.scope}>
        {$view.activeEnvelopeText}
      </dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Metadata</dt>
      <dd class="mt-3 text-sm font-semibold text-text-primary" data-testid={parameterWorkspaceTestIds.metadata}>
        {$view.metadataText}
      </dd>
    </div>
  </dl>

  <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-text-secondary" data-testid={parameterWorkspaceTestIds.progress}>{$view.progressText}</p>

    {#if $view.stagedCount > 0}
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent"
          data-testid={parameterWorkspaceTestIds.pendingCount}
        >
          {$view.stagedCount} pending
        </span>
        <span class="text-xs text-text-muted" data-testid={parameterWorkspaceTestIds.pendingHint}>
          Review and discard staged edits from the shared shell tray.
        </span>
      </div>
    {/if}
  </div>

  {#if $view.noticeText}
    <p
      class="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
      data-testid={parameterWorkspaceTestIds.notice}
    >
      {$view.noticeText}
    </p>
  {/if}

  {#if $view.status === "bootstrapping"}
    <div
      class="mt-5 rounded-[20px] border border-border bg-bg-primary/60 p-5"
      data-testid={parameterWorkspaceTestIds.empty}
    >
      <p class="text-sm font-semibold text-text-primary">Waiting for scoped parameter data</p>
      <p class="mt-2 text-sm leading-6 text-text-secondary">
        The active session scope is still bootstrapping. This workspace will populate as soon as the scoped parameter
        snapshot arrives.
      </p>
    </div>
  {:else if $view.status === "unavailable"}
    <div
      class="mt-5 rounded-[20px] border border-border bg-bg-primary/60 p-5"
      data-testid={parameterWorkspaceTestIds.empty}
    >
      <p class="text-sm font-semibold text-text-primary">No scoped parameter snapshot is available</p>
      <p class="mt-2 text-sm leading-6 text-text-secondary">
        Connect or reconnect the active shell to hydrate the scoped parameter domain. Stale data is not reused across
        scope changes.
      </p>
    </div>
  {:else if $view.status === "empty"}
    <div
      class="mt-5 rounded-[20px] border border-border bg-bg-primary/60 p-5"
      data-testid={parameterWorkspaceTestIds.empty}
    >
      <p class="text-sm font-semibold text-text-primary">The active scope has no parameter entries yet</p>
      <p class="mt-2 text-sm leading-6 text-text-secondary">
        The scope is bound correctly, but the parameter store is currently empty. Leave the workspace open while the
        source hydrates or reconnect to request a fresh snapshot.
      </p>
    </div>
  {:else}
    <div class="mt-5 grid gap-4 xl:grid-cols-2">
      {#each $view.sections as section (section.id)}
        <section
          class="rounded-[20px] border border-border bg-bg-primary/60 p-4"
          data-testid={`${parameterWorkspaceTestIds.sectionPrefix}-${section.id}`}
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                {section.mode === "fallback" ? "Fallback sample" : "Curated starter section"}
              </p>
              <h3 class="mt-2 text-lg font-semibold text-text-primary">{section.title}</h3>
            </div>
          </div>
          <p class="mt-2 text-sm leading-6 text-text-secondary">{section.description}</p>

          <div class="mt-4 space-y-3">
            {#each section.items as item (item.name)}
              <form
                class="rounded-2xl border border-border bg-bg-secondary/70 p-4"
                data-param-name={item.name}
                data-testid={`${parameterWorkspaceTestIds.itemPrefix}-${item.name}`}
                onsubmit={(event) => {
                  event.preventDefault();
                  submitStage(item, event.currentTarget as HTMLFormElement);
                }}
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">{item.label}</p>
                    <p class="mt-1 font-mono text-xs text-text-muted">{item.rawName}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-lg font-semibold text-text-primary">{item.valueText}{item.units ? ` ${item.units}` : ""}</p>
                    {#if item.rebootRequired}
                      <p
                        class="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-warning"
                        data-testid={`${parameterWorkspaceTestIds.rebootBadgePrefix}-${item.name}`}
                      >
                        Reboot required
                      </p>
                    {/if}
                  </div>
                </div>

                {#if item.description}
                  <p class="mt-3 text-sm leading-6 text-text-secondary">{item.description}</p>
                {/if}

                {#if item.isStaged}
                  <div
                    class="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-text-secondary"
                    data-testid={`${parameterWorkspaceTestIds.diffPrefix}-${item.name}`}
                  >
                    <span>Current</span>
                    <span class="rounded-full border border-border bg-bg-primary/80 px-2 py-0.5 font-mono text-xs text-text-muted">
                      {item.valueText}{item.units ? ` ${item.units}` : ""}
                    </span>
                    <span class="text-text-muted">→</span>
                    <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                      {item.stagedValueText}{item.units ? ` ${item.units}` : ""}
                    </span>
                  </div>
                {/if}

                <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                  <label class="block">
                    <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Stage a local edit</span>
                    <input
                      class="mt-2 w-full rounded-2xl border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid={`${parameterWorkspaceTestIds.inputPrefix}-${item.name}`}
                      disabled={isEditingDisabled(item)}
                      max={item.range?.max}
                      min={item.range?.min}
                      name={`param-${item.name}`}
                      oninput={(event) => updateDraft(item.name, (event.currentTarget as HTMLInputElement).value)}
                      placeholder={item.valueText}
                      step={item.increment ?? "any"}
                      type="number"
                      value={inputValueFor(item)}
                    />
                  </label>

                  <button
                    class="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`${parameterWorkspaceTestIds.stageButtonPrefix}-${item.name}`}
                    disabled={!canStage(item)}
                    type="submit"
                  >
                    {stageLabel(item)}
                  </button>

                  {#if item.isStaged}
                    <button
                      class="rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-danger/40 hover:text-danger"
                      data-testid={`${parameterWorkspaceTestIds.discardButtonPrefix}-${item.name}`}
                      onclick={() => discard(item)}
                      type="button"
                    >
                      Discard
                    </button>
                  {/if}
                </div>
              </form>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</section>
