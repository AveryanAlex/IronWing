<script lang="ts">
import type { LogExportRequest, LogLibraryEntry, RawMessageFieldFilter, RawMessageQuery, RawMessageRecord } from "../../logs";
import type { LogsExportState, LogsRawBrowserFilters, LogsRawBrowserState } from "../../lib/stores/logs-workspace";
import { Banner, Button, Panel, StatusPill } from "../ui";

type DraftFieldFilter = RawMessageFieldFilter & { id: number };

type LogsRawBrowserDraftFilters = {
  startUsecInput: string;
  endUsecInput: string;
  messageTypesInput: string;
  textInput: string;
  fieldFilters: DraftFieldFilter[];
  limitInput: string;
  includeDetail: boolean;
  includeHex: boolean;
};

type RawNumericValidation = {
  startUsec: string | null;
  endUsec: string | null;
  limit: string | null;
};

const MAX_RAW_PAGE_SIZE = 500;

type Props = {
  entry: LogLibraryEntry | null;
  rawBrowser: LogsRawBrowserState;
  exportState: LogsExportState;
  onFiltersChange: (filters: LogsRawBrowserFilters) => void;
  onRunQuery: (request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) => void;
  onExport: (request: Omit<LogExportRequest, "entry_id" | "instance_id"> & { entry_id?: string }) => void;
  onSelectSequence: (sequence: number | null) => void;
};

let {
  entry,
  rawBrowser,
  exportState,
  onFiltersChange,
  onRunQuery,
  onExport,
  onSelectSequence,
}: Props = $props();

let exportDestination = $state("");
let previousCursors = $state<Array<string | null>>([]);
let paginationEntryId = "";
let filterKey = "";
let nextFieldFilterId = 1;
let rawExportVisible = $derived(exportState.origin === "raw-browser");
let rawExportInFlight = $derived(exportState.phase === "exporting" && rawExportVisible);
let draftFilters = $state<LogsRawBrowserDraftFilters>({
  startUsecInput: "",
  endUsecInput: "",
  messageTypesInput: "",
  textInput: "",
  fieldFilters: [{ id: 0, field: "", value_text: null }],
  limitInput: "25",
  includeDetail: true,
  includeHex: true,
});
let numericValidation = $derived.by<RawNumericValidation>(() => validateNumericInputs(draftFilters));
let selectedRecord = $derived.by<RawMessageRecord | null>(() => {
  const selectedSequence = rawBrowser.selectedSequence;
  if (selectedSequence == null) {
    return rawBrowser.page?.items[0] ?? null;
  }

  return rawBrowser.page?.items.find((item) => item.sequence === selectedSequence) ?? rawBrowser.page?.items[0] ?? null;
});

$effect(() => {
  const nextFilterKey = JSON.stringify(rawBrowser.filters);
  if (filterKey === nextFilterKey) {
    return;
  }

  filterKey = nextFilterKey;
  draftFilters = createDraftFilters(rawBrowser.filters, draftFilters.fieldFilters);
  previousCursors = [];
});

$effect(() => {
  const nextEntryId = entry?.entry_id ?? "";
  if (paginationEntryId === nextEntryId) {
    return;
  }

  paginationEntryId = nextEntryId;
  previousCursors = [];
});

function updateFilters(recipe: (filters: LogsRawBrowserDraftFilters) => LogsRawBrowserDraftFilters) {
  const nextDraft = recipe(draftFilters);
  draftFilters = nextDraft;

  if (hasNumericValidationErrors(nextDraft)) {
    return;
  }

  onFiltersChange(toPersistedFilters(nextDraft));
}

function normalizeFieldFilters(fieldFilters: Array<Pick<RawMessageFieldFilter, "field" | "value_text">>): RawMessageFieldFilter[] {
  return fieldFilters
    .map((filter: RawMessageFieldFilter) => ({
      field: filter.field.trim(),
      value_text: filter.value_text?.trim() ? filter.value_text.trim() : null,
    }))
    .filter((filter) => filter.field.length > 0);
}

function nextDraftFieldFilter(field: string, valueText: string | null): DraftFieldFilter {
  const filter = { id: nextFieldFilterId, field, value_text: valueText };
  nextFieldFilterId += 1;
  return filter;
}

function fieldFilterKey(field: string, valueText: string | null): string {
  return `${field.trim()}\u0000${valueText?.trim() ?? ""}`;
}

function createDraftFieldFilters(
  filters: Array<Pick<RawMessageFieldFilter, "field" | "value_text">>,
  previousFieldFilters: DraftFieldFilter[],
): DraftFieldFilter[] {
  if (filters.length === 0) {
    return previousFieldFilters.length > 0
      ? [{ ...previousFieldFilters[0], field: "", value_text: null }]
      : [nextDraftFieldFilter("", null)];
  }

  const reusableIds = new Map<string, number[]>();
  for (const previousFieldFilter of previousFieldFilters) {
    const key = fieldFilterKey(previousFieldFilter.field, previousFieldFilter.value_text);
    const ids = reusableIds.get(key) ?? [];
    ids.push(previousFieldFilter.id);
    reusableIds.set(key, ids);
  }

  return filters.map((filter) => {
    const normalizedField = filter.field.trim();
    const normalizedValue = filter.value_text?.trim() ? filter.value_text.trim() : null;
    const key = fieldFilterKey(normalizedField, normalizedValue);
    const reusable = reusableIds.get(key);
    const id = reusable?.shift();

    return id == null
      ? nextDraftFieldFilter(normalizedField, normalizedValue)
      : { id, field: normalizedField, value_text: normalizedValue };
  });
}

function createDraftFilters(filters: LogsRawBrowserFilters, previousFieldFilters: DraftFieldFilter[] = []): LogsRawBrowserDraftFilters {
  return {
    startUsecInput: filters.startUsecInput,
    endUsecInput: filters.endUsecInput,
    messageTypesInput: filters.messageTypesInput,
    textInput: filters.textInput,
    fieldFilters: createDraftFieldFilters(filters.fieldFilters, previousFieldFilters),
    limitInput: String(filters.limit),
    includeDetail: filters.includeDetail,
    includeHex: filters.includeHex,
  };
}

function parseOptionalNonNegativeInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/^(?:0|[1-9]\d*)$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

function parseBoundedPageSize(value: string): number | null {
  const parsed = parsePositiveInteger(value);
  if (parsed == null || parsed > MAX_RAW_PAGE_SIZE) {
    return null;
  }

  return parsed;
}

function validateNumericInputs(filters: LogsRawBrowserDraftFilters): RawNumericValidation {
  return {
    startUsec: filters.startUsecInput.trim().length > 0 && parseOptionalNonNegativeInteger(filters.startUsecInput) == null
      ? "Start μs must be a non-negative integer."
      : null,
    endUsec: filters.endUsecInput.trim().length > 0 && parseOptionalNonNegativeInteger(filters.endUsecInput) == null
      ? "End μs must be a non-negative integer."
      : null,
    limit: parseBoundedPageSize(filters.limitInput) == null
      ? `Page size must be a positive integer from 1 to ${MAX_RAW_PAGE_SIZE}.`
      : null,
  };
}

function hasNumericValidationErrors(filters: LogsRawBrowserDraftFilters): boolean {
  const validation = validateNumericInputs(filters);
  return validation.startUsec != null || validation.endUsec != null || validation.limit != null;
}

function toPersistedFilters(filters: LogsRawBrowserDraftFilters): LogsRawBrowserFilters {
  return {
    startUsecInput: filters.startUsecInput,
    endUsecInput: filters.endUsecInput,
    messageTypesInput: filters.messageTypesInput,
    textInput: filters.textInput,
    fieldFilters: filters.fieldFilters.map(({ id: _id, ...filter }) => filter),
    limit: parseBoundedPageSize(filters.limitInput) ?? 1,
    includeDetail: filters.includeDetail,
    includeHex: filters.includeHex,
  };
}

function parseMessageTypes(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildQuery(cursor: string | null) {
  if (numericValidation.startUsec || numericValidation.endUsec || numericValidation.limit) {
    return null;
  }

  return {
    cursor,
    start_usec: parseOptionalNonNegativeInteger(draftFilters.startUsecInput),
    end_usec: parseOptionalNonNegativeInteger(draftFilters.endUsecInput),
    message_types: parseMessageTypes(draftFilters.messageTypesInput),
    text: draftFilters.textInput.trim().length > 0 ? draftFilters.textInput.trim() : null,
    field_filters: normalizeFieldFilters(draftFilters.fieldFilters),
    limit: parseBoundedPageSize(draftFilters.limitInput) ?? 1,
    include_detail: draftFilters.includeDetail,
    include_hex: draftFilters.includeHex,
  } satisfies Omit<RawMessageQuery, "entry_id">;
}

function runFirstPageQuery() {
  const query = buildQuery(null);
  if (!query) {
    return;
  }

  previousCursors = [];
  onRunQuery(query);
}

function runPreviousPageQuery() {
  const query = buildQuery(previousCursors[previousCursors.length - 1] ?? null);
  if (!query) {
    return;
  }

  const cursor = previousCursors[previousCursors.length - 1] ?? null;
  previousCursors = previousCursors.slice(0, -1);
  onRunQuery({ ...query, cursor });
}

function runNextPageQuery() {
  if (!rawBrowser.page?.next_cursor) {
    return;
  }

  const query = buildQuery(rawBrowser.page.next_cursor);
  if (!query) {
    return;
  }

  previousCursors = [...previousCursors, rawBrowser.request?.cursor ?? null];
  onRunQuery(query);
}

function addFieldFilter() {
  updateFilters((current) => ({
    ...current,
    fieldFilters: [...current.fieldFilters, nextDraftFieldFilter("", null)],
  }));
}

function updateFieldFilter(id: number, patch: Partial<RawMessageFieldFilter>) {
  updateFilters((current) => ({
    ...current,
    fieldFilters: current.fieldFilters.map((filter) => filter.id === id ? { ...filter, ...patch } : filter),
  }));
}

function removeFieldFilter(id: number) {
  updateFilters((current) => ({
    ...current,
    fieldFilters: current.fieldFilters.length === 1
      ? [nextDraftFieldFilter("", null)]
      : current.fieldFilters.filter((filter) => filter.id !== id),
  }));
}

function handleExport() {
  const destination = exportDestination.trim();
  if (destination.length === 0) {
    return;
  }

  const query = buildQuery(null);
  if (!query) {
    return;
  }

  onExport({
    destination_path: destination,
    format: "csv",
    start_usec: query.start_usec,
    end_usec: query.end_usec,
    message_types: query.message_types,
    text: query.text,
    field_filters: query.field_filters,
  });
}

function formatTimestampUsec(timestampUsec: number): string {
  return (timestampUsec / 1_000_000).toFixed(3);
}

function previewText(record: RawMessageRecord): string {
  return JSON.stringify(record.fields);
}

function detailJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}
</script>

<Panel testId="logs-raw-messages-panel">
  <div class="logs-raw-browser">
    <div class="logs-raw-browser__header">
      <div>
        <p class="logs-card__eyebrow">Forensic browser</p>
        <h3 class="logs-card__title">Raw messages</h3>
        <p class="logs-card__copy">Filter indexed records, inspect message payloads, and export the current filtered view as CSV.</p>
      </div>
      <StatusPill>{rawBrowser.page?.total_available ?? 0} matched</StatusPill>
    </div>

    {#if !entry}
      <Banner severity="info" title="Select a log to browse raw messages." />
    {:else}
    <div class="logs-raw-browser__filters">
      <label>
        <span>Message types</span>
        <input data-testid="logs-raw-type-filter" oninput={(event) => updateFilters((current) => ({ ...current, messageTypesInput: (event.currentTarget as HTMLInputElement).value }))} value={draftFilters.messageTypesInput} />
      </label>
      <label>
        <span>Text</span>
        <input data-testid="logs-raw-text-filter" oninput={(event) => updateFilters((current) => ({ ...current, textInput: (event.currentTarget as HTMLInputElement).value }))} value={draftFilters.textInput} />
      </label>
      <label>
        <span>Start μs</span>
        <input data-testid="logs-raw-start-filter" oninput={(event) => updateFilters((current) => ({ ...current, startUsecInput: (event.currentTarget as HTMLInputElement).value }))} value={draftFilters.startUsecInput} />
        {#if numericValidation.startUsec}
          <p class="logs-raw-browser__input-error" data-testid="logs-raw-start-error">{numericValidation.startUsec}</p>
        {/if}
      </label>
      <label>
        <span>End μs</span>
        <input data-testid="logs-raw-end-filter" oninput={(event) => updateFilters((current) => ({ ...current, endUsecInput: (event.currentTarget as HTMLInputElement).value }))} value={draftFilters.endUsecInput} />
        {#if numericValidation.endUsec}
          <p class="logs-raw-browser__input-error" data-testid="logs-raw-end-error">{numericValidation.endUsec}</p>
        {/if}
      </label>
      <label>
        <span>Page size</span>
        <input data-testid="logs-raw-limit-filter" max={MAX_RAW_PAGE_SIZE} min="1" oninput={(event) => updateFilters((current) => ({ ...current, limitInput: (event.currentTarget as HTMLInputElement).value }))} step="1" type="number" value={draftFilters.limitInput} />
        {#if numericValidation.limit}
          <p class="logs-raw-browser__input-error" data-testid="logs-raw-limit-error">{numericValidation.limit}</p>
        {/if}
      </label>
      <label class="logs-raw-browser__toggle">
        <input checked={draftFilters.includeDetail} onchange={(event) => updateFilters((current) => ({ ...current, includeDetail: (event.currentTarget as HTMLInputElement).checked }))} type="checkbox" />
        <span>Detail</span>
      </label>
      <label class="logs-raw-browser__toggle">
        <input checked={draftFilters.includeHex} onchange={(event) => updateFilters((current) => ({ ...current, includeHex: (event.currentTarget as HTMLInputElement).checked }))} type="checkbox" />
        <span>Hex</span>
      </label>
    </div>

    <div class="logs-raw-browser__field-filters">
      {#each draftFilters.fieldFilters as fieldFilter, index (fieldFilter.id)}
        <div class="logs-raw-browser__field-row">
          <input aria-label={`Field name ${index + 1}`} data-testid={`logs-raw-field-name-${index}`} oninput={(event) => updateFieldFilter(fieldFilter.id, { field: (event.currentTarget as HTMLInputElement).value })} placeholder="field" value={fieldFilter.field} />
          <input aria-label={`Field value ${index + 1}`} data-testid={`logs-raw-field-value-${index}`} oninput={(event) => updateFieldFilter(fieldFilter.id, { value_text: (event.currentTarget as HTMLInputElement).value })} placeholder="contains" value={fieldFilter.value_text ?? ""} />
          <Button size="sm" onclick={() => removeFieldFilter(fieldFilter.id)}>Remove</Button>
        </div>
      {/each}
      <Button size="sm" onclick={addFieldFilter}>Add field filter</Button>
    </div>

    <div class="logs-raw-browser__actions">
      <div class="logs-raw-browser__query-actions">
        <Button tone="accent" testId="logs-raw-run-query" onclick={runFirstPageQuery}>Run query</Button>
        <Button testId="logs-raw-previous-page" disabled={previousCursors.length === 0} onclick={runPreviousPageQuery}>Previous</Button>
        <Button testId="logs-raw-next-page" disabled={!rawBrowser.page?.next_cursor} onclick={runNextPageQuery}>Next</Button>
      </div>

      <div class="logs-raw-browser__export">
        <input aria-label="Export destination path" data-testid="logs-raw-export-destination" oninput={(event) => (exportDestination = (event.currentTarget as HTMLInputElement).value)} placeholder="/tmp/raw-messages.csv" value={exportDestination} />
        <Button
          testId="logs-raw-export"
          disabled={exportDestination.trim().length === 0 || exportState.phase === "exporting"}
          onclick={handleExport}
        >
          {rawExportInFlight ? "Exporting…" : "Export filtered CSV"}
        </Button>
      </div>
    </div>

    {#if rawBrowser.error}
      <Banner severity="danger" title={rawBrowser.error} />
    {/if}
    {#if rawExportVisible && exportState.error}
      <Banner severity="danger" title={exportState.error} />
    {:else if rawExportVisible && exportState.phase === "completed" && exportState.result}
      <Banner
        severity="success"
        title={`Export completed · ${exportState.result.rows_written.toLocaleString()} rows written.`}
      />
    {/if}

    <div class="logs-raw-browser__content">
      <div class="logs-raw-browser__table-shell">
        <table class="logs-raw-browser__table" data-testid="logs-raw-messages-table">
          <thead>
            <tr>
              <th>Time (s)</th>
              <th>Type</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {#if rawBrowser.page && rawBrowser.page.items.length > 0}
              {#each rawBrowser.page.items as item (item.sequence)}
                <tr
                  aria-selected={selectedRecord?.sequence === item.sequence}
                  data-selected={selectedRecord?.sequence === item.sequence}
                  data-testid={`logs-raw-row-${item.sequence}`}
                  onclick={() => onSelectSequence(item.sequence)}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectSequence(item.sequence);
                    }
                  }}
                  tabindex="0"
                >
                  <td>{formatTimestampUsec(item.timestamp_usec)}</td>
                  <td>{item.message_type}</td>
                  <td>{previewText(item)}</td>
                </tr>
              {/each}
            {:else}
              <tr>
                <td colspan="3">No messages match the current filters.</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      <aside class="logs-raw-browser__drawer">
        <p class="logs-card__eyebrow">Detail drawer</p>
        {#if selectedRecord}
          <h4 class="logs-card__title">{selectedRecord.message_type} · seq {selectedRecord.sequence}</h4>
          <pre>{detailJson(selectedRecord.fields)}</pre>
          {#if selectedRecord.detail !== null}
            <h5>Raw detail</h5>
            <pre>{detailJson(selectedRecord.detail)}</pre>
          {/if}
          {#if selectedRecord.hex_payload}
            <h5>Hex payload</h5>
            <pre>{selectedRecord.hex_payload}</pre>
          {/if}
        {:else}
          <p class="logs-card__copy">Run a query and choose a row to inspect raw fields and payload details.</p>
        {/if}
      </aside>
    </div>
  {/if}
  </div>
</Panel>

<style>
  .logs-raw-browser,
  .logs-raw-browser__content,
  .logs-raw-browser__table-shell,
  .logs-raw-browser__drawer,
  .logs-raw-browser__filters,
  .logs-raw-browser__actions,
  .logs-raw-browser__query-actions,
  .logs-raw-browser__export,
  .logs-raw-browser__field-row,
  .logs-raw-browser__header {
    display: flex;
    gap: 12px;
  }

  .logs-raw-browser,
  .logs-raw-browser__drawer {
    flex-direction: column;
  }

  .logs-raw-browser__header,
  .logs-raw-browser__actions {
    justify-content: space-between;
    align-items: flex-start;
  }

  .logs-card__eyebrow,
  .logs-raw-browser__filters span,
  .logs-raw-browser__drawer h5 {
    display: block;
    margin: 0 0 4px;
    color: var(--color-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .logs-card__title {
    margin: 4px 0 0;
    color: var(--color-text-primary);
    font-size: 0.98rem;
    font-weight: 600;
  }

  .logs-card__copy {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-raw-browser__filters {
    flex-wrap: wrap;
  }

  .logs-raw-browser__filters label,
  .logs-raw-browser__export,
  .logs-raw-browser__field-row {
    flex: 1 1 10rem;
  }

  .logs-raw-browser input {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    padding: 0.45rem 0.6rem;
  }

  .logs-raw-browser__toggle {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
  }

  .logs-raw-browser__toggle input {
    width: auto;
  }

  .logs-raw-browser__content {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.9fr);
  }

  .logs-raw-browser__table-shell {
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  .logs-raw-browser__table {
    width: 100%;
    border-collapse: collapse;
  }

  .logs-raw-browser__table th,
  .logs-raw-browser__table td {
    padding: 0.6rem;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    font-size: 0.8rem;
    vertical-align: top;
  }

  .logs-raw-browser__table tr[data-selected="true"] {
    background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-primary));
  }

  .logs-raw-browser__drawer {
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 12px;
  }

  .logs-raw-browser__drawer pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-text-secondary);
    font-size: 0.78rem;
  }

  @media (max-width: 980px) {
    .logs-raw-browser__content {
      grid-template-columns: 1fr;
    }

    .logs-raw-browser__header,
    .logs-raw-browser__actions {
      flex-direction: column;
    }
  }
</style>
