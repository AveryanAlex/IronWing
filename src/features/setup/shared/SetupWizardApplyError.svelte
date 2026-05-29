<script lang="ts">
import type { ClassValue } from "clsx";

import { Alert } from "../../../components/ui";

type Props = {
  message: string | null | undefined;
  prefix?: string;
  testId?: string;
  class?: ClassValue;
};

let {
  message,
  prefix = "Apply failed. Staged edits are still available so you can retry.",
  testId,
  class: className,
}: Props = $props();

let description = $derived([prefix, message].filter(Boolean).join(" "));
</script>

{#if message}
  <Alert variant="danger" density="compact" shadow={false} class={className} {description} {testId} />
{/if}
