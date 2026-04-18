<script lang="ts">
  import { untrack } from "svelte";
  import type { Snippet } from "svelte";

  type Props = {
    direction?: "horizontal" | "vertical";
    initialRatio?: number;
    minRatio?: number;
    maxRatio?: number;
    first: Snippet;
    second: Snippet;
  };

  let {
    direction = "horizontal",
    initialRatio = 0.7,
    minRatio = 0.2,
    maxRatio = 0.8,
    first,
    second,
  }: Props = $props();

  // untrack ensures we only read initialRatio once at construction time.
  // The divider position is then independently owned by this component.
  let ratio = $state(untrack(() => initialRatio));
  let dragging = $state(false);
  let containerEl: HTMLDivElement | undefined = $state();

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const pos =
      direction === "horizontal"
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;
    ratio = Math.min(maxRatio, Math.max(minRatio, pos));
  }

  function onPointerUp() {
    dragging = false;
  }

  let firstStyle = $derived(
    direction === "horizontal" ? `width: ${ratio * 100}%` : `height: ${ratio * 100}%`,
  );
  let secondStyle = $derived(
    direction === "horizontal"
      ? `width: ${(1 - ratio) * 100}%`
      : `height: ${(1 - ratio) * 100}%`,
  );

  let ariaValueNow = $derived(Math.round(ratio * 100));
</script>

<div
  bind:this={containerEl}
  class="split-pane"
  class:split-pane--horizontal={direction === "horizontal"}
  class:split-pane--vertical={direction === "vertical"}
  class:split-pane--dragging={dragging}
>
  <div class="split-pane__panel" style={firstStyle}>
    {@render first()}
  </div>
  <!--
    ARIA: role="separator" with aria-valuenow is defined as a widget role in
    the ARIA 1.2 spec (focusable, interactive separator). Svelte's static linter
    incorrectly classifies separator as always-non-interactive, hence the
    svelte-ignore below.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="split-pane__divider"
    role="separator"
    tabindex="0"
    aria-label="Resize panes"
    aria-valuenow={ariaValueNow}
    aria-valuemin={Math.round(minRatio * 100)}
    aria-valuemax={Math.round(maxRatio * 100)}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onlostpointercapture={onPointerUp}
  ></div>
  <div class="split-pane__panel" style={secondStyle}>
    {@render second()}
  </div>
</div>

<style>
  .split-pane {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .split-pane--horizontal {
    flex-direction: row;
  }
  .split-pane--vertical {
    flex-direction: column;
  }
  .split-pane__panel {
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
  .split-pane__divider {
    flex-shrink: 0;
    background: var(--color-border);
    border: none;
    padding: 0;
    transition: background 0.15s;
  }
  .split-pane--horizontal > .split-pane__divider {
    width: 4px;
    cursor: col-resize;
  }
  .split-pane--vertical > .split-pane__divider {
    height: 4px;
    cursor: row-resize;
  }
  .split-pane__divider:hover,
  .split-pane--dragging > .split-pane__divider {
    background: var(--color-accent);
  }
</style>
