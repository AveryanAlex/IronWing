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
    <BitsDialog.Overlay class="ui-dialog__overlay" aria-label="Close dialog" />
    <BitsDialog.Content
      class="ui-dialog__content"
      data-surface-kind={surfaceKind}
      data-testid={testId}
      aria-label={ariaLabel ?? title}
    >
      {#if title || description}
        <header class="ui-dialog__header">
          {#if title}<BitsDialog.Title class="ui-dialog__title">{title}</BitsDialog.Title>{/if}
          {#if description}<BitsDialog.Description class="ui-dialog__description">{description}</BitsDialog.Description>{/if}
          <BitsDialog.Close class="ui-dialog__close" aria-label="Close">×</BitsDialog.Close>
        </header>
      {/if}
      <div class="ui-dialog__body">{@render body()}</div>
      {#if footer}<footer class="ui-dialog__footer">{@render footer()}</footer>{/if}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>

<style>
:global(.ui-dialog__overlay) { position: fixed; inset: 0; z-index: 40; background: rgba(5, 9, 14, 0.72); }
:global(.ui-dialog__content) { position: fixed; z-index: 50; background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border); box-shadow: 0 28px 90px rgba(0,0,0,0.4); }
:global(.ui-dialog__content[data-surface-kind="dialog"]) { inset: 50% auto auto 50%; transform: translate(-50%, -50%); width: min(92vw, 720px); max-height: 80vh; border-radius: var(--radius-xl); display: flex; flex-direction: column; }
:global(.ui-dialog__content[data-surface-kind="sheet"]) { inset: auto 0 0; width: 100%; max-height: 85dvh; border-radius: var(--radius-lg) var(--radius-lg) 0 0; display: flex; flex-direction: column; }
:global(.ui-dialog__header) { display: flex; flex-direction: column; gap: 4px; padding: var(--space-4); border-bottom: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent); position: relative; }
:global(.ui-dialog__title) { font-size: 1.05rem; font-weight: 650; margin: 0; }
:global(.ui-dialog__description) { font-size: 0.92rem; color: var(--color-text-secondary); margin: 0; }
:global(.ui-dialog__close) { position: absolute; top: var(--space-3); right: var(--space-3); background: transparent; border: 1px solid var(--color-border-light); color: var(--color-text-primary); border-radius: var(--radius-sm); width: 28px; height: 28px; cursor: pointer; }
:global(.ui-dialog__body) { padding: var(--space-4); overflow: auto; }
:global(.ui-dialog__footer) { padding: var(--space-3) var(--space-4); border-top: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent); display: flex; justify-content: flex-end; gap: var(--space-2); }
</style>
