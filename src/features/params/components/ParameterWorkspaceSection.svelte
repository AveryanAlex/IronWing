<script lang="ts">
import type {
  ParameterWorkspaceItemView,
  ParameterWorkspaceSectionView,
} from "../../../lib/stores/params";
import { Card } from "../../../components/ui";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";
import ParameterWorkspaceItemEditor from "./ParameterWorkspaceItemEditor.svelte";

let {
  section,
  readiness,
  envelopeKey,
  onStage,
  onDiscard,
}: {
  section: ParameterWorkspaceSectionView;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  envelopeKey: string;
  onStage: (item: ParameterWorkspaceItemView, nextValue: number) => void;
  onDiscard: (name: string) => void;
} = $props();
</script>

<Card.Root
  as="section"
  surface="primary"
  testId={`${parameterWorkspaceTestIds.sectionPrefix}-${section.id}`}
>
  <div class="flex items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {section.mode === "fallback" ? "Available settings" : "Common settings"}
      </p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">{section.title}</h3>
    </div>
  </div>
  <p class="mt-2 text-sm leading-6 text-text-secondary">{section.description}</p>

  <div class="mt-4 space-y-3">
    {#each section.items as item (item.name)}
      <ParameterWorkspaceItemEditor {item} {readiness} {envelopeKey} {onStage} {onDiscard} />
    {/each}
  </div>
</Card.Root>
