<script lang="ts">
import { fromStore, get } from "svelte/store";
import { toast } from "svelte-sonner";

import type {
  LiveSettingsApplyPhase,
  LiveSettingsApplyTarget,
  LiveSettingsStoreState,
} from "../../lib/stores/live-settings";
import { hasUnsavedLiveSettings, resolveMessageRateAvailabilityReason } from "../../lib/stores/live-settings";
import { MESSAGE_RATE_HZ_LIMITS, TELEMETRY_RATE_HZ_LIMITS } from "../../lib/stores/settings";
import {
  ActionRow,
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Eyebrow,
  Field,
  HelperText,
  MonoValue,
  NumberInput,
  Sheet,
} from "../../components/ui";
import { appShellTestIds } from "./chrome-state";
import { getLiveSettingsStoreContext, getShellChromeStoreContext } from "./runtime-context";

type Props = {
  open?: boolean;
  onClose?: () => void;
};

type DialogStatusKind = "success" | "pending" | "error" | "neutral";

type DialogStatus = {
  kind: DialogStatusKind;
  title: string;
  description: string;
};

type MessageRateRowView = {
  id: number;
  name: string;
  inputValue: string;
  confirmedRateHz: number | null;
  draftRateHz: number | null;
  defaultRateHz: number;
  disabled: boolean;
  disabledReason: string | null;
  error: string | null;
  stateKind: DialogStatusKind;
  stateLabel: string;
};

const liveSettingsStore = getLiveSettingsStoreContext();
const liveSettings = fromStore(liveSettingsStore);
let chromeStore: ReturnType<typeof getShellChromeStoreContext> | null = null;
try {
  chromeStore = getShellChromeStoreContext();
} catch {
  chromeStore = null;
}
const chrome = chromeStore ? fromStore(chromeStore) : null;

let { open = false, onClose = () => {} }: Props = $props();

let telemetryRateInput = $state("");
let telemetryRateInputError = $state<string | null>(null);
let messageRateInputs = $state<Record<number, string>>({});
let messageRateInputErrors = $state<Record<number, string>>({});
let lastSyncedSignature = $state<string | null>(null);
let lastToastKey = $state<string | null>(null);
let lastDraftApplySummary = $state<string | null>(null);
let previousApplyPhase = $state<LiveSettingsApplyPhase>("idle");
let previousApplyTarget = $state<LiveSettingsApplyTarget>(null);

function buildDialogStatus(input: {
  state: LiveSettingsStoreState;
  telemetryInputError: string | null;
  messageRateInputErrors: Record<number, string>;
  unknownMessageRateIds: number[];
}): DialogStatus {
  const { state, telemetryInputError, messageRateInputErrors, unknownMessageRateIds } = input;

  if (unknownMessageRateIds.length > 0) {
    return {
      kind: "error",
      title: "Telemetry settings are incomplete",
      description:
        "The shell could not map one or more stored message-rate overrides to the available catalog. Review the current connection and retry before trusting these controls.",
    };
  }

  if (state.catalogPhase === "failed") {
    return {
      kind: "error",
      title: "Telemetry settings are unavailable",
      description:
        state.catalogError ??
        "The shell could not load message-rate metadata. Telemetry cadence edits will stay local until metadata is available again.",
    };
  }

  if (telemetryInputError || Object.keys(messageRateInputErrors).length > 0) {
    return {
      kind: "error",
      title: "Review invalid values before applying",
      description: "Keep the dialog open, correct the highlighted rows, and then apply again.",
    };
  }

  if (state.applyPhase === "applying") {
    return {
      kind: "pending",
      title: state.applyTarget === "reconnect" ? "Reapplying confirmed overrides…" : "Applying telemetry settings…",
      description:
        state.applyTarget === "reconnect"
          ? "Confirmed live message-rate overrides are being re-sent for the active session."
          : summarizeDraftChanges(state),
    };
  }

  if (state.lastApplyError) {
    return {
      kind: "error",
      title: "Apply needs attention",
      description: `${state.lastApplyError} The attempted values stay visible until you retry or discard them.`,
    };
  }

  if (hasUnsavedLiveSettings(state)) {
    return {
      kind: "pending",
      title: "Unsaved telemetry changes",
      description: "Your draft differs from the confirmed live settings. Apply to persist or discard to revert.",
    };
  }

  if (state.reconnectPhase === "pending" && Object.keys(state.confirmedSettings.messageRates).length > 0) {
    return {
      kind: "neutral",
      title: "Overrides are queued for reconnect",
      description:
        "Confirmed message-rate overrides will reapply when the next live vehicle connection becomes active.",
    };
  }

  const availabilityReason = resolveMessageRateAvailabilityReason(state);
  if (availabilityReason) {
    return {
      kind: "neutral",
      title: "Telemetry cadence remains available",
      description: `${availabilityReason} Confirmed settings are still stored locally for the next compatible session.`,
    };
  }

  return {
    kind: "success",
    title: "Confirmed telemetry settings are active",
    description: buildConfirmedSummary(state),
  };
}

function createMessageRateRows(
  state: LiveSettingsStoreState,
  inputs: Record<number, string>,
  inputErrors: Record<number, string>,
  disabledReason: string | null,
): MessageRateRowView[] {
  return state.messageRateCatalog.map((entry) => {
    const confirmedRateHz =
      entry.id in state.confirmedSettings.messageRates
        ? (state.confirmedSettings.messageRates[entry.id] ?? null)
        : null;
    const draftRateHz = entry.id in state.draft.messageRates ? (state.draft.messageRates[entry.id] ?? null) : null;
    const error = inputErrors[entry.id] ?? state.messageRateErrors[entry.id]?.message ?? null;
    const unsaved = confirmedRateHz !== draftRateHz;

    let stateKind: DialogStatusKind = "neutral";
    let stateLabel = draftRateHz === null ? "Default" : "Override";
    if (error) {
      stateKind = "error";
      stateLabel = "Needs attention";
    } else if (state.applyPhase === "applying" && unsaved) {
      stateKind = "pending";
      stateLabel = "Applying";
    } else if (unsaved) {
      stateKind = "pending";
      stateLabel = "Unsaved";
    } else if (draftRateHz !== null) {
      stateKind = "success";
      stateLabel = "Confirmed";
    }

    return {
      id: entry.id,
      name: entry.name,
      inputValue: inputs[entry.id] ?? (draftRateHz === null ? "" : String(draftRateHz)),
      confirmedRateHz,
      draftRateHz,
      defaultRateHz: entry.default_rate_hz,
      disabled: disabledReason !== null,
      disabledReason,
      error,
      stateKind,
      stateLabel,
    } satisfies MessageRateRowView;
  });
}

function buildStoreSyncSignature(state: LiveSettingsStoreState) {
  return JSON.stringify({
    telemetryRateHz: state.draft.telemetryRateHz,
    messageRates: Object.entries(state.draft.messageRates).sort(([left], [right]) => Number(left) - Number(right)),
    catalog: state.messageRateCatalog.map((entry) => `${entry.id}:${entry.default_rate_hz}`),
  });
}

function buildToastKey(state: LiveSettingsStoreState, summary: string | null) {
  if (state.lastApplyError) {
    return `error:${state.lastApplyError}`;
  }

  if (summary) {
    return `success:${summary}`;
  }

  return null;
}

function validateTelemetryRateInput(value: string): { value: number | null; error: string | null } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {
      value: null,
      error: `Telemetry cadence must stay between ${TELEMETRY_RATE_HZ_LIMITS.min} and ${TELEMETRY_RATE_HZ_LIMITS.max} Hz.`,
    };
  }

  const numericValue = Number(trimmed);
  if (
    !Number.isInteger(numericValue) ||
    numericValue < TELEMETRY_RATE_HZ_LIMITS.min ||
    numericValue > TELEMETRY_RATE_HZ_LIMITS.max
  ) {
    return {
      value: null,
      error: `Telemetry cadence must stay between ${TELEMETRY_RATE_HZ_LIMITS.min} and ${TELEMETRY_RATE_HZ_LIMITS.max} Hz.`,
    };
  }

  return {
    value: numericValue,
    error: null,
  };
}

function validateMessageRateInput(value: string): { value: number | null; error: string | null } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {
      value: null,
      error: null,
    };
  }

  const numericValue = Number(trimmed);
  if (
    !Number.isFinite(numericValue) ||
    numericValue < MESSAGE_RATE_HZ_LIMITS.min ||
    numericValue > MESSAGE_RATE_HZ_LIMITS.max
  ) {
    return {
      value: null,
      error: `Message rates must stay between ${MESSAGE_RATE_HZ_LIMITS.min} and ${MESSAGE_RATE_HZ_LIMITS.max} Hz.`,
    };
  }

  return {
    value: numericValue,
    error: null,
  };
}

function summarizeDraftChanges(state: Pick<LiveSettingsStoreState, "confirmedSettings" | "draft">) {
  const telemetryChanged = state.confirmedSettings.telemetryRateHz !== state.draft.telemetryRateHz;
  const messageRateChanges = countUnsavedMessageRateRows(state);

  if (telemetryChanged && messageRateChanges > 0) {
    return `Applying ${formatHz(state.draft.telemetryRateHz)} telemetry cadence and ${messageRateChanges} message-rate row${messageRateChanges === 1 ? "" : "s"}.`;
  }

  if (telemetryChanged) {
    return `Applying ${formatHz(state.draft.telemetryRateHz)} telemetry cadence.`;
  }

  if (messageRateChanges > 0) {
    return `Applying ${messageRateChanges} message-rate row${messageRateChanges === 1 ? "" : "s"}.`;
  }

  return "Applying telemetry settings.";
}

function buildConfirmedSummary(state: Pick<LiveSettingsStoreState, "confirmedSettings">) {
  const overrideCount = Object.keys(state.confirmedSettings.messageRates).length;
  return `${formatHz(state.confirmedSettings.telemetryRateHz)} cadence confirmed · ${overrideCount} message-rate override${overrideCount === 1 ? "" : "s"} stored.`;
}

function countUnsavedMessageRateRows(state: Pick<LiveSettingsStoreState, "confirmedSettings" | "draft">) {
  const ids = new Set([...Object.keys(state.confirmedSettings.messageRates), ...Object.keys(state.draft.messageRates)]);

  let count = 0;
  for (const id of ids) {
    const numericId = Number.parseInt(id, 10);
    if (!Number.isInteger(numericId)) {
      continue;
    }

    const confirmedRate =
      numericId in state.confirmedSettings.messageRates
        ? (state.confirmedSettings.messageRates[numericId] ?? null)
        : null;
    const draftRate = numericId in state.draft.messageRates ? (state.draft.messageRates[numericId] ?? null) : null;
    if (confirmedRate !== draftRate) {
      count += 1;
    }
  }

  return count;
}

function collectUnknownMessageRateIds(
  state: Pick<LiveSettingsStoreState, "confirmedSettings" | "draft" | "messageRateCatalog">,
) {
  const catalogIds = new Set(state.messageRateCatalog.map((entry) => entry.id));
  const ids = new Set([...Object.keys(state.confirmedSettings.messageRates), ...Object.keys(state.draft.messageRates)]);

  return [...ids]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && !catalogIds.has(value))
    .sort((left, right) => left - right);
}

function formatHz(value: number) {
  if (Number.isInteger(value)) {
    return `${value} Hz`;
  }

  return `${value.toFixed(1).replace(/\.0$/, "")} Hz`;
}

function syncInputsFromState(state: LiveSettingsStoreState) {
  telemetryRateInput = String(state.draft.telemetryRateHz);
  telemetryRateInputError = null;
  messageRateInputErrors = {};
  messageRateInputs = Object.fromEntries(
    state.messageRateCatalog.map((entry) => [
      entry.id,
      entry.id in state.draft.messageRates ? String(state.draft.messageRates[entry.id]) : "",
    ]),
  );
}

function handleTelemetryInput(value: string) {
  telemetryRateInput = value;
  const validation = validateTelemetryRateInput(value);
  telemetryRateInputError = validation.error;

  if (!validation.error && validation.value !== null) {
    liveSettingsStore.stageTelemetryRate(validation.value);
  }
}

function handleMessageRateInput(messageId: number, value: string) {
  messageRateInputs = {
    ...messageRateInputs,
    [messageId]: value,
  };

  const validation = validateMessageRateInput(value);
  if (validation.error) {
    messageRateInputErrors = {
      ...messageRateInputErrors,
      [messageId]: validation.error,
    };
    return;
  }

  const nextErrors = { ...messageRateInputErrors };
  delete nextErrors[messageId];
  messageRateInputErrors = nextErrors;
  liveSettingsStore.stageMessageRate(messageId, validation.value);
}

async function applyChanges() {
  const telemetryValidation = validateTelemetryRateInput(telemetryRateInput);
  const nextMessageRateErrors: Record<number, string> = {};

  telemetryRateInputError = telemetryValidation.error;

  for (const row of messageRateRows) {
    const validation = validateMessageRateInput(messageRateInputs[row.id] ?? "");
    if (validation.error) {
      nextMessageRateErrors[row.id] = validation.error;
      continue;
    }

    liveSettingsStore.stageMessageRate(row.id, validation.value);
  }

  messageRateInputErrors = nextMessageRateErrors;

  if (
    telemetryValidation.error ||
    Object.keys(nextMessageRateErrors).length > 0 ||
    telemetryValidation.value === null
  ) {
    return;
  }

  liveSettingsStore.stageTelemetryRate(telemetryValidation.value);
  lastDraftApplySummary = summarizeDraftChanges(get(liveSettingsStore));
  await liveSettingsStore.applyDrafts();
}

function discardChanges() {
  liveSettingsStore.discardDrafts();
  const nextState = get(liveSettingsStore);
  syncInputsFromState(nextState);
  lastSyncedSignature = buildStoreSyncSignature(nextState);
  lastDraftApplySummary = null;
}

function alertVariant(kind: DialogStatusKind) {
  switch (kind) {
    case "success":
      return "success";
    case "pending":
      return "info";
    case "error":
      return "danger";
    default:
      return "info";
  }
}

function badgeVariant(kind: DialogStatusKind) {
  switch (kind) {
    case "success":
      return "success";
    case "pending":
      return "accent";
    case "error":
      return "destructive";
    default:
      return "muted";
  }
}

function numberInputValue(value: string): number | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

let liveSettingsView = $derived(liveSettings.current);
let hasUnsavedSettings = $derived(hasUnsavedLiveSettings(liveSettingsView));
let hasLocalInputProblems = $derived(
  Boolean(telemetryRateInputError) || Object.keys(messageRateInputErrors).length > 0,
);
let isApplying = $derived(liveSettingsView.applyPhase === "applying");
let unknownMessageRateIds = $derived.by(() => collectUnknownMessageRateIds(liveSettingsView));
let globalMessageRateDisabledReason = $derived.by(() => {
  if (unknownMessageRateIds.length > 0) {
    return "Telemetry settings are unavailable because message-rate metadata is incomplete.";
  }

  if (liveSettingsView.catalogPhase === "failed") {
    return liveSettingsView.catalogError ?? "Telemetry settings are unavailable right now.";
  }

  if (liveSettingsView.catalogPhase === "loading") {
    return "Loading available message-rate controls…";
  }

  return resolveMessageRateAvailabilityReason(liveSettingsView);
});
let telemetryFieldError = $derived(telemetryRateInputError ?? liveSettingsView.telemetryRateError);
let messageRateRows = $derived.by(() =>
  createMessageRateRows(liveSettingsView, messageRateInputs, messageRateInputErrors, globalMessageRateDisabledReason),
);
let dialogStatus = $derived.by(() =>
  buildDialogStatus({
    state: liveSettingsView,
    telemetryInputError: telemetryRateInputError,
    messageRateInputErrors,
    unknownMessageRateIds,
  }),
);
let canApply = $derived(!isApplying && (hasUnsavedSettings || hasLocalInputProblems));
let canDiscard = $derived(!isApplying && (hasUnsavedSettings || hasLocalInputProblems));
let surfaceKind = $derived(chrome?.current?.tier === "phone" ? "sheet" : "dialog");

$effect(() => {
  const signature = buildStoreSyncSignature(liveSettingsView);
  if (signature === lastSyncedSignature) {
    return;
  }

  if (telemetryRateInputError || Object.keys(messageRateInputErrors).length > 0) {
    return;
  }

  syncInputsFromState(liveSettingsView);
  lastSyncedSignature = signature;
});

$effect(() => {
  if (
    previousApplyPhase === "applying" &&
    previousApplyTarget === "draft" &&
    liveSettingsView.applyPhase !== "applying"
  ) {
    const toastKey = buildToastKey(liveSettingsView, lastDraftApplySummary);
    if (toastKey && toastKey !== lastToastKey) {
      lastToastKey = toastKey;
      if (liveSettingsView.lastApplyError) {
        toast.error("Telemetry settings need attention", {
          description: liveSettingsView.lastApplyError,
        });
      } else {
        toast.success("Telemetry settings applied", {
          description: lastDraftApplySummary ?? "Confirmed telemetry settings are now active.",
        });
      }
    }
  }

  previousApplyPhase = liveSettingsView.applyPhase;
  previousApplyTarget = liveSettingsView.applyTarget;
});
</script>

{#snippet body()}
  <div class="space-y-5">
    <div
      data-status-kind={dialogStatus.kind}
      data-testid={appShellTestIds.telemetrySettingsStatus}
    >
      <Alert
        description={dialogStatus.description}
        title={dialogStatus.title}
        variant={alertVariant(dialogStatus.kind)}
      />
    </div>

    <Card.Root as="section" surface="primary" density="default" padding="comfortable">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Shell cadence</Eyebrow>
          <h3 class="mt-1 text-base font-semibold text-text-primary">Telemetry cadence</h3>
          <HelperText class="mt-1">
            Adjust the shell telemetry cadence without waiting for a live vehicle connection.
          </HelperText>
        </div>

        <Badge variant="accent" size="sm" case="normal">
          {formatHz(liveSettingsView.confirmedSettings.telemetryRateHz)} confirmed
        </Badge>
      </div>

      <Field.Root class="mt-4 sm:max-w-xs" invalid={Boolean(telemetryFieldError)}>
        <Field.Label for="telemetry-rate-hz">Cadence</Field.Label>
        <NumberInput
          id="telemetry-rate-hz"
          inputTestId={appShellTestIds.telemetrySettingsTelemetryInput}
          inputmode="numeric"
          invalid={Boolean(telemetryFieldError)}
          max={TELEMETRY_RATE_HZ_LIMITS.max}
          min={TELEMETRY_RATE_HZ_LIMITS.min}
          oninput={(event) => handleTelemetryInput((event.currentTarget as HTMLInputElement).value)}
          step="1"
          unit="Hz"
          value={numberInputValue(telemetryRateInput)}
        />
        <HelperText size="xs" tone="muted" class="uppercase tracking-wider">
          Allowed range · {TELEMETRY_RATE_HZ_LIMITS.min}–{TELEMETRY_RATE_HZ_LIMITS.max} Hz
        </HelperText>
        {#if telemetryFieldError}
          <Field.Error data-testid={appShellTestIds.telemetrySettingsTelemetryError} message={telemetryFieldError} />
        {/if}
      </Field.Root>
    </Card.Root>

    <Card.Root as="section" surface="primary" density="default" padding="comfortable">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Live vehicle overrides</Eyebrow>
          <h3 class="mt-1 text-base font-semibold text-text-primary">Message-rate controls</h3>
          <HelperText class="mt-1">
            Blank restores the backend default. Confirmed overrides reapply on the next live connection.
          </HelperText>
        </div>

        <Badge variant="muted" size="sm" case="normal">
          {messageRateRows.length} row{messageRateRows.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {#if unknownMessageRateIds.length > 0}
        <Alert
          class="mt-4"
          description="Stored message-rate overrides could not be mapped to the current catalog."
          variant="danger"
        />
      {/if}

      {#if liveSettingsView.catalogPhase === "loading"}
        <Alert class="mt-4" description="Loading the available message-rate rows…" variant="info" />
      {/if}

      {#if liveSettingsView.catalogPhase !== "loading" && messageRateRows.length === 0}
        <Alert class="mt-4" description="No message-rate rows are available for this shell yet." variant="info" />
      {/if}

      <div class="mt-4 space-y-3">
        {#each messageRateRows as row (row.id)}
          <Card.Root
            as="article"
            surface="secondary"
            density="compact"
            data-row-state={row.stateKind}
            testId={`${appShellTestIds.telemetrySettingsRowPrefix}-${row.id}`}
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{row.name}</p>
                <HelperText size="xs" tone="muted" class="mt-1 uppercase tracking-wider">
                  MAVLink #<MonoValue value={row.id} size="xs" tone="muted" /> · default {formatHz(row.defaultRateHz)}
                </HelperText>
              </div>

              <Badge variant={badgeVariant(row.stateKind)} size="sm" shape="rounded">{row.stateLabel}</Badge>
            </div>

            <Field.Root class="mt-4 sm:max-w-xs" invalid={Boolean(row.error)}>
              <Field.Label for={`message-rate-${row.id}`}>Rate</Field.Label>
              <NumberInput
                disabled={row.disabled || isApplying}
                id={`message-rate-${row.id}`}
                inputTestId={`${appShellTestIds.telemetrySettingsRowInputPrefix}-${row.id}`}
                inputmode="decimal"
                invalid={Boolean(row.error)}
                max={MESSAGE_RATE_HZ_LIMITS.max}
                min={MESSAGE_RATE_HZ_LIMITS.min}
                oninput={(event) => handleMessageRateInput(row.id, (event.currentTarget as HTMLInputElement).value)}
                placeholder={`default ${row.defaultRateHz}`}
                step="0.1"
                unit="Hz"
                value={numberInputValue(row.inputValue)}
              />
            </Field.Root>

            <HelperText size="xs" tone="muted" class="mt-2">
              Confirmed · {row.confirmedRateHz === null ? `default ${formatHz(row.defaultRateHz)}` : formatHz(row.confirmedRateHz)}
              {#if row.draftRateHz !== row.confirmedRateHz}
                · draft {row.draftRateHz === null ? `default ${formatHz(row.defaultRateHz)}` : formatHz(row.draftRateHz)}
              {/if}
            </HelperText>

            {#if row.disabledReason}
              <HelperText size="xs" tone="muted" class="mt-2">{row.disabledReason}</HelperText>
            {/if}

            {#if row.error}
              <Alert
                class="mt-3"
                density="compact"
                description={row.error}
                testId={`${appShellTestIds.telemetrySettingsRowErrorPrefix}-${row.id}`}
                variant="danger"
              />
            {/if}
          </Card.Root>
        {/each}
      </div>
    </Card.Root>
  </div>
{/snippet}

{#snippet footer()}
  <ActionRow align="end" class="w-full">
    <Button
      disabled={!canDiscard}
      onclick={discardChanges}
      testId={appShellTestIds.telemetrySettingsDiscard}
      variant="outline"
    >
      Discard changes
    </Button>

    <Button
      disabled={!canApply}
      loading={isApplying}
      onclick={() => void applyChanges()}
      testId={appShellTestIds.telemetrySettingsApply}
    >
      {isApplying ? "Applying…" : "Apply settings"}
    </Button>
  </ActionRow>
{/snippet}

<Dialog.Root {open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
  {#if surfaceKind === "sheet"}
    <Sheet.Content
      aria-label="Telemetry settings"
      class="gap-4"
      data-surface-kind="sheet"
      data-testid={appShellTestIds.telemetrySettingsDialog}
      showClose={false}
      side="bottom"
    >
      <Sheet.Header>
        <Eyebrow>Telemetry controls</Eyebrow>
        <Sheet.Title>Telemetry controls</Sheet.Title>
        <Sheet.Description>Stage telemetry cadence and live message-rate edits here, then explicitly apply or discard them.</Sheet.Description>
        <Sheet.Close
          ariaLabel="Close"
          class="absolute right-3 top-3 w-8 px-0"
          data-testid={appShellTestIds.telemetrySettingsClose}
        />
      </Sheet.Header>
      <div class="overflow-auto">{@render body()}</div>
      <Sheet.Footer>{@render footer()}</Sheet.Footer>
    </Sheet.Content>
  {:else}
    <Dialog.Content
      aria-label="Telemetry settings"
      class="gap-4"
      data-surface-kind="dialog"
      data-testid={appShellTestIds.telemetrySettingsDialog}
      showClose={false}
      size="lg"
    >
      <Dialog.Header>
        <Eyebrow>Telemetry controls</Eyebrow>
        <Dialog.Title>Telemetry controls</Dialog.Title>
        <Dialog.Description>Stage telemetry cadence and live message-rate edits here, then explicitly apply or discard them.</Dialog.Description>
        <Dialog.Close
          ariaLabel="Close"
          class="absolute right-3 top-3 w-8 px-0"
          data-testid={appShellTestIds.telemetrySettingsClose}
        />
      </Dialog.Header>
      <div class="overflow-auto">{@render body()}</div>
      <Dialog.Footer>{@render footer()}</Dialog.Footer>
    </Dialog.Content>
  {/if}
</Dialog.Root>
