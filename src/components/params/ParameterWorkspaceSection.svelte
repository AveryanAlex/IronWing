<script lang="ts">
import type {
  ParameterWorkspaceItemView,
  ParameterWorkspaceSectionView,
} from "../../lib/stores/params";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";
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

<section
  class="rounded-lg border border-border bg-bg-primary/60 p-4"
  data-testid={`${parameterWorkspaceTestIds.sectionPrefix}-${section.id}`}
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
</section>
