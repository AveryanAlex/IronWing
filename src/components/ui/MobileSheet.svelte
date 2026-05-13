<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  open: boolean;
  title?: string;
  ariaLabel?: string;
  onClose: () => void;
  testId?: string;
  body: Snippet;
  footer?: Snippet;
};

let { open, title, ariaLabel, onClose, testId, body, footer }: Props = $props();
</script>

{#if open}
  <button class="fixed inset-0 z-40 border-none bg-black/60 p-0" aria-label="Close sheet" onclick={onClose} type="button"></button>
  <div
    class="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-auto rounded-t-xl border-t border-border bg-bg-secondary p-4 shadow-2xl shadow-black/40"
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel ?? title ?? "Sheet"}
    data-testid={testId}
  >
    {#if title}<header class="mb-3 text-base font-semibold text-text-primary">{title}</header>{/if}
    <div>{@render body()}</div>
    {#if footer}<footer class="mt-3 flex justify-end gap-2">{@render footer()}</footer>{/if}
  </div>
{/if}
