<script lang="ts">
import type {
  ParameterWorkflowCardId,
  ParameterWorkflowSection as ParameterWorkflowSectionModel,
} from "../../lib/params/parameter-workflows";
import ParameterWorkflowCard from "./ParameterWorkflowCard.svelte";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";

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

<section
  class="rounded-lg border border-border bg-bg-primary/55 p-4"
  data-testid={`${parameterWorkspaceTestIds.workflowSectionPrefix}-${section.id}`}
>
  <div>
    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Guided workflows</p>
    <h3 class="mt-2 text-lg font-semibold text-text-primary">{section.title}</h3>
    <p class="mt-2 text-sm leading-6 text-text-secondary">{section.description}</p>
  </div>

  <div class="mt-4 grid gap-4 xl:grid-cols-2">
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
</section>
