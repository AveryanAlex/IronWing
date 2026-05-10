<script lang="ts">
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
    <label
      class={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition ${option.enabled ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-secondary text-text-secondary"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent"}`}
    >
      <input
        aria-label={toggleLabel}
        checked={option.enabled}
        disabled={disabled}
        onchange={() => toggleBit(option.bit)}
        type="checkbox"
      />
      <span>{toggleLabel}</span>
    </label>
  {/each}
</div>
