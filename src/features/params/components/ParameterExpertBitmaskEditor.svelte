<script lang="ts">
import { Checkbox } from "../../../components/ui";

let {
  options,
  value,
  disabled = false,
  onToggle,
}: {
  options: Array<{ bit: number; label: string; enabled: boolean }>;
  value: number;
  disabled?: boolean;
  onToggle: (nextValue: number) => void;
} = $props();

function toggleBit(bit: number) {
  const mask = 2 ** bit;
  const hasBit = Math.floor(value / mask) % 2 === 1;
  const nextValue = hasBit ? value - mask : value + mask;
  onToggle(nextValue);
}
</script>

<div class="flex flex-wrap gap-2">
  {#each options as option (`${option.bit}:${option.label}`)}
    {@const toggleLabel = `Bit ${option.bit} - ${option.label}`}
    <div class={`rounded-md border px-2.5 py-1.5 text-xs transition ${option.enabled ? "border-accent/30 bg-accent/10" : "border-border bg-bg-secondary"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-accent"}`}>
      <Checkbox
        checked={option.enabled}
        disabled={disabled}
        label={toggleLabel}
        onCheckedChange={() => toggleBit(option.bit)}
      />
    </div>
  {/each}
</div>
