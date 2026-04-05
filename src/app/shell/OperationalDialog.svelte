<script lang="ts">
import type { Snippet } from "svelte";
import { fromStore } from "svelte/store";

import { getShellChromeStoreContext } from "./runtime-context";

type Props = {
  open?: boolean;
  title?: string;
  description?: string;
  ariaLabel?: string;
  onClose?: () => void;
  testId?: string;
  backdropTestId?: string;
  surfaceTestId?: string;
  closeTestId?: string;
  body: Snippet;
  footer?: Snippet;
};

const chrome = fromStore(getShellChromeStoreContext());

let {
  open = false,
  title = "Operational control",
  description = "",
  ariaLabel = title,
  onClose = () => {},
  testId,
  backdropTestId,
  surfaceTestId,
  closeTestId,
  body,
  footer,
}: Props = $props();

let surfaceKind = $derived(chrome.current.tier === "phone" ? "sheet" : "dialog");
let surfaceClass = $derived(
  surfaceKind === "sheet" ? "max-h-[85vh] max-w-none rounded-[28px]" : "mx-auto max-h-[80vh] max-w-3xl rounded-[30px]",
);
let bodyClass = $derived(surfaceKind === "sheet" ? "max-h-[calc(85vh-10rem)]" : "max-h-[calc(80vh-10rem)]");

function handleKeydown(event: KeyboardEvent) {
  if (open && event.key === "Escape") {
    onClose();
  }
}
</script>

<svelte:document onkeydown={handleKeydown} />

{#if open}
  <button
    aria-label="Close dialog"
    class="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
    data-testid={backdropTestId}
    onclick={onClose}
    type="button"
  ></button>

  <div
    class={`pointer-events-none fixed inset-0 z-50 flex px-3 py-4 sm:px-6 ${surfaceKind === "sheet" ? "items-end" : "items-center justify-center"}`}
  >
    <div
      aria-label={ariaLabel}
      aria-modal="true"
      class={`pointer-events-auto w-full overflow-hidden border border-border bg-bg-secondary shadow-[0_28px_90px_rgba(0,0,0,0.4)] ${surfaceClass}`}
      data-surface-kind={surfaceKind}
      data-testid={testId}
      role="dialog"
    >
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 px-4 py-4 sm:px-6">
        <div>
          <p class="runtime-eyebrow">Operational controls</p>
          <h2 class="mt-1 text-lg font-semibold tracking-[-0.03em] text-text-primary">{title}</h2>
          {#if description}
            <p class="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
          {/if}
        </div>

        <button
          class="rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent/40 hover:text-accent"
          data-testid={closeTestId}
          onclick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <div class={`${bodyClass} overflow-y-auto px-4 py-4 sm:px-6`} data-testid={surfaceTestId}>
        {@render body()}
      </div>

      {#if footer}
        <div class="flex flex-wrap items-center justify-end gap-3 border-t border-border/80 px-4 py-4 sm:px-6">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
