<script lang="ts">
import { Select as Bits } from "bits-ui";
import type { SelectOption } from "./select-types";

type Props = {
  value: string;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
  onChange: (value: string) => void;
};

let { value, options, placeholder, disabled, testId, onChange }: Props = $props();

let selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? placeholder ?? "");
</script>

<Bits.Root type="single" {value} onValueChange={(next) => { if (typeof next === "string") onChange(next); }}>
  <Bits.Trigger
    class="inline-flex min-w-40 cursor-pointer items-center justify-between rounded-md border border-border-light bg-bg-secondary px-2.5 py-1.5 text-sm text-text-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
    {disabled}
    data-testid={testId}
  >
    <span>{selectedLabel}</span>
  </Bits.Trigger>
  <Bits.Portal>
    <Bits.Content
      class="z-[60] max-h-72 min-w-[var(--bits-select-anchor-width)] overflow-auto rounded-md border border-border bg-bg-secondary p-1 shadow-lg shadow-black/30"
      sideOffset={6}
    >
      <Bits.Viewport>
        {#each options as option (option.value)}
          <Bits.Item
            class="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-text-primary data-[highlighted]:bg-bg-tertiary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            value={option.value}
            label={option.label}
            disabled={option.disabled}
          >
            {option.label}
          </Bits.Item>
        {/each}
      </Bits.Viewport>
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>
