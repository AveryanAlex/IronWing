<script lang="ts">
import { LockKeyhole } from "lucide-svelte";

import type { SetupControlAvailability } from "../../../lib/setup/control-availability";
import SetupNotice from "./SetupNotice.svelte";

let {
  availability,
  testId,
}: {
  availability: SetupControlAvailability;
  testId?: string;
} = $props();
</script>

{#if availability.state === "locked"}
  <SetupNotice tone="warning" icon={LockKeyhole} {testId}>
    <span class="font-semibold text-text-primary">{availability.title}.</span>
    {availability.description}
    {#if availability.nextActionLabel}
      <span class="font-medium text-warning"> {availability.nextActionLabel}</span>
    {/if}
  </SetupNotice>
{/if}
