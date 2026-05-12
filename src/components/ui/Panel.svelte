<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = {
  tone?: Tone;
  padded?: boolean;
  testId?: string;
  children?: Snippet;
};

let { tone = "neutral", padded = true, testId, children }: Props = $props();
</script>

<section class="ui-panel" data-tone={tone} data-padded={padded || undefined} data-testid={testId}>
  {@render children?.()}
</section>

<style>
.ui-panel {
  border: 1px solid var(--color-border);
  background: var(--surface-panel);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
}
.ui-panel[data-padded] { padding: var(--space-3); }
.ui-panel[data-tone="info"]    { border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border)); }
.ui-panel[data-tone="success"] { border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border)); }
.ui-panel[data-tone="warning"] { border-color: color-mix(in srgb, var(--color-warning) 35%, var(--color-border)); }
.ui-panel[data-tone="danger"]  { border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border)); }
</style>
