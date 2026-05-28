<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type InputGroupSize = "sm" | "default" | "lg";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "class"> & {
  size?: InputGroupSize;
  invalid?: boolean;
  prefix?: Snippet;
  suffix?: Snippet;
  children?: Snippet;
  class?: ClassValue;
};

const sizeClasses: Record<InputGroupSize, string> = {
  sm: "min-h-8 text-xs",
  default: "min-h-9 text-sm",
  lg: "min-h-10 text-base",
};

let {
  size = "default",
  invalid = false,
  prefix,
  suffix,
  children,
  class: className,
  "aria-invalid": ariaInvalid,
  ...rest
}: Props = $props();

let groupClass = $derived(
  cn(
    "flex w-full items-stretch overflow-hidden rounded-md border border-border-light bg-bg-input shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/35 data-[disabled=true]:opacity-50",
    sizeClasses[size],
    invalid && "border-danger/70 focus-within:border-danger focus-within:ring-danger/25",
    className,
  ),
);
</script>

<div {...rest} class={groupClass} data-input-group aria-invalid={invalid ? "true" : ariaInvalid}>
  {#if prefix}
    <span class="inline-flex shrink-0 items-center border-r border-border-light px-3 text-text-secondary" data-input-group-prefix>
      {@render prefix()}
    </span>
  {/if}
  <div class="flex min-w-0 flex-1 items-stretch" data-input-group-control>
    {@render children?.()}
  </div>
  {#if suffix}
    <span class="inline-flex shrink-0 items-center border-l border-border-light px-3 text-text-secondary" data-input-group-suffix>
      {@render suffix()}
    </span>
  {/if}
</div>

<style>
  :global([data-input-group] [data-ui-input]),
  :global([data-input-group] [data-ui-number-input]),
  :global([data-input-group] [data-ui-native-select]) {
    min-height: 100%;
    border-color: transparent;
    background: transparent;
    box-shadow: none !important;
  }

  :global([data-input-group] [data-ui-input]:focus-visible),
  :global([data-input-group] [data-ui-native-select]:focus-visible) {
    box-shadow: none !important;
  }
</style>
