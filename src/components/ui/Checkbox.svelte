<script lang="ts">
import type { ClassValue } from "clsx";
import { Check, Minus } from "lucide-svelte";
import type { HTMLInputAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type Props = Omit<HTMLInputAttributes, "checked" | "class" | "disabled" | "id" | "type"> & {
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label?: string;
  description?: string;
  id?: string;
  testId?: string;
  class?: ClassValue;
  onCheckedChange?: (checked: boolean) => void;
};

const generatedId = $props.id();

let {
  checked = $bindable(false),
  indeterminate = $bindable(false),
  disabled = false,
  label,
  description,
  id = generatedId,
  testId,
  class: className,
  onCheckedChange,
  onchange,
  ...rest
}: Props = $props();

let inputElement: HTMLInputElement | undefined = $state();
let descriptionId = $derived(description ? `${id}-description` : undefined);
let rootClass = $derived(
  cn(
    "peer size-4 shrink-0 appearance-none rounded-sm border border-border-light bg-bg-input shadow-sm transition-colors checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ),
);

$effect(() => {
  if (inputElement) {
    inputElement.indeterminate = indeterminate;
  }
});

function handleChange(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
  checked = event.currentTarget.checked;
  if (!checked) {
    indeterminate = false;
  }
  onchange?.(event);
  onCheckedChange?.(checked);
}
</script>

<div class="flex items-start gap-3" data-ui-checkbox-field>
  <span class="relative mt-0.5 inline-flex size-4 shrink-0">
    <input
      {...rest}
      bind:this={inputElement}
      bind:checked
      class={rootClass}
      {disabled}
      {id}
      data-testid={testId}
      aria-describedby={descriptionId}
      aria-label={label ? undefined : "Checkbox"}
      type="checkbox"
      onchange={handleChange}
    />
    <span class="pointer-events-none absolute inset-0 flex items-center justify-center text-bg-primary opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100">
      {#if indeterminate}
        <Minus size={12} aria-hidden="true" />
      {:else}
        <Check size={12} aria-hidden="true" />
      {/if}
    </span>
  </span>
  {#if label || description}
    <div class="grid gap-1 leading-none">
      {#if label}
        <label class="text-sm font-medium text-text-primary data-[disabled=true]:opacity-60" for={id} data-disabled={disabled ? "true" : undefined}>
          {label}
        </label>
      {/if}
      {#if description}
        <p class="text-sm leading-5 text-text-secondary" id={descriptionId}>{description}</p>
      {/if}
    </div>
  {/if}
</div>
