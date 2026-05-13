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
    class="inline-flex min-w-[160px] cursor-pointer items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-[10px] py-1.5 text-[0.86rem] text-[var(--color-text-primary)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-[0.55]"
    {disabled}
    data-testid={testId}
  >
    <span>{selectedLabel}</span>
  </Bits.Trigger>
  <Bits.Portal>
    <Bits.Content
      class="z-[60] max-h-[280px] min-w-[var(--bits-select-anchor-width)] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      sideOffset={6}
    >
      <Bits.Viewport>
        {#each options as option (option.value)}
          <Bits.Item
            class="cursor-pointer rounded-[var(--radius-sm)] px-[10px] py-1.5 text-[0.86rem] text-[var(--color-text-primary)] data-[highlighted]:bg-[var(--color-bg-tertiary)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-[0.55]"
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
