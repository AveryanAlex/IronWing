<script lang="ts">
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
  body: Snippet;
  footer?: Snippet;
};

let { open = $bindable(), title, description, ariaLabel, onClose, testId, body, footer }: Props = $props();

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
    <BitsDialog.Overlay class="fixed inset-0 z-40 bg-[rgba(5,9,14,0.72)]" aria-label="Close dialog" />
    <BitsDialog.Content
      class="fixed z-50 flex flex-col border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-[0_28px_90px_rgba(0,0,0,0.4)] data-[surface-kind=dialog]:inset-[50%_auto_auto_50%] data-[surface-kind=dialog]:max-h-[80vh] data-[surface-kind=dialog]:w-[min(92vw,720px)] data-[surface-kind=dialog]:-translate-x-1/2 data-[surface-kind=dialog]:-translate-y-1/2 data-[surface-kind=dialog]:rounded-[var(--radius-xl)] data-[surface-kind=sheet]:inset-[auto_0_0] data-[surface-kind=sheet]:max-h-[85dvh] data-[surface-kind=sheet]:w-full data-[surface-kind=sheet]:rounded-t-[var(--radius-lg)]"
      data-surface-kind={surfaceKind}
      data-testid={testId}
      aria-label={ariaLabel ?? title}
    >
      {#if title || description}
        <header class="relative flex flex-col gap-1 border-b [border-bottom-color:color-mix(in_srgb,var(--color-border)_80%,transparent)] p-[var(--space-4)]">
          {#if title}<BitsDialog.Title class="m-0 text-[1.05rem] font-[650]">{title}</BitsDialog.Title>{/if}
          {#if description}<BitsDialog.Description class="m-0 text-[0.92rem] text-[var(--color-text-secondary)]">{description}</BitsDialog.Description>{/if}
          <BitsDialog.Close
            class="absolute right-[var(--space-3)] top-[var(--space-3)] h-7 w-7 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border-light)] bg-transparent text-[var(--color-text-primary)]"
            aria-label="Close"
          >×</BitsDialog.Close>
        </header>
      {/if}
      <div class="overflow-auto p-[var(--space-4)]">{@render body()}</div>
      {#if footer}
        <footer class="flex justify-end gap-[var(--space-2)] border-t [border-top-color:color-mix(in_srgb,var(--color-border)_80%,transparent)] px-[var(--space-4)] py-[var(--space-3)]">
          {@render footer()}
        </footer>
      {/if}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>
