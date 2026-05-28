<script lang="ts">
import type { Snippet } from "svelte";
import { Tooltip as Bits } from "bits-ui";
import type { TooltipContentProps, TooltipRootProps } from "bits-ui";
import { cn } from "../../lib/utils";

type Props = Omit<TooltipRootProps, "children" | "delayDuration" | "onOpenChange" | "open"> & {
  label?: string;
  title?: string;
  description?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: TooltipContentProps["side"];
  align?: TooltipContentProps["align"];
  sideOffset?: TooltipContentProps["sideOffset"];
  delayMs?: number;
  skipDelayMs?: number;
  clickToToggle?: boolean;
  contentId?: string;
  contentClass?: string;
  triggerClass?: string;
  testId?: string;
  contentTestId?: string;
  withArrow?: boolean;
  children: Snippet;
  content?: Snippet;
};

let {
  label,
  title,
  description,
  open = $bindable(false),
  onOpenChange,
  side = "top",
  align = "center",
  sideOffset = 8,
  delayMs = 250,
  skipDelayMs = 300,
  clickToToggle = false,
  contentId,
  contentClass,
  triggerClass,
  testId,
  contentTestId,
  withArrow = true,
  children,
  content,
  disableCloseOnTriggerClick,
  ...rootProps
}: Props = $props();

let tooltipContent = $derived(description ?? label ?? "");
let resolvedDisableCloseOnTriggerClick = $derived(clickToToggle || disableCloseOnTriggerClick);
let resolvedContentClass = $derived(
  cn(
    "z-[70] max-w-xs rounded-md border border-border-light bg-bg-tertiary px-2.5 py-1.5 text-left text-xs leading-relaxed text-text-secondary shadow-md shadow-black/30 outline-none",
    "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
    "origin-(--bits-tooltip-content-transform-origin)",
    contentClass,
  ),
);

function setOpen(nextOpen: boolean) {
  open = nextOpen;
  onOpenChange?.(nextOpen);
}

function handleOpenChange(nextOpen: boolean) {
  setOpen(nextOpen);
}

function handleTriggerClick(event: MouseEvent, bitsClick: unknown) {
  if (!clickToToggle) {
    if (typeof bitsClick === "function") {
      (bitsClick as (event: MouseEvent) => void)(event);
    }
    return;
  }

  event.preventDefault();
  setOpen(!open);
}
</script>

<Bits.Provider delayDuration={delayMs} skipDelayDuration={skipDelayMs}>
  <Bits.Root
    bind:open
    delayDuration={delayMs}
    disableCloseOnTriggerClick={resolvedDisableCloseOnTriggerClick}
    onOpenChange={handleOpenChange}
    {...rootProps}
  >
    <Bits.Trigger>
      {#snippet child({ props })}
        <span
          class={cn("inline-flex", triggerClass)}
          {...props}
          onclick={(event) => handleTriggerClick(event, props.onclick)}
        >
          {@render children()}
        </span>
      {/snippet}
    </Bits.Trigger>
    <Bits.Portal>
      <Bits.Content
        id={contentId}
        class={resolvedContentClass}
        {side}
        {align}
        data-testid={contentTestId ?? testId}
        {sideOffset}
      >
        {#if withArrow}
          <Bits.Arrow class="fill-bg-tertiary stroke-border-light" />
        {/if}
        {#if content}
          {@render content()}
        {:else}
          {#if title}
            <p class="font-semibold text-text-primary">{title}</p>
          {/if}
          {#if tooltipContent}
            <p class={title ? "mt-1" : ""}>{tooltipContent}</p>
          {/if}
        {/if}
      </Bits.Content>
    </Bits.Portal>
  </Bits.Root>
</Bits.Provider>
