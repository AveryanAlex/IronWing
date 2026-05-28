<script lang="ts">
import type { Snippet } from "svelte";
import { Card } from "../../../components/ui";

type Variant = "default" | "primary" | "flat";
type CardSurface = "default" | "elevated" | "muted" | "transparent" | "primary" | "secondary" | "panel" | "input";
type CardTone = "neutral" | "info" | "success" | "warning" | "danger";
type CardAppearance = "solid" | "dashed";
type CardLayout = "stack" | "row" | "block";
type CardGap = "inherit" | "none" | "compact" | "default" | "comfortable";
type CardPadding = "inherit" | "none" | "compact" | "default" | "comfortable";
type CardJustify = "start" | "center";

type Props = {
  variant?: Variant;
  surface?: CardSurface;
  tone?: CardTone;
  appearance?: CardAppearance;
  layout?: CardLayout;
  gap?: CardGap;
  padding?: CardPadding;
  justify?: CardJustify;
  class?: string;
  testId?: string;
  dataStep?: string;
  children: Snippet;
};

const variantSurface: Record<Variant, "default" | "elevated" | "muted" | "transparent"> = {
  default: "default",
  primary: "elevated",
  flat: "muted",
};

let {
  variant = "default",
  surface,
  tone = "neutral",
  appearance = "solid",
  layout = "stack",
  gap = "inherit",
  padding = "inherit",
  justify = "start",
  class: className = "",
  testId,
  dataStep,
  children,
}: Props = $props();

</script>

<Card.Root surface={surface ?? variantSurface[variant]} {tone} {appearance} density="default" {layout} {gap} {padding} {justify} class={className} data-step={dataStep} {testId}>
  {@render children()}
</Card.Root>
