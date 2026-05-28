<script lang="ts">
import type { LogLibraryEntry } from "../../../logs";
import { ActionRow, Banner, Button, Card, EmptyState, Eyebrow, FactTile, HelperText, Input, MonoValue, Panel, StatusPill } from "../../../components/ui";
import { formatCount, formatDuration, formatImportedAt, formatUsec } from "../logs-format";
import { diagnosticTone, entryStatusLabel, entryTone, sourceStatusLabel } from "../logs-workspace-display";

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

function diagnosticCardTone(tone: ReturnType<typeof diagnosticTone>): "neutral" | "warning" | "danger" {
  if (tone === "critical") {
    return "danger";
  }

  if (tone === "caution") {
    return "warning";
  }

  return "neutral";
}
</script>

<Panel testId="logs-details-panel">
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex flex-wrap items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0">
        <Eyebrow>Details</Eyebrow>
        <h3 class="mt-1 m-0 text-base font-semibold text-text-primary">Selection facts and maintenance actions</h3>
        <HelperText>Selection stays separate from the currently loaded replay entry so live restore does not erase library focus.</HelperText>
      </div>

      {#if selectedEntry}
        <StatusPill tone={mapTone(entryTone(selectedEntry))} testId="logs-selected-status-pill">
          {entryStatusLabel(selectedEntry)}
        </StatusPill>
      {/if}
    </div>

    {#if !selectedEntry}
      <EmptyState
        description="The details panel will show truthful source, index, diagnostics, replay, and maintenance state for the chosen catalog entry."
        testId="logs-selection-empty"
        title="Select a log to inspect it."
      />
    {:else}
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <FactTile label="Source path" mono={false}>
          <MonoValue size="xs" value={selectedEntry.source.original_path} wrap />
        </FactTile>
        <FactTile label="Imported" value={formatImportedAt(selectedEntry.imported_at_unix_msec)} />
        <FactTile label="Messages" value={formatCount(selectedEntry.metadata.total_messages)} />
        <FactTile label="Duration" value={formatDuration(selectedEntry.metadata.duration_secs)} />
        <FactTile label="Indexed range" value={`${formatUsec(selectedEntry.metadata.start_usec)} → ${formatUsec(selectedEntry.metadata.end_usec, selectedEntry.metadata.start_usec)}`} />
        <FactTile label="Index file" mono={false}>
          <MonoValue size="xs" value={selectedEntry.index?.relative_path ?? "not built"} wrap />
        </FactTile>
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
        <Eyebrow as="span">Relink path</Eyebrow>
        <Input
          testId="logs-relink-path-input"
          oninput={(event) => onRelinkPathChange((event.currentTarget as HTMLInputElement).value)}
          placeholder="/data/logs/relinked-flight.tlog"
          type="text"
          value={relinkPath}
        />
      </label>

      <ActionRow align="start">
        <Button
          variant="default"
          testId="logs-relink-button"
          disabled={relinkPath.trim().length === 0 || libraryPhase === "loading"}
          onclick={onRelink}
        >
          Relink
        </Button>
        <Button testId="logs-reindex-button" onclick={onReindex}>Reindex</Button>
        <Button variant="destructive" testId="logs-remove-button" onclick={onRemove}>Remove</Button>
      </ActionRow>

      <div>
        <Eyebrow>Diagnostics</Eyebrow>
        {#if selectedEntry.diagnostics.length === 0}
          <HelperText>No catalog, parse, or index diagnostics are currently attached to this entry.</HelperText>
        {:else}
          <ul class="m-0 flex flex-col gap-2 p-0 list-none">
            {#each selectedEntry.diagnostics as diagnostic (`${diagnostic.code}-${diagnostic.timestamp_usec ?? "none"}`)}
              <li>
                <Card.Root density="compact" surface="primary" tone={diagnosticCardTone(diagnosticTone(diagnostic))} data-tone={diagnosticTone(diagnostic)}>
                  <Eyebrow>{diagnostic.source} · {diagnostic.code}</Eyebrow>
                  <HelperText>{diagnostic.message}</HelperText>
                </Card.Root>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</Panel>
