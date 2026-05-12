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
        <span class="ui-tooltip__trigger" {...props}>
          {@render children()}
        </span>
      {/snippet}
    </Bits.Trigger>
    <Bits.Portal>
      <Bits.Content class="ui-tooltip__content" {side} data-testid={testId} sideOffset={6}>
        {label}
      </Bits.Content>
    </Bits.Portal>
  </Bits.Root>
</Bits.Provider>

<style>
:global(.ui-tooltip__trigger) { display: inline-flex; }
:global(.ui-tooltip__content) { z-index: 70; padding: 4px 8px; background: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 0.78rem; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
</style>
