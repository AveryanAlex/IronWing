<script lang="ts">
import type { Snippet } from "svelte";
import { fromStore } from "svelte/store";

import type {
  SetupWizardStore,
  WizardStepSnapshot,
  WizardStoreState,
} from "../../../lib/stores/setup-wizard";
import { trackAnalytics } from "../../../lib/analytics/client";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { ActionRow, Button, Eyebrow, HelperText } from "../../../components/ui";
import SetupCard from "../shared/SetupCard.svelte";
import SetupCardHeader from "../shared/SetupCardHeader.svelte";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupStatusPill from "../shared/SetupStatusPill.svelte";
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
  trackWizardAction("start");
  store.start();
}
function handleAdvance() {
  trackWizardAction("advance");
  store.advance();
}
function handleSkip() {
  trackWizardAction("skip");
  store.skip();
}
function handleDetour() {
  if (!currentStep) return;
  trackWizardAction("detour");
  store.pause("detour");
  onSelectSection(currentStep.sectionId);
}
function handleResume() {
  trackWizardAction("resume");
  store.resume();
}
function handleRestart() {
  trackWizardAction("restart");
  store.restart();
}
function handleAcknowledge() {
  trackWizardAction("acknowledge");
  store.acknowledgeHandoff();
  onClose();
}
function handleHandoffJump(sectionId: string) {
  trackAnalytics("setup_wizard_step", { action: "handoff_jump", step: currentStep?.id ?? "handoff", section: sectionId });
  onSelectSection(sectionId);
  onClose();
}

function trackWizardAction(action: string) {
  trackAnalytics("setup_wizard_step", {
    action,
    step: currentStep?.id ?? "none",
    section: currentStep?.sectionId ?? "none",
  });
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
    <span class="text-xs font-semibold text-text-primary">
      {step.title}
    </span>
    <Button
      variant="outline"
      size="sm"
      class="h-6 px-2 text-xs uppercase tracking-widest"
      shape="pill"
      onclick={() => handleHandoffJump(step.sectionId)}
    >
      Jump to expert
    </Button>
  </li>
{/snippet}

<section class="space-y-4" data-testid={setupWorkspaceTestIds.wizardRoot} data-phase={wizardState.phase}>
  <SetupCard testId={setupWorkspaceTestIds.wizardHeader}>
    <SetupCardHeader title="Wizard progress">
      {#snippet actions()}
        <div class="flex items-center gap-2">
          <SetupStatusPill tone="muted">{phaseLabel(wizardState)}</SetupStatusPill>
          <Button
            variant="outline"
            size="sm"
            class="h-7 px-3 text-xs uppercase tracking-widest"
            shape="pill"
            testId={setupWorkspaceTestIds.wizardClose}
            onclick={onClose}
          >
            Close
          </Button>
        </div>
      {/snippet}
    </SetupCardHeader>

  <HelperText
    size="xs"
    tone="muted"
  >
    {progressSummary(wizardState)}
  </HelperText>

  <ol class="mt-3 flex flex-wrap gap-2">
    {#each wizardState.steps as step (step.id)}
      <li class="rounded-full bg-bg-secondary px-2 py-1 text-xs font-medium text-text-secondary">
        {step.title}
      </li>
    {/each}
  </ol>
  </SetupCard>

  {#if wizardState.phase === "idle"}
    <SetupCard variant="primary" class="border-dashed text-sm text-text-secondary">
      <HelperText>
        Run the beginner path when you want a guided setup for a new vehicle. Expert sections stay
        available any time.
      </HelperText>
      <Button
        class="mt-3"
        shape="pill"
        tone="accent"
        variant="soft"
        testId={setupWorkspaceTestIds.wizardStart}
        onclick={handleStart}
      >
        Start wizard
      </Button>
    </SetupCard>
  {:else if wizardState.phase === "active" && currentStep}
    <SetupCard
      variant="primary"
      class="p-3"
      testId={setupWorkspaceTestIds.wizardStepFrame}
      dataStep={currentStep.id}
    >
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Eyebrow tracking="widest">
            {currentStep.tier === "required" ? "Required" : "Recommended"}
          </Eyebrow>
          <h4 class="mt-1 text-sm font-semibold text-text-primary">{currentStep.title}</h4>
          <HelperText class="mt-1" size="xs">{currentStep.description}</HelperText>
        </div>
      </header>

      <div class="mt-3">
        {@render children({ step: currentStep, advance: handleAdvance, skip: handleSkip })}
      </div>

      <ActionRow align="start" class="mt-4">
        <Button
          size="sm"
          class="text-xs uppercase tracking-widest"
          shape="pill"
          testId={setupWorkspaceTestIds.wizardStepDetour}
          variant="outline"
          onclick={handleDetour}
        >
          Open full section
        </Button>
        <Button
          size="sm"
          class="text-xs uppercase tracking-widest"
          shape="pill"
          tone="accent"
          testId={setupWorkspaceTestIds.wizardStepAdvance}
          variant="soft"
          disabled={blocksActions}
          onclick={handleAdvance}
        >
          Advance
        </Button>
        {#if currentStep.tier === "recommended"}
          <Button
            size="sm"
            class="text-xs uppercase tracking-widest"
            shape="pill"
            testId={setupWorkspaceTestIds.wizardStepSkip}
            variant="outline"
            disabled={blocksActions}
            onclick={handleSkip}
          >
            Skip
          </Button>
        {/if}
      </ActionRow>
    </SetupCard>
  {:else if wizardState.phase === "paused_detour"}
    <SetupNotice tone="warning" testId={setupWorkspaceTestIds.wizardPausedDetour}>
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
      <ActionRow align="start" class="mt-3">
        <Button
          size="sm"
          class="text-xs uppercase tracking-widest"
          shape="pill"
          tone="accent"
          testId={setupWorkspaceTestIds.wizardResume}
          variant="soft"
          onclick={handleResume}
        >
          Resume wizard
        </Button>
      </ActionRow>
    </SetupNotice>
  {:else if wizardState.phase === "paused_checkpoint"}
    <SetupNotice tone="warning" testId={setupWorkspaceTestIds.wizardPausedCheckpoint}>
      <p>
        Waiting for vehicle reboot to finish. The wizard will automatically continue once the
        vehicle is back.
      </p>
    </SetupNotice>
  {:else if wizardState.phase === "paused_scope_change"}
    <SetupNotice tone="warning" testId={setupWorkspaceTestIds.wizardPausedScope}>
      <p>
        A different vehicle connected. The current wizard progress applies to the previous vehicle.
      </p>
      <ActionRow align="start" class="mt-3">
        <Button
          size="sm"
          class="text-xs uppercase tracking-widest"
          shape="pill"
          tone="accent"
          testId={setupWorkspaceTestIds.wizardRestart}
          variant="soft"
          onclick={handleRestart}
        >
          Restart for new vehicle
        </Button>
      </ActionRow>
    </SetupNotice>
  {:else if wizardState.phase === "complete"}
    <SetupCard tone="success" class="space-y-3 p-3" testId={setupWorkspaceTestIds.wizardHandoff}>
      <header>
        <Eyebrow tracking="widest" tone="success">Wizard complete</Eyebrow>
        <h4 class="mt-1 text-sm font-semibold text-text-primary">Here's what we configured</h4>
      </header>
      {#if wizardState.handoffSummary}
        <div class="grid gap-3 text-xs text-text-secondary">
          <div>
            <Eyebrow tracking="widest">
              Configured
            </Eyebrow>
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
              <Eyebrow tracking="widest">
                Skipped
              </Eyebrow>
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
              <Eyebrow tracking="widest" tone="warning">
                Still required
              </Eyebrow>
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
      <Button
        size="sm"
        class="text-xs uppercase tracking-widest"
        shape="pill"
        tone="success"
        testId={setupWorkspaceTestIds.wizardHandoffAcknowledge}
        variant="soft"
        onclick={handleAcknowledge}
      >
        Acknowledge and close
      </Button>
    </SetupCard>
  {/if}
</section>
