<script lang="ts">
import type { Snippet } from "svelte";

type Mode = "edge-to-edge" | "inset" | "split";

type Props = {
  mode?: Mode;
  testId?: string;
  children: Snippet;
};

const modeClasses: Record<Mode, string> = {
  inset: "gap-3 overflow-auto p-[var(--workspace-gutter-inset)]",
  split: "gap-0 p-0",
  "edge-to-edge": "gap-0 p-0",
};

let { mode = "inset", testId, children }: Props = $props();

let shellClass = $derived(
  ["flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary", modeClasses[mode]].join(" "),
);
</script>

<section class={shellClass} data-mode={mode} data-testid={testId}>
  {@render children()}
</section>
