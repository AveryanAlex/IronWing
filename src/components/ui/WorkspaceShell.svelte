<script lang="ts">
import type { Snippet } from "svelte";

type Mode = "edge-to-edge" | "inset" | "split";

type Props = {
  mode?: Mode;
  testId?: string;
  children: Snippet;
};

let { mode = "inset", testId, children }: Props = $props();
</script>

<section class="ui-workspace" data-mode={mode} data-testid={testId}>
  {@render children()}
</section>

<style>
.ui-workspace { display: flex; flex-direction: column; min-height: 0; flex: 1; overflow: hidden; color: var(--color-text-primary); }
.ui-workspace[data-mode="inset"]        { padding: var(--workspace-gutter-inset); gap: var(--space-3); overflow: auto; }
.ui-workspace[data-mode="split"]        { padding: 0; gap: 0; }
.ui-workspace[data-mode="edge-to-edge"] { padding: 0; gap: 0; }
</style>
