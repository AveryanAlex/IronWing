<script lang="ts">
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type LocalMapMessage = {
  tone: "warning" | "info";
  text: string;
};

type Props = {
  localMessage: LocalMapMessage | null;
  diagnostics: string[];
  debugPayload: unknown;
};

let {
  localMessage,
  diagnostics,
  debugPayload,
}: Props = $props();
</script>

{#if localMessage && localMessage.tone === "info"}
  <div class="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
    {localMessage.text}
  </div>
{/if}

{#if diagnostics.length > 0}
  <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
    <p class="font-semibold">Map diagnostics</p>
    <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
      {#each diagnostics as warning (`${warning}`)}
        <li>{warning}</li>
      {/each}
    </ul>
  </div>
{/if}

<pre class="sr-only" data-testid={missionWorkspaceTestIds.mapDebug}>{JSON.stringify(debugPayload)}</pre>
