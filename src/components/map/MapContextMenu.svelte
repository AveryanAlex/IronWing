<script lang="ts">
import { Navigation } from "lucide-svelte";

type Props = {
  x: number;
  y: number;
  lat: number;
  lon: number;
  flyHereDisabled?: boolean;
  onFlyHere: (lat: number, lon: number) => void;
  onClose: () => void;
};

let {
  x,
  y,
  lat,
  lon,
  flyHereDisabled = false,
  onFlyHere,
  onClose,
}: Props = $props();

let menuElement = $state<HTMLDivElement | null>(null);

function handleOutsidePointer(event: MouseEvent | TouchEvent) {
  if (!menuElement || menuElement.contains(event.target as Node | null)) {
    return;
  }

  onClose();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    onClose();
  }
}

function preventNativeMenu(event: MouseEvent) {
  event.preventDefault();
}
</script>

<svelte:document
  onkeydown={handleKeydown}
  onmousedown={handleOutsidePointer}
  ontouchstart={handleOutsidePointer}
/>

<div
  bind:this={menuElement}
  class="map-context-menu"
  data-testid="overview-map-context-menu"
  oncontextmenu={preventNativeMenu}
  role="menu"
  tabindex="-1"
  style:left={`${Math.max(0, x)}px`}
  style:top={`${Math.max(0, y)}px`}
>
  <button
    class="map-context-menu__item"
    data-testid="overview-map-fly-here"
    disabled={flyHereDisabled}
    onclick={() => onFlyHere(lat, lon)}
    role="menuitem"
    type="button"
  >
    <Navigation aria-hidden="true" size={14} />
    <span>Fly here</span>
  </button>

  <div class="map-context-menu__coords">
    {lat.toFixed(6)}, {lon.toFixed(6)}
  </div>
</div>

<style>
  .map-context-menu {
    position: absolute;
    z-index: 50;
    min-width: 180px;
    max-width: calc(100% - 16px);
    overflow: hidden;
    border: 1px solid var(--color-border-light, var(--color-border));
    border-radius: var(--radius-lg, 0.5rem);
    background: var(--color-bg-secondary);
    padding: 4px;
    box-shadow: 0 18px 36px rgba(0, 0, 0, 0.32);
  }

  .map-context-menu__item {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: var(--radius-md, 0.375rem);
    background: transparent;
    color: var(--color-text-primary);
    cursor: pointer;
    font: inherit;
    font-size: 0.875rem;
    padding: 6px 10px;
    text-align: left;
  }

  .map-context-menu__item:hover:not(:disabled),
  .map-context-menu__item:focus-visible:not(:disabled) {
    background: var(--color-bg-tertiary);
    outline: none;
  }

  .map-context-menu__item:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .map-context-menu__coords {
    margin-top: 4px;
    border-top: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.625rem;
    padding: 4px 10px;
  }
</style>
