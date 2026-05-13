<script lang="ts">
import { DropdownMenu as Bits } from "bits-ui";
import type { Snippet } from "svelte";
import type { MenuItem } from "./menu-types";

type Props = {
  triggerLabel: string;
  triggerAriaLabel?: string;
  triggerIcon?: Snippet;
  triggerClass?: string;
  triggerLabelClass?: string;
  triggerTone?: "neutral" | "accent";
  items: ReadonlyArray<MenuItem>;
  testId?: string;
};

let {
  triggerLabel,
  triggerAriaLabel,
  triggerIcon,
  triggerClass = "",
  triggerLabelClass = "",
  triggerTone = "neutral",
  items,
  testId,
}: Props = $props();

let triggerClasses = $derived([
  "ui-menu__trigger inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-light bg-bg-secondary px-2.5 py-1.5 text-sm font-medium text-text-primary",
  triggerTone === "accent" ? "border-accent/30 bg-accent/10 text-accent" : "",
  triggerClass,
].filter(Boolean).join(" "));
</script>

<Bits.Root>
  <Bits.Trigger class={triggerClasses} aria-label={triggerAriaLabel ?? triggerLabel} data-tone={triggerTone} data-testid={testId}>
    {#if triggerIcon}
      <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">{@render triggerIcon()}</span>
    {/if}
    <span class={`ui-menu__trigger-label min-w-0 overflow-hidden text-ellipsis ${triggerLabelClass}`}>{triggerLabel}</span>
  </Bits.Trigger>
  <Bits.Portal>
    <Bits.Content class="z-[60] min-w-40 rounded-md border border-border bg-bg-secondary p-1 shadow-lg shadow-black/30" sideOffset={6}>
      {#each items as item (item.id)}
        <Bits.Item
          class="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-text-primary data-[destructive]:text-danger data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-bg-tertiary"
          data-destructive={item.destructive || undefined}
          data-testid={item.testId}
          disabled={item.disabled}
          onSelect={() => item.onSelect()}
        >
          {#if item.icon}
            <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary" aria-hidden="true">{@render item.icon()}</span>
          {/if}
          <span class="min-w-0 flex-1">{item.label}</span>
        </Bits.Item>
      {/each}
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>
