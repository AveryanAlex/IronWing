<script lang="ts">
import { DropdownMenu as Bits } from "bits-ui";
import type { MenuItem } from "./menu-types";

type Props = {
  triggerLabel: string;
  triggerTone?: "neutral" | "accent";
  items: ReadonlyArray<MenuItem>;
  testId?: string;
};

let { triggerLabel, triggerTone = "neutral", items, testId }: Props = $props();
</script>

<Bits.Root>
  <Bits.Trigger class="ui-menu__trigger" data-tone={triggerTone} data-testid={testId}>
    {triggerLabel}
  </Bits.Trigger>
  <Bits.Portal>
    <Bits.Content class="ui-menu__content" sideOffset={6}>
      {#each items as item (item.id)}
        <Bits.Item
          class="ui-menu__item"
          data-destructive={item.destructive || undefined}
          data-testid={item.testId}
          disabled={item.disabled}
          onSelect={() => item.onSelect()}
        >
          {#if item.icon}
            <span class="ui-menu__icon" aria-hidden="true">{@render item.icon()}</span>
          {/if}
          <span class="ui-menu__label">{item.label}</span>
        </Bits.Item>
      {/each}
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>

<style>
:global(.ui-menu__trigger) { display: inline-flex; align-items: center; gap: 4px; padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border-light); background: var(--color-bg-primary); color: var(--color-text-primary); font-weight: 600; font-size: 0.82rem; cursor: pointer; }
:global(.ui-menu__trigger[data-tone="accent"]) { color: var(--color-accent); border-color: var(--color-accent); }
:global(.ui-menu__content) { z-index: 60; min-width: 180px; padding: 4px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
:global(.ui-menu__item) { display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: 6px 10px; text-align: left; color: var(--color-text-primary); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.84rem; }
:global(.ui-menu__icon) { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; color: var(--color-text-secondary); }
:global(.ui-menu__label) { flex: 1; min-width: 0; }
:global(.ui-menu__item[data-highlighted]) { background: var(--color-bg-tertiary); }
:global(.ui-menu__item[data-destructive]) { color: var(--color-danger); }
:global(.ui-menu__item[data-disabled]) { opacity: 0.55; cursor: not-allowed; }
</style>
