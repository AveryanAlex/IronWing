<script lang="ts">
import { detectBooleanEnumOptions } from "../../../lib/params/boolean-enum";
import ParameterBooleanSwitch from "../../ui/ParameterBooleanSwitch.svelte";

type Option = {
  code: number;
  label: string;
};

let {
  id,
  value,
  options,
  disabled = false,
  testId,
  onChange,
}: {
  id: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  testId?: string;
  onChange: (value: string) => void;
} = $props();

let booleanOptions = $derived(detectBooleanEnumOptions(options));
</script>

{#if booleanOptions}
  <ParameterBooleanSwitch
    checked={Number(value) === booleanOptions.on.code}
    {disabled}
    {id}
    offLabel={booleanOptions.off.label}
    onLabel={booleanOptions.on.label}
    onToggle={(checked) => onChange(String(checked ? booleanOptions.on.code : booleanOptions.off.code))}
    testId={testId}
  />
{:else}
  <select
    {id}
    class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
    data-testid={testId}
    {disabled}
    onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
    {value}
  >
    {#each options as option (option.code)}
      <option value={String(option.code)}>{option.label}</option>
    {/each}
  </select>
{/if}
