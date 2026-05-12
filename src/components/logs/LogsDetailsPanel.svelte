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
</script>

<Panel testId="logs-details-panel">
  <div class="logs-details">
    <div class="logs-card__header">
      <div>
        <p class="logs-card__eyebrow">Details</p>
        <h3 class="logs-card__title">Selection facts and maintenance actions</h3>
        <p class="logs-card__copy">Selection stays separate from the currently loaded replay entry so live restore does not erase library focus.</p>
      </div>

      {#if selectedEntry}
        <StatusPill tone={mapTone(entryTone(selectedEntry))} testId="logs-selected-status-pill">
          {entryStatusLabel(selectedEntry)}
        </StatusPill>
      {/if}
    </div>

    {#if !selectedEntry}
      <div class="logs-empty" data-testid="logs-selection-empty">
        <p class="logs-empty__title">Select a log to inspect it.</p>
        <p class="logs-empty__copy">The details panel will show truthful source, index, diagnostics, replay, and maintenance state for the chosen catalog entry.</p>
      </div>
    {:else}
      <div class="logs-facts-grid">
        <div class="logs-fact">
          <span class="logs-fact__label">Source path</span>
          <span class="logs-fact__value logs-fact__value--mono logs-content-wrap">{selectedEntry.source.original_path}</span>
        </div>
        <div class="logs-fact">
          <span class="logs-fact__label">Imported</span>
          <span class="logs-fact__value">{formatImportedAt(selectedEntry.imported_at_unix_msec)}</span>
        </div>
        <div class="logs-fact">
          <span class="logs-fact__label">Messages</span>
          <span class="logs-fact__value">{formatCount(selectedEntry.metadata.total_messages)}</span>
        </div>
        <div class="logs-fact">
          <span class="logs-fact__label">Duration</span>
          <span class="logs-fact__value">{formatDuration(selectedEntry.metadata.duration_secs)}</span>
        </div>
        <div class="logs-fact">
          <span class="logs-fact__label">Indexed range</span>
          <span class="logs-fact__value">{formatUsec(selectedEntry.metadata.start_usec)} → {formatUsec(selectedEntry.metadata.end_usec, selectedEntry.metadata.start_usec)}</span>
        </div>
        <div class="logs-fact">
          <span class="logs-fact__label">Index file</span>
          <span class="logs-fact__value logs-fact__value--mono logs-content-wrap">{selectedEntry.index?.relative_path ?? "not built"}</span>
        </div>
      </div>

      <div class="logs-detail-badges">
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

      <label class="logs-field">
        <span class="logs-field__label">Relink path</span>
        <input
          class="logs-input"
          data-testid="logs-relink-path-input"
          oninput={(event) => onRelinkPathChange((event.currentTarget as HTMLInputElement).value)}
          placeholder="/data/logs/relinked-flight.tlog"
          type="text"
          value={relinkPath}
        />
      </label>

      <div class="logs-detail-actions">
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

      <div class="logs-diagnostics">
        <p class="logs-card__eyebrow">Diagnostics</p>
        {#if selectedEntry.diagnostics.length === 0}
          <p class="logs-card__copy">No catalog, parse, or index diagnostics are currently attached to this entry.</p>
        {:else}
          <ul class="logs-diagnostics__list">
            {#each selectedEntry.diagnostics as diagnostic (`${diagnostic.code}-${diagnostic.timestamp_usec ?? "none"}`)}
              <li class="logs-diagnostic" data-tone={diagnosticTone(diagnostic)}>
                <span class="logs-diagnostic__label">{diagnostic.source} · {diagnostic.code}</span>
                <span class="logs-diagnostic__message">{diagnostic.message}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</Panel>

<style>
  .logs-details {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  .logs-card__header,
  .logs-detail-badges,
  .logs-detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .logs-card__header > div,
  .logs-fact {
    min-width: 0;
  }

  .logs-card__header {
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .logs-card__eyebrow,
  .logs-fact__label,
  .logs-field__label,
  .logs-diagnostic__label {
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
    font-weight: 600;
  }

  .logs-card__title {
    margin-top: 4px;
    font-size: 0.98rem;
  }

  .logs-card__copy,
  .logs-empty__copy,
  .logs-diagnostic__message,
  .logs-fact__value {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-empty,
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

  .logs-empty__title {
    font-size: 0.9rem;
  }

  .logs-empty__copy {
    margin-top: 4px;
  }

  .logs-content-wrap {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .logs-facts-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .logs-fact {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
  }

  .logs-fact__value {
    color: var(--color-text-primary);
  }

  .logs-fact__value--mono {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.74rem;
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

  .logs-diagnostics__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  @media (max-width: 720px) {
    .logs-card__header {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
