<script lang="ts">
  type MenuItem = {
    label: string;
    action: () => void;
    destructive?: boolean;
  };

  type Props = {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
  };

  let { x, y, items, onClose }: Props = $props();

  function handleClick(item: MenuItem) {
    item.action();
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onclick={onClose} />

<div
  class="map-context-menu"
  style="left: {x}px; top: {y}px"
  role="menu"
  tabindex="0"
  onclick={(e) => e.stopPropagation()}
  onkeydown={handleKeydown}
>
  {#each items as item, i (item.label)}
    {#if i > 0 && item.destructive}
      <div class="map-context-menu__sep"></div>
    {/if}
    <button class="map-context-menu__item" class:map-context-menu__item--destructive={item.destructive} onclick={() => handleClick(item)} role="menuitem" type="button">{item.label}</button>
  {/each}
</div>

<style>
  .map-context-menu { position: absolute; z-index: 50; min-width: 180px; padding: 4px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .map-context-menu__item { display: block; width: 100%; padding: 6px 10px; text-align: left; font-size: 0.8rem; color: var(--color-text-primary); background: none; border: none; border-radius: 4px; cursor: pointer; }
  .map-context-menu__item:hover { background: var(--color-bg-tertiary); }
  .map-context-menu__item--destructive { color: var(--color-danger); }
  .map-context-menu__sep { height: 1px; margin: 4px 0; background: var(--color-border); }
</style>
