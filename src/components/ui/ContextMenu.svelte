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
      class="pointer-events-none absolute h-0 w-0 opacity-0"
      style="position: absolute; left: {controlled.x}px; top: {controlled.y}px;"
    ></BitsDropdown.Trigger>
    <BitsDropdown.Portal>
      <BitsDropdown.Content
        class="z-[60] min-w-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        data-testid={testId}
        sideOffset={2}
      >
        {#each items as item (item.id)}
          <BitsDropdown.Item
            class="block w-full cursor-pointer rounded-[var(--radius-sm)] px-[10px] py-1.5 text-left text-[0.84rem] text-[var(--color-text-primary)] data-[highlighted]:bg-[var(--color-bg-tertiary)] data-[destructive]:text-[var(--color-danger)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-[0.55]"
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
    <BitsContext.Trigger class="contents">{@render trigger()}</BitsContext.Trigger>
    <BitsContext.Portal>
      <BitsContext.Content
        class="z-[60] min-w-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        data-testid={testId}
      >
        {#each items as item (item.id)}
          <BitsContext.Item
            class="block w-full cursor-pointer rounded-[var(--radius-sm)] px-[10px] py-1.5 text-left text-[0.84rem] text-[var(--color-text-primary)] data-[highlighted]:bg-[var(--color-bg-tertiary)] data-[destructive]:text-[var(--color-danger)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-[0.55]"
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
