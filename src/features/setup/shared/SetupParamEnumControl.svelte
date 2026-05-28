<script lang="ts">
import { detectBooleanEnumOptions } from "../../../lib/params/boolean-enum";
import { NativeSelect, ParameterBooleanSwitch } from "../../../components/ui";

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
let nativeOptions = $derived(options.map((option) => ({ value: String(option.code), label: option.label })));
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
  <NativeSelect
    {id}
    {disabled}
    options={nativeOptions}
    onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
    {testId}
    {value}
  />
{/if}
