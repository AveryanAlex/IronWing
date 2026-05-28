<script lang="ts">
import { Check, Circle, HelpCircle, X } from "lucide-svelte";

import type { SectionStatus } from "../../../lib/setup-sections";

type Props = {
  status: SectionStatus | null;
};

let { status }: Props = $props();
</script>

{#if status === "complete"}
  <span class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-success/20 text-success" aria-hidden="true">
    <Check size={10} strokeWidth={3} />
  </span>
{:else if status === "in_progress"}
  <span class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent" aria-hidden="true">
    <Circle size={8} fill="currentColor" />
  </span>
{:else if status === "failed"}
  <span class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger" aria-hidden="true">
    <X size={9} strokeWidth={3} />
  </span>
{:else if status === "unknown"}
  <span class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning" aria-hidden="true">
    <HelpCircle size={9} strokeWidth={2.5} />
  </span>
{:else}
  <span class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text-muted" aria-hidden="true">
    <Circle size={8} />
  </span>
{/if}
