<script lang="ts">
import type { LogLibraryEntry } from "../../../logs";
import { ActionRow, Banner, Button, EmptyState, Eyebrow, HelperText, Input, MonoValue, Panel, SelectableCard, StatusPill } from "../../../components/ui";
import { formatCount, formatDuration } from "../logs-format";
import { entryStatusLabel, entryTone, sourceStatusLabel } from "../logs-workspace-display";

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

const titleClass = "mt-1 m-0 text-base font-semibold text-text-primary";
</script>

<Panel testId="logs-library-panel">
  <div class="flex min-h-0 flex-col gap-3 overflow-hidden">
    <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div>
        <Eyebrow>Library</Eyebrow>
        <h3 class={titleClass}>Referenced catalog</h3>
        <HelperText>Register existing <code>.tlog</code> and <code>.bin</code> files in place without copying bytes into app storage.</HelperText>
      </div>

      <Button onclick={onRefresh}>Refresh</Button>
    </div>

    <label class="flex flex-col gap-1.5">
      <Eyebrow as="span">Import or register path</Eyebrow>
      <Input
        testId="logs-import-path-input"
        oninput={(event) => onImportPathChange((event.currentTarget as HTMLInputElement).value)}
        placeholder="/data/logs/flight-042.tlog"
        type="text"
        value={importPath}
      />
    </label>

    <ActionRow align="start">
      <Button
        testId="logs-import-picker-button"
        disabled={libraryPhase === "loading"}
        onclick={onRegisterFromPicker}
      >
        Choose file
      </Button>
      <Button
        variant="default"
        testId="logs-import-button"
        disabled={importPath.trim().length === 0 || libraryPhase === "loading"}
        onclick={onRegisterPath}
      >
        Register path
      </Button>
    </ActionRow>

    {#if libraryError}
      <Banner severity="danger" title={libraryError} />
    {/if}

    {#if entries.length === 0}
      <EmptyState
        description="Register a referenced path to seed the durable library and its rebuildable indexes."
        title="No indexed logs yet."
        testId="logs-library-empty"
      />
    {:else}
      <ul class="m-0 flex flex-col gap-2 overflow-y-auto p-0 list-none" data-testid="logs-library-list">
        {#each entries as entry (entry.entry_id)}
          <li>
            <SelectableCard
              class="flex flex-col gap-2"
              density="compact"
              selected={selectedEntryId === entry.entry_id}
              testId={`logs-entry-${entry.entry_id}`}
              onSelect={() => onSelectEntry(entry.entry_id)}
            >
              <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
                <span class="text-sm font-semibold text-text-primary">{entry.metadata.display_name}</span>
                <MonoValue size="xs" tone="muted" value={entry.metadata.format} />
              </div>

              <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
                <MonoValue size="xs" tone="muted" value={formatDuration(entry.metadata.duration_secs)} />
                <MonoValue size="xs" tone="muted" value={`${formatCount(entry.metadata.total_messages)} msgs`} />
              </div>

              <div class="flex flex-wrap gap-2">
                <StatusPill tone={mapTone(entryTone(entry))}>{entryStatusLabel(entry)}</StatusPill>
                <StatusPill tone={entry.source.status.kind === "available" ? "neutral" : "warning"}>{sourceStatusLabel(entry)}</StatusPill>
                {#if loadedEntryId === entry.entry_id}
                  <StatusPill tone="success">loaded</StatusPill>
                {/if}
              </div>
            </SelectableCard>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Panel>
