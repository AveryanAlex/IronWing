<script lang="ts">
import { X } from "lucide-svelte";

let {
  name,
  onUnstage,
  testId,
}: {
  name: string;
  onUnstage?: (name: string) => void;
  testId?: string;
} = $props();
</script>

{#if onUnstage}
  <button
    aria-label={`Unstage ${name}`}
    class="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-xs font-semibold lowercase text-warning transition hover:bg-warning/20 focus:outline-none focus:ring-1 focus:ring-warning/40"
    data-testid={testId}
    onclick={() => onUnstage?.(name)}
    type="button"
  >
    staged
    <X aria-hidden="true" size={10} />
  </button>
{:else}
  <span
    class="inline-flex items-center rounded bg-warning/10 px-1.5 py-0.5 text-xs font-semibold lowercase text-warning"
    data-testid={testId}
  >
    staged
  </span>
{/if}
