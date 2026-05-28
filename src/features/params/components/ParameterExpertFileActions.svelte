<script lang="ts">
import type { ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";
import type {
  ParameterFileImportResult,
  ParameterFileImportRow,
  ParameterFileIo,
} from "../../../lib/params/parameter-file-io";
import { ActionRow, Alert, Button, Card, Eyebrow, HelperText } from "../../../components/ui";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";

type ParameterExpertFileActionsProps = {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  fileIo: ParameterFileIo;
  onStageImportedRows: (rows: ParameterFileImportRow[]) => void;
  replayReadonly?: boolean;
};

let {
  paramStore,
  metadata,
  fileIo,
  onStageImportedRows,
  replayReadonly = false,
}: ParameterExpertFileActionsProps = $props();

type FileActionState = "idle" | "importing" | "exporting" | "success" | "cancelled" | "error";
type FileActionKind = "import" | "export" | null;

let actionState = $state<FileActionState>("idle");
let actionKind = $state<FileActionKind>(null);
let message = $state("Import a .param file or export the current vehicle snapshot here. Imported rows only stage known values that differ from the current session.");
let detail = $state("Pending tray edits stay local until they are applied.");
let stagedCount = $state(0);
let skippedCount = $state(0);
let skippedUnknownCount = $state(0);
let skippedUnchangedCount = $state(0);

let isBusy = $derived(actionState === "importing" || actionState === "exporting");
let actionsDisabled = $derived(!paramStore || isBusy || replayReadonly);

async function importFile() {
  if (actionsDisabled) {
    return;
  }

  actionKind = "import";
  actionState = "importing";
  stagedCount = 0;
  skippedCount = 0;
  skippedUnknownCount = 0;
  skippedUnchangedCount = 0;
  message = "Importing parameter file…";
  detail = "The staged tray will stay unchanged until parsing finishes or the import fails.";

  try {
    const result = await fileIo.importFromPicker({ paramStore, metadata });
    if (result.status === "cancelled") {
      actionState = "cancelled";
      message = "Import cancelled.";
      detail = "The staged tray was left unchanged.";
      return;
    }

    onStageImportedRows(result.stagedRows);
    actionState = "success";
    stagedCount = result.stagedCount;
    skippedCount = result.skippedCount;
    skippedUnknownCount = result.skippedUnknownCount;
    skippedUnchangedCount = result.skippedUnchangedCount;
    message = buildImportMessage(result);
    detail = buildImportDetail(result);
  } catch (error) {
    actionState = "error";
    message = `Import failed: ${formatError(error)}`;
    detail = "The staged tray was left unchanged. Review the file contents or retry the import.";
  }
}

async function exportFile() {
  if (actionsDisabled) {
    return;
  }

  actionKind = "export";
  actionState = "exporting";
  message = "Exporting current parameter snapshot…";
  detail = "Pending tray edits stay local until they are applied.";

  try {
    const result = await fileIo.exportToPicker({ paramStore });
    if (result.status === "cancelled") {
      actionState = "cancelled";
      message = "Export cancelled.";
      detail = "Pending tray edits are still local to the shared review tray.";
      return;
    }

    actionState = "success";
    message = `Exported ${result.paramCount} current parameter${result.paramCount === 1 ? "" : "s"} to ${result.fileName ?? "the selected file"}.`;
    detail = "Export uses the current vehicle snapshot. Pending tray edits remain local until they are applied.";
  } catch (error) {
    actionState = "error";
    message = `Export failed: ${formatError(error)}`;
    detail = "Pending tray edits remain available in the shared review tray, and you can retry export from expert mode.";
  }
}

function buildImportMessage(result: Extract<ParameterFileImportResult, { status: "success" }>) {
  if (result.totalRows === 0) {
    return "Imported file was empty. No changes were staged.";
  }

  if (result.stagedCount === 0) {
    return `Imported ${result.totalRows} row${result.totalRows === 1 ? "" : "s"} from ${result.fileName ?? "the selected file"}, but no new changes needed staging.`;
  }

  return `Staged ${result.stagedCount} imported change${result.stagedCount === 1 ? "" : "s"} from ${result.fileName ?? "the selected file"}.`;
}

function buildImportDetail(result: Extract<ParameterFileImportResult, { status: "success" }>) {
  if (result.totalRows === 0) {
    return "Only non-comment NAME,VALUE rows can add changes to the shared tray.";
  }

  if (result.skippedCount === 0) {
    return "Every parsed row mapped to the current vehicle snapshot and staged successfully.";
  }

  const parts: string[] = [];
  if (result.skippedUnknownCount > 0) {
    parts.push(`${result.skippedUnknownCount} missing from the current vehicle snapshot`);
  }
  if (result.skippedUnchangedCount > 0) {
    parts.push(`${result.skippedUnchangedCount} already matched the current vehicle`);
  }

  return `Skipped ${result.skippedCount} row${result.skippedCount === 1 ? "" : "s"}: ${parts.join("; ")}.`;
}

function statusVariant(): "info" | "success" | "warning" | "danger" {
  switch (actionState) {
    case "success":
      return "success";
    case "cancelled":
      return "info";
    case "error":
      return "danger";
    case "importing":
    case "exporting":
      return "info";
    case "idle":
    default:
      return "info";
  }
}

function formatError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown file action error.";
}
</script>

<Card.Root as="section" density="compact" surface="primary" testId={parameterWorkspaceTestIds.expertFileActions}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <Eyebrow>File workflows</Eyebrow>
      <h4 class="mt-2 text-base font-semibold text-text-primary">Import or export expert parameter files</h4>
      <HelperText class="mt-2">
        Import `.param` files into the shared staged tray or export the current vehicle snapshot without leaving expert mode.
      </HelperText>
    </div>

    <ActionRow>
      <Button
        testId={parameterWorkspaceTestIds.expertFileImportButton}
        disabled={actionsDisabled}
        loading={actionState === "importing"}
        onclick={importFile}
        variant="outline"
      >
        {actionState === "importing" ? "Importing..." : "Import .param file"}
      </Button>
      <Button
        testId={parameterWorkspaceTestIds.expertFileExportButton}
        disabled={actionsDisabled}
        loading={actionState === "exporting"}
        onclick={exportFile}
        variant="outline"
      >
        {actionState === "exporting" ? "Exporting..." : "Export current snapshot"}
      </Button>
    </ActionRow>
  </div>

  <div
    class="mt-4"
    data-action={actionKind ?? "none"}
    data-skipped-count={String(skippedCount)}
    data-staged-count={String(stagedCount)}
    data-state={actionState}
    data-testid={parameterWorkspaceTestIds.expertFileStatus}
  >
    <Alert
      density="compact"
      description={detail}
      title={message}
      titleTestId={parameterWorkspaceTestIds.expertFileMessage}
      variant={statusVariant()}
    >
      {#if actionKind === "import" && actionState === "success" && skippedCount > 0}
        <HelperText class="mt-2 opacity-80" size="xs">
          Unknown rows skipped: {skippedUnknownCount} · Unchanged rows skipped: {skippedUnchangedCount}
        </HelperText>
      {/if}
    </Alert>
  </div>
</Card.Root>
