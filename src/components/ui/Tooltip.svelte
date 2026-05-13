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
        class="z-[70] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[0.78rem] text-[var(--color-text-primary)] shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
        {side}
        data-testid={testId}
        sideOffset={6}
      >
        {label}
      </Bits.Content>
    </Bits.Portal>
  </Bits.Root>
</Bits.Provider>
