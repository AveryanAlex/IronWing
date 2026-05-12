<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "blocking";
type Density = "default" | "compact" | "comfortable";

type Props = {
  tone?: Tone;
  density?: Density;
  selected?: boolean;
  testId?: string;
  children?: Snippet;
};

let { tone = "neutral", density = "default", selected = false, testId, children }: Props = $props();
</script>

<div class="ui-card" data-tone={tone} data-density={density} data-selected={selected || undefined} data-testid={testId}>
  {@render children?.()}
</div>

<style>
.ui-card {
  border: 1px solid var(--color-border);
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  color: var(--color-text-primary);
}
.ui-card[data-density="compact"] { padding: var(--space-3); }
.ui-card[data-density="default"] { padding: var(--space-4); }
.ui-card[data-density="comfortable"] { padding: var(--space-5); }
.ui-card[data-tone="info"]     { border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border)); }
.ui-card[data-tone="success"]  { border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border)); }
.ui-card[data-tone="warning"]  { border-color: color-mix(in srgb, var(--color-warning) 35%, var(--color-border)); }
.ui-card[data-tone="danger"]   { border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border)); }
.ui-card[data-tone="blocking"] { border-color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, var(--surface-card)); }
.ui-card[data-selected] { box-shadow: 0 0 0 2px var(--color-accent); }
</style>
