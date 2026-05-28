<script lang="ts">
import { Switch as Bits } from "bits-ui";
import type { SwitchRootProps } from "bits-ui";
import type { ClassValue } from "clsx";
import { cn } from "../../lib/utils";

type Props = Omit<SwitchRootProps, "checked" | "disabled" | "id" | "class" | "children" | "child" | "onCheckedChange"> & {
  checked?: boolean;
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
  disabled = false,
  label,
  description,
  id = generatedId,
  testId,
  class: className,
  onCheckedChange,
  ...rest
}: Props = $props();

let descriptionId = $derived(description ? `${id}-description` : undefined);
let rootClass = $derived(
  cn(
    "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border-light bg-bg-input p-0.5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
    className,
  ),
);
</script>

<div class="flex items-start gap-3" data-ui-switch-field>
  <Bits.Root
    {...rest}
    bind:checked
    class={rootClass}
    {disabled}
    {id}
    data-testid={testId}
    aria-describedby={descriptionId}
    aria-label={label ? undefined : "Switch"}
    {onCheckedChange}
  >
    <Bits.Thumb class="block size-4 rounded-full bg-text-muted shadow transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-bg-primary" />
  </Bits.Root>
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
