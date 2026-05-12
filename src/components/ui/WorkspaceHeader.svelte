<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  testId?: string;
  status?: Snippet;
  actions?: Snippet;
};

let { title, eyebrow, description, testId, status, actions }: Props = $props();
</script>

<header class="ui-workspace-header" data-testid={testId}>
  <div class="ui-workspace-header__copy">
    {#if eyebrow}<p class="ui-workspace-header__eyebrow">{eyebrow}</p>{/if}
    <h1 class="ui-workspace-header__title">{title}</h1>
    {#if description}<p class="ui-workspace-header__description">{description}</p>{/if}
    {#if status}<div class="ui-workspace-header__status">{@render status()}</div>{/if}
  </div>
  {#if actions}<div class="ui-workspace-header__actions">{@render actions()}</div>{/if}
</header>

<style>
.ui-workspace-header { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-start; justify-content: space-between; }
.ui-workspace-header__copy { min-width: 0; }
.ui-workspace-header__eyebrow { margin: 0; color: var(--color-text-muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
.ui-workspace-header__title { margin: 6px 0 0; font-size: 1.25rem; font-weight: 650; }
.ui-workspace-header__description { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 0.94rem; line-height: 1.5; max-width: 60ch; }
.ui-workspace-header__status { margin-top: 8px; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.ui-workspace-header__actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
</style>
