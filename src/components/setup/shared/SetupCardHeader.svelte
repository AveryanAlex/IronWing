<script lang="ts">
import type { Snippet, SvelteComponent } from "svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Props = {
  icon?: IconComponent;
  title: string;
  compact?: boolean;
  actions?: Snippet;
};

let { icon: Icon, title, compact = false, actions }: Props = $props();

let headerClass = $derived([
  compact ? "mb-2.5" : "mb-4",
  "flex items-center justify-between gap-3",
].join(" "));
</script>

<div class={headerClass}>
  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
    {#if Icon}
      <Icon size={14} class="text-accent" aria-hidden="true" />
    {/if}
    <span>{title}</span>
  </div>
  {#if actions}
    <div class="shrink-0">{@render actions()}</div>
  {/if}
</div>
