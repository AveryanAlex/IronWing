<script lang="ts">
import type { LogLibraryEntry } from "../../logs";
import { Banner, Button, Panel, StatusPill } from "../ui";
import { formatCount, formatDuration } from "./logs-format";
import { entryStatusLabel, entryTone, sourceStatusLabel } from "./logs-workspace-display";

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
  entries: LogLibraryEntry[];
  selectedEntryId: string | null;
  loadedEntryId: string | null;
  libraryPhase: "idle" | "loading" | "ready" | "failed";
  libraryError: string | null;
  importPath: string;
  onImportPathChange: (path: string) => void;
  onRegisterPath: () => void;
  onRegisterFromPicker: () => void;
  onRefresh: () => void;
  onSelectEntry: (entryId: string) => void;
};

let {
  entries,
  selectedEntryId,
  loadedEntryId,
  libraryPhase,
  libraryError,
  importPath,
  onImportPathChange,
  onRegisterPath,
  onRegisterFromPicker,
  onRefresh,
  onSelectEntry,
}: Props = $props();

const eyebrowClass = "m-0 text-xs font-semibold uppercase tracking-wide text-text-muted";
const titleClass = "mt-1 m-0 text-base font-semibold text-text-primary";
const copyClass = "m-0 text-sm leading-6 text-text-secondary";
const fieldLabelClass = eyebrowClass;
const inputClass = "w-full min-w-0 rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary";
const emptyCardClass = "rounded-lg border border-border bg-bg-primary px-3 py-3";
const selectedEntryClass = "border-accent/40 bg-accent/10";
</script>

<Panel testId="logs-library-panel">
  <div class="flex min-h-0 flex-col gap-3 overflow-hidden">
    <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div>
        <p class={eyebrowClass}>Library</p>
        <h3 class={titleClass}>Referenced catalog</h3>
        <p class={copyClass}>Register existing <code>.tlog</code> and <code>.bin</code> files in place without copying bytes into app storage.</p>
      </div>

      <Button onclick={onRefresh}>Refresh</Button>
    </div>

    <label class="flex flex-col gap-1.5">
      <span class={fieldLabelClass}>Import or register path</span>
      <input
        class={inputClass}
        data-testid="logs-import-path-input"
        oninput={(event) => onImportPathChange((event.currentTarget as HTMLInputElement).value)}
        placeholder="/data/logs/flight-042.tlog"
        type="text"
        value={importPath}
      />
    </label>

    <div class="flex flex-wrap gap-2">
      <Button
        testId="logs-import-picker-button"
        disabled={libraryPhase === "loading"}
        onclick={onRegisterFromPicker}
      >
        Choose file
      </Button>
      <Button
        tone="accent"
        testId="logs-import-button"
        disabled={importPath.trim().length === 0 || libraryPhase === "loading"}
        onclick={onRegisterPath}
      >
        Register path
      </Button>
    </div>

    {#if libraryError}
      <Banner severity="danger" title={libraryError} />
    {/if}

    {#if entries.length === 0}
      <div class={emptyCardClass} data-testid="logs-library-empty">
        <p class="m-0 text-base font-semibold text-text-primary">No indexed logs yet.</p>
        <p class="mt-1 m-0 text-sm leading-6 text-text-secondary">Register a referenced path to seed the durable library and its rebuildable indexes.</p>
      </div>
    {:else}
      <ul class="m-0 flex flex-col gap-2 overflow-y-auto p-0 list-none" data-testid="logs-library-list">
        {#each entries as entry (entry.entry_id)}
          <li>
              <button
                class={`flex w-full flex-col gap-2 rounded-lg border border-border bg-bg-primary px-3 py-3 text-left ${selectedEntryId === entry.entry_id ? selectedEntryClass : ""}`}
                data-testid={`logs-entry-${entry.entry_id}`}
                onclick={() => onSelectEntry(entry.entry_id)}
                type="button"
              >
                <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
                  <span class="text-sm font-semibold text-text-primary">{entry.metadata.display_name}</span>
                  <span class="font-mono text-xs tabular-nums text-text-muted">{entry.metadata.format}</span>
                </div>

                <div class="flex items-start justify-between gap-3 font-mono text-xs tabular-nums text-text-muted max-md:flex-col max-md:items-stretch">
                  <span>{formatDuration(entry.metadata.duration_secs)}</span>
                  <span>{formatCount(entry.metadata.total_messages)} msgs</span>
                </div>

              <div class="flex flex-wrap gap-2">
                <StatusPill tone={mapTone(entryTone(entry))}>{entryStatusLabel(entry)}</StatusPill>
                <StatusPill tone={entry.source.status.kind === "available" ? "neutral" : "warning"}>{sourceStatusLabel(entry)}</StatusPill>
                {#if loadedEntryId === entry.entry_id}
                  <StatusPill tone="success">loaded</StatusPill>
                {/if}
              </div>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Panel>
