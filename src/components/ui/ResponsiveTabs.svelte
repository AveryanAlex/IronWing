<script lang="ts">
import { tick } from "svelte";
import type { Snippet } from "svelte";

type Tab = {
  key: string;
  label: string;
  badge?: string;
  testId?: string;
  badgeTestId?: string;
  icon?: Snippet;
};

type Props = {
  tabs: ReadonlyArray<Tab>;
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
  testId?: string;
};

let { tabs, active, onSelect, ariaLabel, testId }: Props = $props();

type Density = "labels" | "compact" | "icons" | "scroll";

let containerElement: HTMLDivElement | undefined = $state();
let trackElement: HTMLDivElement | undefined = $state();
let density = $state<Density>("labels");
let measurePending = false;
let measureVersion = 0;

function hasOverflow(): boolean {
  if (!containerElement || !trackElement) {
    return false;
  }

  return trackElement.scrollWidth > containerElement.clientWidth + 1;
}

async function updateDensity() {
  const version = ++measureVersion;

  density = "labels";
  await tick();
  if (version !== measureVersion || !hasOverflow()) {
    return;
  }

  density = "compact";
  await tick();
  if (version !== measureVersion || !hasOverflow()) {
    return;
  }

  density = "icons";
  await tick();
  if (version !== measureVersion || !hasOverflow()) {
    return;
  }

  density = "scroll";
}

function scheduleMeasure() {
  if (measurePending) {
    return;
  }

  measurePending = true;
  queueMicrotask(() => {
    measurePending = false;
    void updateDensity();
  });
}

let trackClass = $derived([
  "flex min-w-0 justify-end gap-[clamp(3px,0.65cqi,10px)] overflow-x-hidden [scrollbar-width:thin]",
  density === "compact" ? "gap-[3px]" : "",
  density === "icons" ? "justify-around gap-[clamp(4px,1cqi,10px)]" : "",
  density === "scroll" ? "justify-start gap-[3px] overflow-x-auto" : "",
].filter(Boolean).join(" "));

function tabClass(): string {
  return [
    "inline-flex min-w-0 flex-[0_1_auto] cursor-pointer items-center justify-center gap-[clamp(3px,0.45cqi,6px)] whitespace-nowrap rounded-[var(--radius-sm)] border border-transparent bg-transparent px-[clamp(0.38rem,0.8cqi,0.72rem)] py-[0.4rem] font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:text-[var(--color-text-primary)] data-[active]:border-[var(--color-border-light)] data-[active]:bg-[var(--color-bg-primary)] data-[active]:text-[var(--color-text-primary)]",
    density === "compact" ? "gap-[3px] px-[0.34rem]" : "",
    density === "icons" ? "max-w-14 flex-[1_1_42px] px-[0.42rem]" : "",
    density === "scroll" ? "max-w-none flex-[0_0_40px] px-[0.34rem]" : "",
  ].filter(Boolean).join(" ");
}

function labelClass(hasIcon: boolean): string {
  return [
    "min-w-0 overflow-hidden text-ellipsis",
    hasIcon && (density === "icons" || density === "scroll") ? "hidden" : "",
  ].filter(Boolean).join(" ");
}

$effect(() => {
  tabs;
  scheduleMeasure();
});

$effect(() => {
  if (!containerElement || !trackElement) {
    return;
  }

  const ResizeObserverCtor = globalThis.ResizeObserver;
  if (!ResizeObserverCtor) {
    scheduleMeasure();
    return;
  }

  const observer = new ResizeObserverCtor(scheduleMeasure);
  observer.observe(containerElement);
  observer.observe(trackElement);
  scheduleMeasure();

  return () => {
    measureVersion += 1;
    observer.disconnect();
  };
});
</script>

<div bind:this={containerElement} class="@container min-w-0 w-full overflow-hidden" aria-label={ariaLabel} data-density={density} data-testid={testId} role="group">
  <div bind:this={trackElement} class={trackClass}>
    {#each tabs as tab (tab.key)}
      <button
        aria-label={tab.label}
        aria-pressed={tab.key === active}
        class={tabClass()}
        data-active={tab.key === active || undefined}
        data-has-icon={tab.icon ? true : undefined}
        data-testid={tab.testId}
        onclick={() => onSelect(tab.key)}
        type="button"
      >
        {#if tab.icon}
          <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">{@render tab.icon()}</span>
        {/if}
        <span class={labelClass(Boolean(tab.icon))}>{tab.label}</span>
        {#if tab.badge}<span class="shrink-0 rounded-full bg-[var(--color-bg-tertiary)] px-[0.36rem] py-[0.16rem] text-[0.7rem] font-bold text-[var(--color-text-secondary)]" data-testid={tab.badgeTestId}>{tab.badge}</span>{/if}
      </button>
    {/each}
  </div>
</div>
