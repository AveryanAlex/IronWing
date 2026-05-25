<script lang="ts">
import { Info } from "lucide-svelte";
import type { Snippet, SvelteComponent } from "svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Props = {
  icon?: IconComponent;
  class?: string;
  children: Snippet;
};

let { icon: Icon = Info, class: className = "", children }: Props = $props();

let hintClass = $derived([
  "flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2",
  className,
].filter(Boolean).join(" "));
</script>

<div class={hintClass}>
  <Icon size={14} class="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
  <div class="text-xs leading-relaxed text-text-secondary">{@render children()}</div>
</div>
