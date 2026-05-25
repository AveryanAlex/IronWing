<script lang="ts">
import type { Snippet, SvelteComponent } from "svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Props = {
  icon?: IconComponent;
  title: string;
  class?: string;
  actions?: Snippet;
};

let { icon: Icon, title, class: className = "", actions }: Props = $props();

let headerClass = $derived([
  "mb-4 flex items-center justify-between gap-3",
  className,
].filter(Boolean).join(" "));
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
