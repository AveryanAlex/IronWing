<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLInputAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type InputSize = "sm" | "default" | "lg";
type InputValue = HTMLInputAttributes["value"];

type Props = Omit<HTMLInputAttributes, "class" | "size" | "value"> & {
  value?: InputValue;
  size?: InputSize;
  invalid?: boolean;
  left?: Snippet;
  right?: Snippet;
  class?: ClassValue;
  testId?: string;
  "data-testid"?: string;
};

const sizeClasses: Record<InputSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  default: "h-9 px-3 text-sm",
  lg: "h-10 px-3.5 text-base",
};

let {
  value = $bindable(),
  size = "default",
  invalid = false,
  left,
  right,
  class: className,
  testId,
  "data-testid": dataTestId,
  "aria-invalid": ariaInvalid,
  ...rest
}: Props = $props();

let inputClass = $derived(
  cn(
    "w-full rounded-md border border-border-light bg-bg-input text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-50",
    sizeClasses[size],
    left && "pl-9",
    right && "pr-9",
    invalid && "border-danger/70 focus-visible:border-danger focus-visible:ring-danger/25",
    className,
  ),
);
</script>

{#if left || right}
  <div class="relative flex items-center" data-ui-input-shell>
    {#if left}
      <span class="pointer-events-none absolute left-3 inline-flex items-center text-text-muted" data-ui-input-left>
        {@render left()}
      </span>
    {/if}
    <input
      {...rest}
      bind:value
      class={inputClass}
      data-ui-input
      data-testid={testId ?? dataTestId}
      aria-invalid={invalid ? "true" : ariaInvalid}
    />
    {#if right}
      <span class="pointer-events-none absolute right-3 inline-flex items-center text-text-muted" data-ui-input-right>
        {@render right()}
      </span>
    {/if}
  </div>
{:else}
  <input
    {...rest}
    bind:value
    class={inputClass}
    data-ui-input
    data-testid={testId ?? dataTestId}
    aria-invalid={invalid ? "true" : ariaInvalid}
  />
{/if}
