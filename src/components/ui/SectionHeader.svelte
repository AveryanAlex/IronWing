<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  testId?: string;
  actions?: Snippet;
};

let { eyebrow, title, description, testId, actions }: Props = $props();
</script>

<header class="ui-section-header" data-testid={testId}>
  <div class="ui-section-header__copy">
    {#if eyebrow}<p class="ui-section-header__eyebrow">{eyebrow}</p>{/if}
    <h2 class="ui-section-header__title">{title}</h2>
    {#if description}<p class="ui-section-header__description">{description}</p>{/if}
  </div>
  {#if actions}<div class="ui-section-header__actions">{@render actions()}</div>{/if}
</header>

<style>
.ui-section-header { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-start; justify-content: space-between; }
.ui-section-header__copy { min-width: 0; }
.ui-section-header__eyebrow { margin: 0; color: var(--color-text-muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
.ui-section-header__title { margin: 6px 0 0; font-size: 1.05rem; font-weight: 650; color: var(--color-text-primary); }
.ui-section-header__description { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 0.92rem; line-height: 1.5; }
.ui-section-header__actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
</style>
