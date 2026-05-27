<script lang="ts">
import { Info } from "lucide-svelte";
import type { Snippet, SvelteComponent } from "svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Props = {
  icon?: IconComponent;
  children: Snippet;
};

let { icon: Icon = Info, children }: Props = $props();
</script>

<div class="flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2">
  <Icon size={14} class="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
  <div class="text-xs leading-relaxed text-text-secondary">{@render children()}</div>
</div>
