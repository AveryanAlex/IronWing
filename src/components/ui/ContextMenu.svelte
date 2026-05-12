<script lang="ts">
import { ContextMenu as BitsContext, DropdownMenu as BitsDropdown } from "bits-ui";
import type { Snippet } from "svelte";
import type { ContextMenuItem } from "./context-menu-types";

// Programmatic-position controlled props.
// IMPORTANT: callers must manage `controlled` as a $state object so its inner
// fields stay reactive — Svelte 5 does not proxy nested fields of plain prop
// objects, so passing a non-$state object will skip updates.
type ControlledProps = {
  open: boolean;
  x: number;
  y: number;
  onOpenChange: (open: boolean) => void;
};

type Props = {
  items: ReadonlyArray<ContextMenuItem>;
  testId?: string;
  /** Right-click trigger snippet. Mutually exclusive with `controlled`. */
  trigger?: Snippet;
  /** Programmatic anchor position. When set, `trigger` is ignored. */
  controlled?: ControlledProps;
};

let { items, testId, trigger, controlled }: Props = $props();
</script>

{#if controlled}
  <BitsDropdown.Root open={controlled.open} onOpenChange={controlled.onOpenChange}>
    <BitsDropdown.Trigger
      aria-hidden="true"
      tabindex={-1}
      class="ui-context-menu__virtual-trigger"
      style="position: absolute; left: {controlled.x}px; top: {controlled.y}px;"
    ></BitsDropdown.Trigger>
    <BitsDropdown.Portal>
      <BitsDropdown.Content class="ui-context-menu__content" data-testid={testId} sideOffset={2}>
        {#each items as item (item.id)}
          <BitsDropdown.Item
            class="ui-context-menu__item"
            data-destructive={item.destructive || undefined}
            disabled={item.disabled}
            onSelect={() => item.onSelect()}
          >
            {item.label}
          </BitsDropdown.Item>
        {/each}
      </BitsDropdown.Content>
    </BitsDropdown.Portal>
  </BitsDropdown.Root>
{:else if trigger}
  <BitsContext.Root>
    <BitsContext.Trigger class="ui-context-menu__trigger">{@render trigger()}</BitsContext.Trigger>
    <BitsContext.Portal>
      <BitsContext.Content class="ui-context-menu__content" data-testid={testId}>
        {#each items as item (item.id)}
          <BitsContext.Item
            class="ui-context-menu__item"
            data-destructive={item.destructive || undefined}
            disabled={item.disabled}
            onSelect={() => item.onSelect()}
          >
            {item.label}
          </BitsContext.Item>
        {/each}
      </BitsContext.Content>
    </BitsContext.Portal>
  </BitsContext.Root>
{/if}

<style>
:global(.ui-context-menu__trigger) { display: contents; }
:global(.ui-context-menu__virtual-trigger) { width: 0; height: 0; opacity: 0; pointer-events: none; }
:global(.ui-context-menu__content) { z-index: 60; min-width: 180px; padding: 4px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
:global(.ui-context-menu__item) { display: block; width: 100%; padding: 6px 10px; text-align: left; color: var(--color-text-primary); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.84rem; }
:global(.ui-context-menu__item[data-highlighted]) { background: var(--color-bg-tertiary); }
:global(.ui-context-menu__item[data-destructive]) { color: var(--color-danger); }
:global(.ui-context-menu__item[data-disabled]) { opacity: 0.55; cursor: not-allowed; }
</style>
