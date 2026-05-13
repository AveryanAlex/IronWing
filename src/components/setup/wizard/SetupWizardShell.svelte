<script lang="ts">
import type { Snippet } from "svelte";
import { fromStore } from "svelte/store";

import type {
  SetupWizardStore,
  WizardStepSnapshot,
  WizardStoreState,
} from "../../../lib/stores/setup-wizard";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import { phaseLabel, progressSummary } from "./setup-wizard-view";

let {
  store,
  view,
  onSelectSection,
  onClose,
  children,
}: {
  store: SetupWizardStore;
  view: SetupWorkspaceStoreState;
  onSelectSection: (sectionId: string) => void;
  onClose: () => void;
  children: Snippet<
    [
      {
        step: WizardStepSnapshot;
        advance: () => void;
        skip: () => void;
      },
    ]
  >;
} = $props();

// Track the wizard store reactively through `fromStore`. Wrapping the call in
// `$derived.by` keeps `store` inside a closure so Svelte re-resolves the
// subscription if the parent ever hands us a different store instance
// (otherwise destructured props only capture their initial value when fed
// straight into `fromStore`).
const wizardStateView = $derived.by(() => fromStore(store));
const wizardState: WizardStoreState = $derived(wizardStateView.current);

const currentStep = $derived(
  wizardState.steps.find((step) => step.id === wizardState.currentStepId) ?? null,
);
const blocksActions = $derived(view.checkpoint.blocksActions || view.readiness !== "ready");

function handleStart() {
  store.start();
}
function handleAdvance() {
  store.advance();
}
function handleSkip() {
  store.skip();
}
function handleDetour() {
  if (!currentStep) return;
  store.pause("detour");
  onSelectSection(currentStep.sectionId);
}
function handleResume() {
  store.resume();
}
function handleRestart() {
  store.restart();
}
function handleAcknowledge() {
  store.acknowledgeHandoff();
  onClose();
}
function handleHandoffJump(sectionId: string) {
  onSelectSection(sectionId);
  onClose();
}

// Resolves a wizard step id to its catalog title + sectionId so the handoff
// summary lists can deep-link to the expert section without the consumer
// needing to build its own lookup map. The snapshot already carries all nine
// definitions regardless of current status so no fallback is needed.
function stepById(id: string): WizardStepSnapshot | null {
  return wizardState.steps.find((step) => step.id === id) ?? null;
}
</script>

{#snippet handoffRow(step: WizardStepSnapshot)}
  <li
    class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-bg-primary/50 px-2 py-1"
    data-testid={`${setupWorkspaceTestIds.wizardHandoffRowPrefix}-${step.id}`}
  >
    <span
      class="text-xs font-semibold text-text-primary"
      data-testid={`${setupWorkspaceTestIds.wizardStepTitlePrefix}-${step.id}`}
    >
      {step.title}
    </span>
    <button
      class="rounded-full border border-border bg-bg-primary px-2 py-[2px] text-xs font-semibold uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent"
      data-testid={`${setupWorkspaceTestIds.wizardHandoffJumpPrefix}-${step.id}`}
      onclick={() => handleHandoffJump(step.sectionId)}
      type="button"
    >
      Jump to expert
    </button>
  </li>
{/snippet}

<section
  class="rounded-lg border border-border bg-bg-secondary/60 p-3"
  data-testid={setupWorkspaceTestIds.wizardRoot}
  data-phase={wizardState.phase}
>
  <header
    class="flex flex-wrap items-start justify-between gap-3"
    data-testid={setupWorkspaceTestIds.wizardHeader}
  >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">
        Beginner setup wizard
      </p>
      <p class="mt-1 text-sm text-text-secondary">
        Guided path through the critical setup steps. Expert sections stay available on the left.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <span
        class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary"
        data-testid={setupWorkspaceTestIds.wizardPhase}
      >
        {phaseLabel(wizardState)}
      </span>
      <button
        class="rounded-full border border-border bg-bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.wizardClose}
        onclick={onClose}
        type="button"
      >
        Close
      </button>
    </div>
  </header>

  <p
    class="mt-3 text-xs text-text-muted"
    data-testid={setupWorkspaceTestIds.wizardProgress}
  >
    {progressSummary(wizardState)}
  </p>

  <ol
    class="mt-3 flex flex-wrap gap-2"
    data-testid={setupWorkspaceTestIds.wizardStepList}
  >
    {#each wizardState.steps as step (step.id)}
      <li
        class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary"
        data-testid={`${setupWorkspaceTestIds.wizardStepItemPrefix}-${step.id}`}
        data-status={step.status}
        data-tier={step.tier}
      >
        {step.title}
      </li>
    {/each}
  </ol>

  {#if wizardState.phase === "idle"}
    <div
      class="mt-4 rounded-lg border border-dashed border-border bg-bg-primary/60 px-4 py-4 text-sm text-text-secondary"
    >
      <p>
        Run the beginner path when you want a guided setup for a new vehicle. Expert sections stay
        available any time.
      </p>
      <button
        class="mt-3 rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
        data-testid={setupWorkspaceTestIds.wizardStart}
        onclick={handleStart}
        type="button"
      >
        Start wizard
      </button>
    </div>
  {:else if wizardState.phase === "active" && currentStep}
    <section
      class="mt-4 rounded-lg border border-border bg-bg-primary/60 p-3"
      data-testid={setupWorkspaceTestIds.wizardStepFrame}
      data-step={currentStep.id}
    >
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">
            {currentStep.tier === "required" ? "Required" : "Recommended"}
          </p>
          <h4 class="mt-1 text-sm font-semibold text-text-primary">{currentStep.title}</h4>
          <p class="mt-1 text-xs text-text-secondary">{currentStep.description}</p>
        </div>
      </header>

      <div class="mt-3">
        {@render children({ step: currentStep, advance: handleAdvance, skip: handleSkip })}
      </div>

      <footer class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-full border border-border bg-bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent"
          data-testid={setupWorkspaceTestIds.wizardStepDetour}
          onclick={handleDetour}
          type="button"
        >
          Open full section
        </button>
        <button
          class="rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent hover:bg-accent/20 disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
          data-testid={setupWorkspaceTestIds.wizardStepAdvance}
          disabled={blocksActions}
          onclick={handleAdvance}
          type="button"
        >
          Advance
        </button>
        {#if currentStep.tier === "recommended"}
          <button
            class="rounded-full border border-border bg-bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent disabled:text-text-muted"
            data-testid={setupWorkspaceTestIds.wizardStepSkip}
            disabled={blocksActions}
            onclick={handleSkip}
            type="button"
          >
            Skip
          </button>
        {/if}
      </footer>
    </section>
  {:else if wizardState.phase === "paused_detour"}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary"
      data-testid={setupWorkspaceTestIds.wizardPausedDetour}
    >
      <p>
        {#if currentStep}
          Your next step is <strong class="text-text-primary">{currentStep.title}</strong>. Open the
          expert section to make changes, then come back and click Resume. If the status flips to
          complete while you're away, we'll auto-advance.
        {:else}
          Wizard paused while you explore the expert section. Click Resume when you're ready to
          continue.
        {/if}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent hover:bg-accent/20"
          data-testid={setupWorkspaceTestIds.wizardResume}
          onclick={handleResume}
          type="button"
        >
          Resume wizard
        </button>
      </div>
    </div>
  {:else if wizardState.phase === "paused_checkpoint"}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary"
      data-testid={setupWorkspaceTestIds.wizardPausedCheckpoint}
    >
      <p>
        Waiting for vehicle reboot to finish. The wizard will automatically continue once the
        vehicle is back.
      </p>
    </div>
  {:else if wizardState.phase === "paused_scope_change"}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary"
      data-testid={setupWorkspaceTestIds.wizardPausedScope}
    >
      <p>
        A different vehicle connected. The current wizard progress applies to the previous vehicle.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent hover:bg-accent/20"
          data-testid={setupWorkspaceTestIds.wizardRestart}
          onclick={handleRestart}
          type="button"
        >
          Restart for new vehicle
        </button>
      </div>
    </div>
  {:else if wizardState.phase === "complete"}
    <section
      class="mt-4 space-y-3 rounded-lg border border-success/40 bg-success/5 p-3"
      data-testid={setupWorkspaceTestIds.wizardHandoff}
    >
      <header>
        <p class="text-xs font-semibold uppercase tracking-widest text-success">Wizard complete</p>
        <h4 class="mt-1 text-sm font-semibold text-text-primary">Here's what we configured</h4>
      </header>
      {#if wizardState.handoffSummary}
        <div class="grid gap-3 text-xs text-text-secondary">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Configured
            </p>
            <ul class="mt-1 space-y-1">
              {#each wizardState.handoffSummary.configuredSteps as stepId (stepId)}
                {@const step = stepById(stepId)}
                {#if step}
                  {@render handoffRow(step)}
                {/if}
              {/each}
            </ul>
          </div>
          {#if wizardState.handoffSummary.skippedSteps.length > 0}
            <div>
              <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Skipped
              </p>
              <ul class="mt-1 space-y-1">
                {#each wizardState.handoffSummary.skippedSteps as stepId (stepId)}
                  {@const step = stepById(stepId)}
                  {#if step}
                    {@render handoffRow(step)}
                  {/if}
                {/each}
              </ul>
            </div>
          {/if}
          {#if wizardState.handoffSummary.remainingRequired.length > 0}
            <div>
              <p class="text-xs font-semibold uppercase tracking-widest text-warning">
                Still required
              </p>
              <ul class="mt-1 space-y-1">
                {#each wizardState.handoffSummary.remainingRequired as stepId (stepId)}
                  {@const step = stepById(stepId)}
                  {#if step}
                    {@render handoffRow(step)}
                  {/if}
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
      <button
        class="rounded-full border border-success bg-success/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-success hover:bg-success/20"
        data-testid={setupWorkspaceTestIds.wizardHandoffAcknowledge}
        onclick={handleAcknowledge}
        type="button"
      >
        Acknowledge and close
      </button>
    </section>
  {/if}
</section>
