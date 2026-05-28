<script lang="ts">
import { cn } from "../../lib/utils";

type Orientation = "horizontal" | "vertical";

type Props = {
  orientation?: Orientation;
  decorative?: boolean;
  class?: string;
  testId?: string;
};

const orientationClasses: Record<Orientation, string> = {
  horizontal: "h-px w-full",
  vertical: "h-full min-h-4 w-px",
};

let { orientation = "horizontal", decorative = true, class: className, testId }: Props = $props();
</script>

<div
  class={cn("shrink-0 bg-border", orientationClasses[orientation], className)}
  role={decorative ? "presentation" : "separator"}
  aria-hidden={decorative || undefined}
  aria-orientation={!decorative ? orientation : undefined}
  data-orientation={orientation}
  data-testid={testId}
></div>
