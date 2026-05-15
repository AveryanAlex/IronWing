<script lang="ts">
import { X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { Dialog as BitsDialog } from "bits-ui";
import { fromStore } from "svelte/store";
import { hasContext } from "svelte";
import { getShellChromeStoreContext } from "../../app/shell/runtime-context";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  ariaLabel?: string;
  onClose: () => void;
  testId?: string;
  closeTestId?: string;
  body: Snippet;
  footer?: Snippet;
};

let { open = $bindable(), title, description, ariaLabel, onClose, testId, closeTestId, body, footer }: Props = $props();

// Defensive context lookup: the shell chrome context may be absent in standalone
// component tests. Fall back to a desktop-default tier so the wrapper still renders.
let chromeStore: ReturnType<typeof getShellChromeStoreContext> | null = null;
try {
  chromeStore = getShellChromeStoreContext();
} catch {
  chromeStore = null;
}
const chrome = chromeStore ? fromStore(chromeStore) : null;
let surfaceKind = $derived(chrome?.current?.tier === "phone" ? "sheet" : "dialog");
</script>

<BitsDialog.Root bind:open onOpenChange={(value) => { if (!value) onClose(); }}>
  <BitsDialog.Portal>
    <BitsDialog.Overlay class="fixed inset-0 z-40 bg-black/70" aria-label="Close dialog" />
    <BitsDialog.Content
      class="fixed z-50 flex flex-col border border-border bg-bg-secondary text-text-primary shadow-2xl shadow-black/40 data-[surface-kind=dialog]:inset-[50%_auto_auto_50%] data-[surface-kind=dialog]:max-h-[80vh] data-[surface-kind=dialog]:w-[92vw] data-[surface-kind=dialog]:max-w-2xl data-[surface-kind=dialog]:-translate-x-1/2 data-[surface-kind=dialog]:-translate-y-1/2 data-[surface-kind=dialog]:rounded-xl data-[surface-kind=sheet]:inset-[auto_0_0] data-[surface-kind=sheet]:max-h-[85dvh] data-[surface-kind=sheet]:w-full data-[surface-kind=sheet]:rounded-t-xl"
      data-surface-kind={surfaceKind}
      data-testid={testId}
      aria-label={ariaLabel ?? title}
      preventScroll={false}
    >
      {#if title || description}
        <header class="relative flex flex-col gap-1 border-b border-border/80 p-4">
          {#if title}<BitsDialog.Title class="m-0 text-base font-semibold">{title}</BitsDialog.Title>{/if}
          {#if description}<BitsDialog.Description class="m-0 text-sm leading-5 text-text-secondary">{description}</BitsDialog.Description>{/if}
          <BitsDialog.Close
            class="absolute right-3 top-3 h-7 w-7 cursor-pointer rounded-md border border-border-light bg-transparent text-text-primary"
            data-testid={closeTestId}
            aria-label="Close"
          ><span class="inline-flex h-full w-full items-center justify-center"><X aria-hidden="true" size={14} /></span></BitsDialog.Close>
        </header>
      {/if}
      <div class="overflow-auto p-4">{@render body()}</div>
      {#if footer}
        <footer class="flex justify-end gap-2 border-t border-border/80 px-4 py-3">
          {@render footer()}
        </footer>
      {/if}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>
