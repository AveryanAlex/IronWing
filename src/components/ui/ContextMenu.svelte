<script lang="ts">
import { ContextMenu as BitsContext } from "bits-ui";
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";
import type { ContextMenuItem } from "./context-menu-types";

type VirtualAnchor = {
  getBoundingClientRect: () => DOMRect;
};

// Programmatic-position controlled props. Coordinates are viewport/client pixels.
type ControlledProps = {
  open: boolean;
  x: number;
  y: number;
  onOpenChange: (open: boolean) => void;
};

type Props = {
  items?: ReadonlyArray<ContextMenuItem>;
  testId?: string;
  /** Right-click trigger snippet. Mutually exclusive with `controlled`. */
  trigger?: Snippet;
  /** Programmatic anchor position in viewport/client pixels. When set, `trigger` is ignored. */
  controlled?: ControlledProps;
  contentClass?: ClassValue;
  itemClass?: ClassValue;
  preventScroll?: boolean;
  sideOffset?: number;
  collisionPadding?: number;
  children?: Snippet;
};

let {
  items = [],
  testId,
  trigger,
  controlled,
  contentClass,
  itemClass,
  preventScroll = false,
  sideOffset = 2,
  collisionPadding = 8,
  children,
}: Props = $props();

let menuContentClass = $derived(
  cn(
    "z-[60] min-w-44 overflow-hidden rounded-md border border-border bg-bg-secondary p-1 shadow-lg shadow-black/30",
    contentClass,
  ),
);
let menuItemClass = $derived(
  cn(
    "flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-text-primary outline-none data-[destructive]:text-danger data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-bg-tertiary",
    itemClass,
  ),
);
let controlledAnchor = $derived(
  controlled ? createVirtualAnchor(controlled.x, controlled.y) : null,
);

function createVirtualAnchor(x: number, y: number): VirtualAnchor {
  return {
    getBoundingClientRect: () => pointRect(x, y),
  };
}

function pointRect(x: number, y: number): DOMRect {
  if (typeof DOMRect !== "undefined" && typeof DOMRect.fromRect === "function") {
    return DOMRect.fromRect({ x, y, width: 0, height: 0 });
  }

  return {
    x,
    y,
    width: 0,
    height: 0,
    top: y,
    right: x,
    bottom: y,
    left: x,
    toJSON: () => ({}),
  } as DOMRect;
}
</script>

{#snippet menuItems()}
  {#each items as item (item.id)}
    {#if item.kind === "separator"}
      <BitsContext.Separator class="-mx-1 my-1 block h-px bg-border" />
    {:else}
      <BitsContext.Item
        class={menuItemClass}
        data-destructive={item.destructive || undefined}
        data-testid={item.testId}
        disabled={item.disabled}
        title={item.title}
        textValue={item.label}
        onSelect={() => item.onSelect()}
      >
        {#if item.icon}
          <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary" aria-hidden="true">{@render item.icon()}</span>
        {/if}
        <span class="min-w-0 flex-1">{item.label}</span>
      </BitsContext.Item>
    {/if}
  {/each}
  {@render children?.()}
{/snippet}

{#if controlled && controlledAnchor}
  <BitsContext.Root open={controlled.open} onOpenChange={controlled.onOpenChange}>
    <BitsContext.Trigger
      aria-hidden="true"
      class="pointer-events-none fixed h-0 w-0 opacity-0"
      style={`left: ${controlled.x}px; top: ${controlled.y}px;`}
      tabindex={-1}
    ></BitsContext.Trigger>
    <BitsContext.Portal>
      <BitsContext.Content
        class={menuContentClass}
        customAnchor={controlledAnchor}
        data-testid={testId}
        {sideOffset}
        {collisionPadding}
        {preventScroll}
        strategy="fixed"
      >
        {@render menuItems()}
      </BitsContext.Content>
    </BitsContext.Portal>
  </BitsContext.Root>
{:else if trigger}
  <BitsContext.Root>
    <BitsContext.Trigger class="contents">{@render trigger()}</BitsContext.Trigger>
    <BitsContext.Portal>
      <BitsContext.Content
        class={menuContentClass}
        data-testid={testId}
        {sideOffset}
        {collisionPadding}
        {preventScroll}
      >
        {@render menuItems()}
      </BitsContext.Content>
    </BitsContext.Portal>
  </BitsContext.Root>
{/if}
