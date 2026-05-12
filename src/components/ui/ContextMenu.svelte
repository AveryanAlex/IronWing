<script lang="ts">
import { ContextMenu as Bits } from "bits-ui";
import type { Snippet } from "svelte";
import type { ContextMenuItem } from "./context-menu-types";

type Props = {
  items: ReadonlyArray<ContextMenuItem>;
  testId?: string;
  trigger: Snippet;
};

let { items, testId, trigger }: Props = $props();
</script>

<Bits.Root>
  <Bits.Trigger class="ui-context-menu__trigger">{@render trigger()}</Bits.Trigger>
  <Bits.Portal>
    <Bits.Content class="ui-context-menu__content" data-testid={testId}>
      {#each items as item (item.id)}
        <Bits.Item
          class="ui-context-menu__item"
          data-destructive={item.destructive || undefined}
          disabled={item.disabled}
          onSelect={() => item.onSelect()}
        >
          {item.label}
        </Bits.Item>
      {/each}
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>

<style>
:global(.ui-context-menu__trigger) { display: contents; }
:global(.ui-context-menu__content) { z-index: 60; min-width: 180px; padding: 4px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
:global(.ui-context-menu__item) { display: block; width: 100%; padding: 6px 10px; text-align: left; color: var(--color-text-primary); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.84rem; }
:global(.ui-context-menu__item[data-highlighted]) { background: var(--color-bg-tertiary); }
:global(.ui-context-menu__item[data-destructive]) { color: var(--color-danger); }
:global(.ui-context-menu__item[data-disabled]) { opacity: 0.55; cursor: not-allowed; }
</style>
