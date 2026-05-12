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
  <button class="ui-sheet__backdrop" aria-label="Close sheet" onclick={onClose} type="button"></button>
  <div class="ui-sheet" role="dialog" aria-modal="true" aria-label={ariaLabel ?? title ?? "Sheet"} data-testid={testId}>
    {#if title}<header class="ui-sheet__header">{title}</header>{/if}
    <div class="ui-sheet__body">{@render body()}</div>
    {#if footer}<footer class="ui-sheet__footer">{@render footer()}</footer>{/if}
  </div>
{/if}

<style>
.ui-sheet__backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.5); border: none; padding: 0; }
.ui-sheet { position: fixed; inset: auto 0 0; z-index: 50; max-height: 85dvh; overflow: auto; background: var(--color-bg-secondary); border-top: 1px solid var(--color-border); border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding: var(--space-4); box-shadow: 0 -12px 30px rgba(0,0,0,0.4); }
.ui-sheet__header { font-weight: 600; margin-bottom: var(--space-3); }
.ui-sheet__footer { margin-top: var(--space-3); display: flex; justify-content: flex-end; gap: var(--space-2); }
</style>
