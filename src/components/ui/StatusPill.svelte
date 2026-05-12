<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = { tone?: Tone; testId?: string; children: Snippet };

let { tone = "neutral", testId, children }: Props = $props();
</script>

<span class="ui-pill" data-tone={tone} data-testid={testId}>{@render children()}</span>

<style>
.ui-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-bg-tertiary) 80%, transparent);
  color: var(--color-text-secondary);
}
.ui-pill[data-tone="info"]    { color: var(--color-accent);  background: color-mix(in srgb, var(--color-accent) 14%, transparent); }
.ui-pill[data-tone="success"] { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 14%, transparent); }
.ui-pill[data-tone="warning"] { color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 14%, transparent); }
.ui-pill[data-tone="danger"]  { color: var(--color-danger);  background: color-mix(in srgb, var(--color-danger) 14%, transparent); }
</style>
