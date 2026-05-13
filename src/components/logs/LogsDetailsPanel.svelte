<script lang="ts">
import type { LogLibraryEntry } from "../../logs";
import { Banner, Button, Panel, StatusPill } from "../ui";
import { formatCount, formatDuration, formatImportedAt, formatUsec } from "./logs-format";
import { diagnosticTone, entryStatusLabel, entryTone, sourceStatusLabel } from "./logs-workspace-display";

type PillTone = "neutral" | "info" | "success" | "warning" | "danger";

function mapTone(tone: "neutral" | "positive" | "caution" | "critical"): PillTone {
  switch (tone) {
    case "positive":
      return "success";
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

type Props = {
  selectedEntry: LogLibraryEntry | null;
  loadedEntryId: string | null;
  relinkPath: string;
  libraryPhase: "idle" | "loading" | "ready" | "failed";
  onRelinkPathChange: (path: string) => void;
  onRelink: () => void;
  onReindex: () => void;
  onRemove: () => void;
};

let {
  selectedEntry,
  loadedEntryId,
  relinkPath,
  libraryPhase,
  onRelinkPathChange,
  onRelink,
  onReindex,
  onRemove,
}: Props = $props();

const eyebrowClass = "m-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]";
const titleClass = "mt-1 m-0 text-[0.98rem] font-semibold text-[var(--color-text-primary)]";
const copyClass = "m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-secondary)]";
const factCardClass = "min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5";
const monoValueClass = "min-w-0 overflow-wrap-anywhere break-words font-mono text-[0.74rem]";
const inputClass = "w-full min-w-0 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg-input)] px-[0.7rem] py-[0.55rem] text-[0.8rem] text-[var(--color-text-primary)]";
</script>

<Panel testId="logs-details-panel">
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex flex-wrap items-start justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
      <div class="min-w-0">
        <p class={eyebrowClass}>Details</p>
        <h3 class={titleClass}>Selection facts and maintenance actions</h3>
        <p class={copyClass}>Selection stays separate from the currently loaded replay entry so live restore does not erase library focus.</p>
      </div>

      {#if selectedEntry}
        <StatusPill tone={mapTone(entryTone(selectedEntry))} testId="logs-selected-status-pill">
          {entryStatusLabel(selectedEntry)}
        </StatusPill>
      {/if}
    </div>

    {#if !selectedEntry}
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5" data-testid="logs-selection-empty">
        <p class="m-0 text-[0.9rem] font-semibold text-[var(--color-text-primary)]">Select a log to inspect it.</p>
        <p class="mt-1 m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-secondary)]">The details panel will show truthful source, index, diagnostics, replay, and maintenance state for the chosen catalog entry.</p>
      </div>
    {:else}
      <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <div class={factCardClass}>
          <span class={eyebrowClass}>Source path</span>
          <span class={`m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)] ${monoValueClass}`}>{selectedEntry.source.original_path}</span>
        </div>
        <div class={factCardClass}>
          <span class={eyebrowClass}>Imported</span>
          <span class="m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)]">{formatImportedAt(selectedEntry.imported_at_unix_msec)}</span>
        </div>
        <div class={factCardClass}>
          <span class={eyebrowClass}>Messages</span>
          <span class="m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)]">{formatCount(selectedEntry.metadata.total_messages)}</span>
        </div>
        <div class={factCardClass}>
          <span class={eyebrowClass}>Duration</span>
          <span class="m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)]">{formatDuration(selectedEntry.metadata.duration_secs)}</span>
        </div>
        <div class={factCardClass}>
          <span class={eyebrowClass}>Indexed range</span>
          <span class="m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)]">{formatUsec(selectedEntry.metadata.start_usec)} → {formatUsec(selectedEntry.metadata.end_usec, selectedEntry.metadata.start_usec)}</span>
        </div>
        <div class={factCardClass}>
          <span class={eyebrowClass}>Index file</span>
          <span class={`m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)] ${monoValueClass}`}>{selectedEntry.index?.relative_path ?? "not built"}</span>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <StatusPill tone={mapTone(entryTone(selectedEntry))}>{entryStatusLabel(selectedEntry)}</StatusPill>
        <StatusPill tone={selectedEntry.source.status.kind === "available" ? "neutral" : "warning"}>
          {sourceStatusLabel(selectedEntry)}
        </StatusPill>
        <StatusPill tone={loadedEntryId === selectedEntry.entry_id ? "success" : "neutral"}>
          {loadedEntryId === selectedEntry.entry_id ? "loaded for replay" : "not loaded"}
        </StatusPill>
      </div>

      {#if selectedEntry.status === "missing"}
        <Banner
          severity="danger"
          title="The referenced file is missing. Relink it or remove it from the library without losing the stored diagnostics."
          testId="logs-selected-message"
        />
      {:else if selectedEntry.status === "stale"}
        <Banner
          severity="warning"
          title="The file changed after import. Reindex it before trusting replay or derived analysis ranges."
          testId="logs-selected-message"
        />
      {:else if selectedEntry.status === "corrupt"}
        <Banner
          severity="danger"
          title="This log is corrupt. Diagnostics remain available, but replay stays blocked until a healthy source is linked."
          testId="logs-selected-message"
        />
      {:else if selectedEntry.status === "indexing"}
        <Banner
          severity="warning"
          title="Indexing is still running. Wait for the backend to finish before driving replay from this entry."
          testId="logs-selected-message"
        />
      {/if}

      <label class="flex flex-col gap-1.5">
        <span class={eyebrowClass}>Relink path</span>
        <input
          class={inputClass}
          data-testid="logs-relink-path-input"
          oninput={(event) => onRelinkPathChange((event.currentTarget as HTMLInputElement).value)}
          placeholder="/data/logs/relinked-flight.tlog"
          type="text"
          value={relinkPath}
        />
      </label>

      <div class="flex flex-wrap gap-2">
        <Button
          tone="accent"
          testId="logs-relink-button"
          disabled={relinkPath.trim().length === 0 || libraryPhase === "loading"}
          onclick={onRelink}
        >
          Relink
        </Button>
        <Button testId="logs-reindex-button" onclick={onReindex}>Reindex</Button>
        <Button tone="danger" testId="logs-remove-button" onclick={onRemove}>Remove</Button>
      </div>

      <div>
        <p class={eyebrowClass}>Diagnostics</p>
        {#if selectedEntry.diagnostics.length === 0}
          <p class={copyClass}>No catalog, parse, or index diagnostics are currently attached to this entry.</p>
        {:else}
          <ul class="m-0 flex flex-col gap-2 p-0 list-none">
            {#each selectedEntry.diagnostics as diagnostic (`${diagnostic.code}-${diagnostic.timestamp_usec ?? "none"}`)}
              <li class="logs-diagnostic" data-tone={diagnosticTone(diagnostic)}>
                <span class={eyebrowClass}>{diagnostic.source} · {diagnostic.code}</span>
                <span class={copyClass}>{diagnostic.message}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</Panel>

<style>
  .logs-diagnostic {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
  }

  .logs-diagnostic[data-tone="critical"] {
    border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg-primary));
    color: var(--color-danger);
  }

  .logs-diagnostic[data-tone="caution"] {
    border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-warning) 10%, var(--color-bg-primary));
    color: var(--color-warning);
  }
</style>
