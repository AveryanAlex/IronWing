<script lang="ts">
import type { Snippet } from "svelte";
import { Dialog as Bits } from "bits-ui";
import type { DialogRootProps } from "bits-ui";

type Props = Omit<DialogRootProps, "open" | "onOpenChange" | "children"> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: Snippet;
};

let { open = $bindable(false), onOpenChange, children, ...rest }: Props = $props();

function handleOpenChange(nextOpen: boolean) {
  open = nextOpen;
  onOpenChange?.(nextOpen);
}
</script>

<Bits.Root {open} onOpenChange={handleOpenChange} {...rest}>
  {@render children?.()}
</Bits.Root>
