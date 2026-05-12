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
  <Bits.Trigger class="ui-select__trigger" {disabled} data-testid={testId}>
    <span>{selectedLabel}</span>
  </Bits.Trigger>
  <Bits.Portal>
    <Bits.Content class="ui-select__content" sideOffset={6}>
      <Bits.Viewport>
        {#each options as option (option.value)}
          <Bits.Item class="ui-select__item" value={option.value} label={option.label} disabled={option.disabled}>
            {option.label}
          </Bits.Item>
        {/each}
      </Bits.Viewport>
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>

<style>
:global(.ui-select__trigger) { display: inline-flex; align-items: center; justify-content: space-between; min-width: 160px; padding: 6px 10px; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); background: var(--color-bg-primary); color: var(--color-text-primary); font-size: 0.86rem; cursor: pointer; }
:global(.ui-select__trigger[data-disabled]) { opacity: 0.55; cursor: not-allowed; }
:global(.ui-select__content) { z-index: 60; min-width: var(--bits-select-anchor-width); background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,0.45); padding: 4px; max-height: 280px; overflow: auto; }
:global(.ui-select__item) { padding: 6px 10px; border-radius: var(--radius-sm); color: var(--color-text-primary); cursor: pointer; font-size: 0.86rem; }
:global(.ui-select__item[data-highlighted]) { background: var(--color-bg-tertiary); }
:global(.ui-select__item[data-disabled]) { opacity: 0.55; cursor: not-allowed; }
</style>
