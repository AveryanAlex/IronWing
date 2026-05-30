<script lang="ts">
import type { Snippet } from "svelte";

import { BalancedGrid } from "../../../components/ui";

type Density = "compact" | "default" | "comfortable";

type Props = {
  minWidth?: string;
  density?: Density;
  class?: string;
  ariaLabel?: string;
  children: Snippet;
};

const gapClasses: Record<Density, string> = {
  compact: "gap-2",
  default: "gap-3",
  comfortable: "gap-4",
};

const gapPixels: Record<Density, number> = {
  compact: 8,
  default: 12,
  comfortable: 16,
};

let {
  minWidth = "16rem",
  density = "default",
  class: className = "",
  ariaLabel,
  children,
}: Props = $props();

let minWidthPx = $derived(resolveMinWidthPx(minWidth));

function resolveMinWidthPx(value: string): number {
  const parsedValue = Number.parseFloat(value);
  if (!Number.isFinite(parsedValue)) {
    return 256;
  }

  return value.endsWith("rem") ? parsedValue * 16 : parsedValue;
}
</script>

<BalancedGrid
  minItemWidth={minWidth}
  minItemWidthPx={minWidthPx}
  gapPx={gapPixels[density]}
  class={`${gapClasses[density]} ${className}`}
  {ariaLabel}
>
  {@render children()}
</BalancedGrid>
