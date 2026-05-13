<script lang="ts">
import type { Snippet } from "svelte";
import { Tooltip as Bits } from "bits-ui";

type Props = {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  delayMs?: number;
  testId?: string;
  children: Snippet;
};

let { label, side = "top", delayMs = 250, testId, children }: Props = $props();
</script>

<Bits.Provider delayDuration={delayMs}>
  <Bits.Root>
    <Bits.Trigger>
      {#snippet child({ props })}
        <span class="inline-flex" {...props}>
          {@render children()}
        </span>
      {/snippet}
    </Bits.Trigger>
    <Bits.Portal>
      <Bits.Content
        class="z-[70] rounded-md border border-border-light bg-bg-tertiary px-2.5 py-1 text-xs text-text-secondary shadow-md shadow-black/30"
        {side}
        data-testid={testId}
        sideOffset={6}
      >
        {label}
      </Bits.Content>
    </Bits.Portal>
  </Bits.Root>
</Bits.Provider>
