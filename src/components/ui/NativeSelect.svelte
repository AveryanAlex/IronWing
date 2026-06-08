<script lang="ts">
import type { ClassValue } from "clsx";
import { ChevronDown } from "lucide-svelte";
import type { Snippet } from "svelte";
import type { HTMLSelectAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type SelectSize = "sm" | "default" | "lg";

type NativeSelectOption = {
  value: string;
  label: string;
  title?: string;
  disabled?: boolean;
};

type Props = Omit<HTMLSelectAttributes, "class" | "size" | "value"> & {
  value?: string | string[] | undefined;
  options?: ReadonlyArray<NativeSelectOption>;
  placeholder?: string;
  size?: SelectSize;
  invalid?: boolean;
  testId?: string;
  class?: ClassValue;
  children?: Snippet;
};

const sizeClasses: Record<SelectSize, string> = {
  sm: "h-8 py-0 pl-2.5 pr-8 text-xs",
  default: "h-9 py-0 pl-3 pr-9 text-sm",
  lg: "h-10 py-0 pl-3.5 pr-10 text-base",
};

let {
  value = $bindable(),
  options,
  placeholder,
  size = "default",
  invalid = false,
  testId,
  multiple = false,
  class: className,
  "aria-invalid": ariaInvalid,
  children,
  ...rest
}: Props = $props();

let selectClass = $derived(
  cn(
    "w-full rounded-md border border-border-light bg-bg-input text-text-primary shadow-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-50",
    !multiple && "appearance-none",
    multiple && "min-h-24 py-2 pr-3",
    sizeClasses[size],
    invalid && "border-danger/70 focus-visible:border-danger focus-visible:ring-danger/25",
    className,
  ),
);
</script>

<div class="relative w-full" data-ui-native-select-shell data-layout-scroll-x="allowed">
  {#if multiple}
    <select
      {...rest}
      bind:value
      class={selectClass}
      data-ui-native-select
      data-testid={testId}
      multiple
      aria-invalid={invalid ? "true" : ariaInvalid}
    >
      {#if placeholder}
        <option value="" disabled>{placeholder}</option>
      {/if}
      {#each options ?? [] as option (option.value)}
        <option value={option.value} disabled={option.disabled} title={option.title}>{option.label}</option>
      {/each}
      {@render children?.()}
    </select>
  {:else}
    <select
      {...rest}
      bind:value
      class={selectClass}
      data-ui-native-select
      data-testid={testId}
      aria-invalid={invalid ? "true" : ariaInvalid}
    >
      {#if placeholder}
        <option value="" disabled>{placeholder}</option>
      {/if}
      {#each options ?? [] as option (option.value)}
        <option value={option.value} disabled={option.disabled} title={option.title}>{option.label}</option>
      {/each}
      {@render children?.()}
    </select>
  {/if}
  {#if !multiple}
    <ChevronDown
      class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
      size={16}
      aria-hidden="true"
    />
  {/if}
</div>
