<script lang="ts">
import type { Snippet } from "svelte";

type Props = { title: string; description?: string; testId?: string; actions?: Snippet };

let { title, description, testId, actions }: Props = $props();
</script>

<div class="ui-empty" data-testid={testId}>
  <p class="ui-empty__title">{title}</p>
  {#if description}<p class="ui-empty__description">{description}</p>{/if}
  {#if actions}<div class="ui-empty__actions">{@render actions()}</div>{/if}
</div>

<style>
.ui-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-3); padding: var(--space-6); text-align: center; border: 1px dashed var(--color-border-light); border-radius: var(--radius-lg); color: var(--color-text-secondary); }
.ui-empty__title { margin: 0; color: var(--color-text-primary); font-weight: 600; }
.ui-empty__description { margin: 0; font-size: 0.92rem; line-height: 1.5; }
.ui-empty__actions { display: flex; gap: var(--space-2); }
</style>
