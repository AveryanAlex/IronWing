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
  <button class="fixed inset-0 z-40 border-none bg-[rgba(0,0,0,0.5)] p-0" aria-label="Close sheet" onclick={onClose} type="button"></button>
  <div
    class="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-auto rounded-t-[var(--radius-lg)] border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-[var(--space-4)] shadow-[0_-12px_30px_rgba(0,0,0,0.4)]"
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel ?? title ?? "Sheet"}
    data-testid={testId}
  >
    {#if title}<header class="mb-[var(--space-3)] font-semibold">{title}</header>{/if}
    <div>{@render body()}</div>
    {#if footer}<footer class="mt-[var(--space-3)] flex justify-end gap-[var(--space-2)]">{@render footer()}</footer>{/if}
  </div>
{/if}
