<script lang="ts">
import { Alert } from "../../../components/ui";

type LocalMapMessage = {
  tone: "warning" | "info";
  text: string;
};

type Props = {
  localMessage: LocalMapMessage | null;
  diagnostics: string[];
};

let {
  localMessage,
  diagnostics,
}: Props = $props();
</script>

{#if localMessage && localMessage.tone === "info"}
  <Alert class="mt-3" density="compact" shadow={false} variant="info">
    {localMessage.text}
  </Alert>
{/if}

{#if diagnostics.length > 0}
  <Alert class="mt-4" density="compact" shadow={false} variant="warning">
    <p class="font-semibold">Map diagnostics</p>
    <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
      {#each diagnostics as warning (`${warning}`)}
        <li>{warning}</li>
      {/each}
    </ul>
  </Alert>
{/if}
