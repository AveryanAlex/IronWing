<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";

import { Card, HelperText } from "../../../components/ui";

type Props = {
  testId?: string;
  class?: ClassValue;
  children: Snippet;
};

let { testId, class: className, children }: Props = $props();
</script>

<Card.Root surface="primary" density="compact" class={className} {testId}>
  <HelperText size="xs">
    {@render children()}
  </HelperText>
</Card.Root>
