<script lang="ts">
let {
  checked,
  disabled = false,
  offLabel = "Disabled",
  onLabel = "Enabled",
  id,
  testId,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  offLabel?: string;
  onLabel?: string;
  id?: string;
  testId?: string;
  onToggle: (checked: boolean) => void;
} = $props();

let stateLabel = $derived(checked ? onLabel : offLabel);
</script>

<button
  aria-checked={checked}
  aria-label={`Set ${stateLabel}`}
  class="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-left text-sm text-text-primary transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
  data-testid={testId}
  {disabled}
  {id}
  onclick={() => onToggle(!checked)}
  role="switch"
  type="button"
>
  <span class="min-w-0 truncate">{stateLabel}</span>
  <span
    aria-hidden="true"
    class={["relative h-5 w-9 shrink-0 rounded-full border transition-colors", checked ? "border-accent bg-accent" : "border-border bg-bg-primary"].join(" ")}
  >
    <span
      class={["absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-text-primary transition-transform", checked && "translate-x-4"].filter(Boolean).join(" ")}
    ></span>
  </span>
</button>
