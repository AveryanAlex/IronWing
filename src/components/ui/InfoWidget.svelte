<script lang="ts">
type Props = {
  label?: string;
  description: string;
  title?: string;
  testId?: string;
  panelTestId?: string;
  contentTestId?: string;
  align?: "left" | "right";
};

let {
  label = "More information",
  description,
  title = undefined,
  testId = undefined,
  panelTestId = undefined,
  contentTestId = undefined,
  align = "left",
}: Props = $props();

let open = $state(false);
let container = $state<HTMLSpanElement | null>(null);
let trigger = $state<HTMLButtonElement | null>(null);
let panelTop = $state(0);
let panelLeft = $state(0);
let panelWidth = $state(288);

let panelStyle = $derived(`top: ${panelTop}px; left: ${panelLeft}px; width: ${panelWidth}px;`);

function updatePanelPosition() {
  if (!trigger) {
    return;
  }

  const margin = 16;
  const gap = 8;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(288, Math.max(160, window.innerWidth - margin * 2));
  const preferredLeft = align === "right" ? rect.right - width : rect.left;
  const maxLeft = Math.max(margin, window.innerWidth - margin - width);

  panelTop = rect.bottom + gap;
  panelLeft = Math.min(Math.max(preferredLeft, margin), maxLeft);
  panelWidth = width;
}

function toggle(event?: MouseEvent) {
  event?.stopPropagation();
  if (open) {
    close();
    return;
  }

  updatePanelPosition();
  open = true;
}

function close() {
  open = false;
}

function handleDocumentClick(event: MouseEvent) {
  if (!open) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    close();
    return;
  }

  if (!container?.contains(target)) {
    close();
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    close();
  }
}

function handleViewportChange() {
  if (open) {
    updatePanelPosition();
  }
}
</script>

<svelte:document onclick={handleDocumentClick} onkeydown={handleDocumentKeydown} />
<svelte:window onresize={handleViewportChange} onscroll={handleViewportChange} />

<span bind:this={container} class="relative inline-flex">
  <button
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={label}
    bind:this={trigger}
    class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg-secondary text-xs font-semibold text-text-muted transition hover:border-accent hover:text-accent"
    data-testid={testId}
    onclick={toggle}
    title={label}
    type="button"
  >
    i
  </button>

  {#if open}
    <div
      class="fixed z-[70] max-h-[calc(100vh-2rem)] overflow-auto rounded-lg border border-border bg-bg-primary p-3 text-left shadow-2xl"
      data-testid={panelTestId}
      role="dialog"
      style={panelStyle}
    >
      {#if title}
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {/if}
      <p class={`text-xs leading-5 text-text-secondary ${title ? "mt-2" : ""}`} data-testid={contentTestId}>{description}</p>
    </div>
  {/if}
</span>
