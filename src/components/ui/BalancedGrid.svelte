<script lang="ts">
import type { Snippet } from "svelte";

import { resolveBalancedGridColumnCount } from "../../lib/balanced-grid";

type Props = {
  minItemWidth?: string;
  minItemWidthPx?: number;
  gapPx?: number;
  itemCount?: number;
  class?: string;
  ariaLabel?: string;
  children: Snippet;
};

let {
  minItemWidth = "16rem",
  minItemWidthPx = 256,
  gapPx = 12,
  itemCount,
  class: className = "",
  ariaLabel,
  children,
}: Props = $props();

let gridWidth = $state(0);
let measuredItemCount = $state(0);
let resolvedItemCount = $derived(itemCount ?? measuredItemCount);
let columnCount = $derived(resolveBalancedGridColumnCount(resolvedItemCount, gridWidth, minItemWidthPx, gapPx));
let gridTemplateColumns = $derived(`repeat(${columnCount}, minmax(min(100%, ${minItemWidth}), 1fr))`);

function observeGridItems(gridElement: HTMLDivElement) {
  const updateItemCount = () => {
    measuredItemCount = gridElement.childElementCount;
  };

  updateItemCount();
  if (typeof MutationObserver === "undefined") {
    return;
  }

  const observer = new MutationObserver(updateItemCount);
  observer.observe(gridElement, { childList: true });

  return () => observer.disconnect();
}
</script>

<div
  bind:clientWidth={gridWidth}
  class={`grid min-w-0 ${className}`}
  style:grid-template-columns={gridTemplateColumns}
  aria-label={ariaLabel}
  {@attach observeGridItems}
>
  {@render children()}
</div>
