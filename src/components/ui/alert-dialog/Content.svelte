<script lang="ts">
import type { Snippet } from "svelte";
import { AlertDialog as Bits } from "bits-ui";
import type { AlertDialogContentProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

type Props = Omit<AlertDialogContentProps, "children"> & {
  class?: string;
  overlayClass?: string;
  size?: Size;
  children?: Snippet;
};

const sizeClasses: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

let { class: className, overlayClass, size = "md", children, ...rest }: Props = $props();
</script>

<Bits.Portal>
  <Bits.Overlay class={cn("fixed inset-0 z-50 bg-black/70", overlayClass)} />
  <Bits.Content
    class={cn(
      "fixed left-1/2 top-1/2 z-[60] grid max-h-[85dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-xl border border-border bg-bg-secondary p-5 text-text-primary shadow-2xl shadow-black/40 focus-visible:outline-none sm:w-full",
      sizeClasses[size],
      className,
    )}
    {...rest}
  >
    {@render children?.()}
  </Bits.Content>
</Bits.Portal>
