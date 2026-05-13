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

function toggle(event?: MouseEvent) {
  event?.stopPropagation();
  open = !open;
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
</script>

<svelte:document onclick={handleDocumentClick} onkeydown={handleDocumentKeydown} />

<span bind:this={container} class="relative inline-flex">
  <button
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={label}
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
      class={`absolute top-full z-20 mt-2 w-72 rounded-lg border border-border bg-bg-primary p-3 text-left shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
      data-testid={panelTestId}
      role="dialog"
    >
      {#if title}
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {/if}
      <p class={`text-xs leading-5 text-text-secondary ${title ? "mt-2" : ""}`} data-testid={contentTestId}>{description}</p>
    </div>
  {/if}
</span>
