<script lang="ts">
import type {
  ParameterWorkflowCardId,
  ParameterWorkflowSection as ParameterWorkflowSectionModel,
} from "../../../lib/params/parameter-workflows";
import { Card } from "../../../components/ui";
import ParameterWorkflowCard from "./ParameterWorkflowCard.svelte";
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

let {
  section,
  batteryControls = null,
  flightControls = null,
  replayReadonly = false,
  onStage,
  onOpenAdvanced,
}: {
  section: ParameterWorkflowSectionModel;
  batteryControls?: BatteryControls | null;
  flightControls?: FlightControls | null;
  replayReadonly?: boolean;
  onStage: (cardId: ParameterWorkflowCardId) => void;
  onOpenAdvanced: (cardId: ParameterWorkflowCardId) => void;
} = $props();
</script>

<Card.Root
  as="section"
  surface="primary"
  testId={`${parameterWorkspaceTestIds.workflowSectionPrefix}-${section.id}`}
>
  <div>
    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Guided workflows</p>
    <h3 class="mt-2 text-lg font-semibold text-text-primary">{section.title}</h3>
    <p class="mt-2 text-sm leading-6 text-text-secondary">{section.description}</p>
  </div>

  <div class="parameter-workflow-card-grid mt-4 grid gap-4">
    {#each section.cards as card (card.id)}
      <ParameterWorkflowCard
        {batteryControls}
        {card}
        {flightControls}
        {onOpenAdvanced}
        {replayReadonly}
        {onStage}
      />
    {/each}
  </div>
</Card.Root>

<style>
  .parameter-workflow-card-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  }
</style>
