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
</script>

<Panel testId="logs-library-panel">
  <div class="logs-library">
    <div class="logs-library__header">
      <div>
        <p class="logs-card__eyebrow">Library</p>
        <h3 class="logs-card__title">Referenced catalog</h3>
        <p class="logs-card__copy">Register existing <code>.tlog</code> and <code>.bin</code> files in place without copying bytes into app storage.</p>
      </div>

      <Button onclick={onRefresh}>Refresh</Button>
    </div>

    <label class="logs-field">
      <span class="logs-field__label">Import or register path</span>
      <input
        class="logs-input"
        data-testid="logs-import-path-input"
        oninput={(event) => onImportPathChange((event.currentTarget as HTMLInputElement).value)}
        placeholder="/data/logs/flight-042.tlog"
        type="text"
        value={importPath}
      />
    </label>

    <div class="logs-library__actions">
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
      <div class="logs-empty" data-testid="logs-library-empty">
        <p class="logs-empty__title">No indexed logs yet.</p>
        <p class="logs-empty__copy">Register a referenced path to seed the durable library and its rebuildable indexes.</p>
      </div>
    {:else}
      <ul class="logs-library__list" data-testid="logs-library-list">
        {#each entries as entry (entry.entry_id)}
          <li>
            <button
              class={`logs-library-entry ${selectedEntryId === entry.entry_id ? "is-selected" : ""}`}
              data-testid={`logs-entry-${entry.entry_id}`}
              onclick={() => onSelectEntry(entry.entry_id)}
              type="button"
            >
              <div class="logs-library-entry__topline">
                <span class="logs-library-entry__name">{entry.metadata.display_name}</span>
                <span class="logs-library-entry__format">{entry.metadata.format}</span>
              </div>

              <div class="logs-library-entry__meta">
                <span>{formatDuration(entry.metadata.duration_secs)}</span>
                <span>{formatCount(entry.metadata.total_messages)} msgs</span>
              </div>

              <div class="logs-library-entry__badges">
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

<style>
  .logs-library {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .logs-library__header,
  .logs-library-entry__topline,
  .logs-library-entry__meta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .logs-card__eyebrow,
  .logs-field__label {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .logs-card__title,
  .logs-empty__title {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 0.98rem;
    font-weight: 600;
  }

  .logs-card__title {
    margin-top: 4px;
  }

  .logs-card__copy,
  .logs-empty__copy {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-empty {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
  }

  .logs-empty__copy {
    margin-top: 4px;
  }

  .logs-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .logs-input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-input);
    color: var(--color-text-primary);
    font-size: 0.8rem;
    padding: 0.55rem 0.7rem;
  }

  .logs-library__actions,
  .logs-library-entry__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .logs-library__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }

  .logs-library-entry {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
  }

  .logs-library-entry.is-selected {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-primary));
  }

  .logs-library-entry__name {
    color: var(--color-text-primary);
    font-size: 0.86rem;
    font-weight: 600;
  }

  .logs-library-entry__format,
  .logs-library-entry__meta {
    color: var(--color-text-muted);
    font-family: "JetBrains Mono", monospace;
    font-size: 0.73rem;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 720px) {
    .logs-library__header,
    .logs-library-entry__topline,
    .logs-library-entry__meta {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
