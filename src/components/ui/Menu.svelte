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
  "ui-menu__trigger inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-[0.65rem] py-[0.35rem] text-[0.82rem] font-semibold text-[var(--color-text-primary)]",
  triggerTone === "accent" ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "",
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
    <Bits.Content class="z-[60] min-w-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]" sideOffset={6}>
      {#each items as item (item.id)}
        <Bits.Item
          class="flex w-full cursor-pointer items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[0.84rem] text-[var(--color-text-primary)] data-[destructive]:text-[var(--color-danger)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55 data-[highlighted]:bg-[var(--color-bg-tertiary)]"
          data-destructive={item.destructive || undefined}
          data-testid={item.testId}
          disabled={item.disabled}
          onSelect={() => item.onSelect()}
        >
          {#if item.icon}
            <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--color-text-secondary)]" aria-hidden="true">{@render item.icon()}</span>
          {/if}
          <span class="min-w-0 flex-1">{item.label}</span>
        </Bits.Item>
      {/each}
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>
