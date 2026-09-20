<script lang="ts">
import { LockKeyhole } from "lucide-svelte";
import type { Snippet } from "svelte";

import { Tooltip } from "../../../components/ui";
import type { SetupControlAvailability } from "../../../lib/setup/control-availability";

type Props = {
  availability: SetupControlAvailability;
  label?: string;
  class?: string;
  testId?: string;
  children: Snippet;
};

let {
  availability,
  label = "Locked setup control",
  class: className = "",
  testId,
  children,
}: Props = $props();
</script>

{#if availability.state === "locked"}
  <Tooltip
    title={availability.title}
    description={availability.description}
    clickToToggle
    align="start"
    contentClass="max-w-sm"
    triggerClass={`relative flex w-full min-w-0 cursor-not-allowed rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50 ${className}`}
    triggerTabIndex={0}
    triggerAriaLabel={`${label}. ${availability.title}. ${availability.description}${availability.nextActionLabel ? ` ${availability.nextActionLabel}` : ""}`}
    testId={testId}
  >
    {#snippet content()}
      <p class="font-semibold text-text-primary">{availability.title}</p>
      <p class="mt-1">{availability.description}</p>
      {#if availability.nextActionLabel}
        <p class="mt-2 font-medium text-warning">{availability.nextActionLabel}</p>
      {/if}
    {/snippet}

    <span
      class="relative block w-full min-w-0"
      data-setup-lock-reason={availability.reason}
      data-testid={testId ? `${testId}-surface` : undefined}
    >
      <span class="pointer-events-none block min-w-0">
        {@render children()}
      </span>
      <span
        class="pointer-events-none absolute -right-2 -top-2 inline-flex items-center justify-center rounded-full border border-warning/30 bg-bg-primary/95 p-1 text-warning shadow-sm"
        aria-hidden="true"
      >
        <LockKeyhole size={12} />
      </span>
    </span>
  </Tooltip>
{:else}
  {@render children()}
{/if}
