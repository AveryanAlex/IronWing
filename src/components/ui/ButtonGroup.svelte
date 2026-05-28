<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type Orientation = "horizontal" | "vertical";
type GroupRole = "group" | "toolbar";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "class" | "children" | "role"> & {
  orientation?: Orientation;
  attached?: boolean;
  role?: GroupRole;
  testId?: string;
  class?: string;
  children?: Snippet;
};

const orientationClasses: Record<Orientation, string> = {
  horizontal: "flex-row",
  vertical: "flex-col",
};

const attachedClasses: Record<Orientation, string> = {
  horizontal: "[&>*:not(:first-child)]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none",
  vertical: "[&>*:not(:first-child)]:-mt-px [&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none",
};

let {
  orientation = "horizontal",
  attached = false,
  role = "group",
  testId,
  class: className,
  children,
  ...restProps
}: Props = $props();

let groupClass = $derived(
  cn("inline-flex items-stretch", orientationClasses[orientation], attached ? attachedClasses[orientation] : "gap-2", className),
);
</script>

<div
  {...restProps}
  class={groupClass}
  data-attached={attached || undefined}
  data-orientation={orientation}
  data-testid={testId}
  {role}
>
  {@render children?.()}
</div>
