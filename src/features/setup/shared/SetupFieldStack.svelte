<script lang="ts">
import type { Snippet } from "svelte";

type Gap = "compact" | "default" | "comfortable";

type Props = {
  gap?: Gap;
  divided?: boolean;
  class?: string;
  children: Snippet;
};

const gapClasses: Record<Gap, string> = {
  compact: "gap-2.5",
  default: "gap-3",
  comfortable: "gap-4",
};

let { gap = "default", divided = false, class: className = "", children }: Props = $props();
</script>

<div class={`flex flex-col ${gapClasses[gap]} ${divided ? "divide-y divide-border/70" : ""} ${className}`}>
  {@render children()}
</div>
