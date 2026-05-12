<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = { tone?: Tone; testId?: string; children: Snippet };

let { tone = "neutral", testId, children }: Props = $props();
</script>

<span class="ui-badge" data-tone={tone} data-testid={testId}>{@render children()}</span>

<style>
.ui-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  padding: 0 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
.ui-badge[data-tone="info"]    { color: var(--color-accent);  border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);  background: color-mix(in srgb, var(--color-accent) 12%, transparent); }
.ui-badge[data-tone="success"] { color: var(--color-success); border-color: color-mix(in srgb, var(--color-success) 40%, transparent); background: color-mix(in srgb, var(--color-success) 12%, transparent); }
.ui-badge[data-tone="warning"] { color: var(--color-warning); border-color: color-mix(in srgb, var(--color-warning) 40%, transparent); background: color-mix(in srgb, var(--color-warning) 12%, transparent); }
.ui-badge[data-tone="danger"]  { color: var(--color-danger);  border-color: color-mix(in srgb, var(--color-danger) 40%, transparent);  background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
</style>
