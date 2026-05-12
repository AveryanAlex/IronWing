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
import { Dialog } from "../../components/ui";
import { appShellTestIds } from "./chrome-state";
import { getLiveSettingsStoreContext } from "./runtime-context";

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

function statusClass(kind: DialogStatusKind) {
  switch (kind) {
    case "success":
      return "border-success/30 bg-success/10 text-success";
    case "pending":
      return "border-accent/30 bg-accent/10 text-accent";
    case "error":
      return "border-danger/30 bg-danger/10 text-danger";
    default:
      return "border-border bg-bg-primary/70 text-text-secondary";
  }
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
      class={`rounded-lg border px-4 py-3 ${statusClass(dialogStatus.kind)}`}
      data-status-kind={dialogStatus.kind}
      data-testid={appShellTestIds.telemetrySettingsStatus}
    >
      <p class="text-sm font-semibold">{dialogStatus.title}</p>
      <p class="mt-1 text-sm leading-6">{dialogStatus.description}</p>
    </div>

    <section class="rounded-lg border border-border bg-bg-primary/70 p-3 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="runtime-eyebrow">Shell cadence</p>
          <h3 class="mt-1 text-base font-semibold text-text-primary">Telemetry cadence</h3>
          <p class="mt-1 text-sm leading-6 text-text-secondary">
            Adjust the shell telemetry cadence without waiting for a live vehicle connection.
          </p>
        </div>

        <span class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          {formatHz(liveSettingsView.confirmedSettings.telemetryRateHz)} confirmed
        </span>
      </div>

      <div class="mt-4 grid gap-2 sm:max-w-xs">
        <label class="text-sm font-semibold text-text-primary" for="telemetry-rate-hz">Cadence (Hz)</label>
        <input
          class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/50"
          data-testid={appShellTestIds.telemetrySettingsTelemetryInput}
          id="telemetry-rate-hz"
          inputmode="numeric"
          max={TELEMETRY_RATE_HZ_LIMITS.max}
          min={TELEMETRY_RATE_HZ_LIMITS.min}
          oninput={(event) => handleTelemetryInput((event.currentTarget as HTMLInputElement).value)}
          step="1"
          type="number"
          value={telemetryRateInput}
        />
        <p class="text-xs uppercase tracking-[0.16em] text-text-muted">
          Allowed range · {TELEMETRY_RATE_HZ_LIMITS.min}–{TELEMETRY_RATE_HZ_LIMITS.max} Hz
        </p>
        {#if telemetryFieldError}
          <p
            class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            data-testid={appShellTestIds.telemetrySettingsTelemetryError}
          >
            {telemetryFieldError}
          </p>
        {/if}
      </div>
    </section>

    <section class="rounded-lg border border-border bg-bg-primary/70 p-3 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="runtime-eyebrow">Live vehicle overrides</p>
          <h3 class="mt-1 text-base font-semibold text-text-primary">Message-rate controls</h3>
          <p class="mt-1 text-sm leading-6 text-text-secondary">
            Blank restores the backend default. Confirmed overrides reapply on the next live connection.
          </p>
        </div>

        <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {messageRateRows.length} row{messageRateRows.length === 1 ? "" : "s"}
        </span>
      </div>

      {#if unknownMessageRateIds.length > 0}
        <div class="mt-4 rounded-[22px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          Stored message-rate overrides could not be mapped to the current catalog.
        </div>
      {/if}

      {#if liveSettingsView.catalogPhase === "loading"}
        <div class="mt-4 rounded-[22px] border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
          Loading the available message-rate rows…
        </div>
      {/if}

      {#if liveSettingsView.catalogPhase !== "loading" && messageRateRows.length === 0}
        <div class="mt-4 rounded-[22px] border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
          No message-rate rows are available for this shell yet.
        </div>
      {/if}

      <div class="mt-4 space-y-3">
        {#each messageRateRows as row (row.id)}
          <article
            class="rounded-lg border border-border bg-bg-secondary/90 p-3"
            data-row-state={row.stateKind}
            data-testid={`${appShellTestIds.telemetrySettingsRowPrefix}-${row.id}`}
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{row.name}</p>
                <p class="mt-1 text-xs uppercase tracking-[0.16em] text-text-muted">
                  MAVLink #{row.id} · default {formatHz(row.defaultRateHz)}
                </p>
              </div>

              <span class={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${statusClass(row.stateKind)}`}>
                {row.stateLabel}
              </span>
            </div>

            <div class="mt-4 grid gap-2 sm:max-w-xs">
              <label class="text-sm font-semibold text-text-primary" for={`message-rate-${row.id}`}>
                Rate (Hz)
              </label>
              <input
                class="rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`${appShellTestIds.telemetrySettingsRowInputPrefix}-${row.id}`}
                disabled={row.disabled || isApplying}
                id={`message-rate-${row.id}`}
                inputmode="decimal"
                max={MESSAGE_RATE_HZ_LIMITS.max}
                min={MESSAGE_RATE_HZ_LIMITS.min}
                oninput={(event) => handleMessageRateInput(row.id, (event.currentTarget as HTMLInputElement).value)}
                placeholder={`default ${row.defaultRateHz}`}
                step="0.1"
                type="number"
                value={row.inputValue}
              />
            </div>

            <p class="mt-2 text-xs leading-5 text-text-muted">
              Confirmed · {row.confirmedRateHz === null ? `default ${formatHz(row.defaultRateHz)}` : formatHz(row.confirmedRateHz)}
              {#if row.draftRateHz !== row.confirmedRateHz}
                · draft {row.draftRateHz === null ? `default ${formatHz(row.defaultRateHz)}` : formatHz(row.draftRateHz)}
              {/if}
            </p>

            {#if row.disabledReason}
              <p class="mt-2 text-xs leading-5 text-text-muted">{row.disabledReason}</p>
            {/if}

            {#if row.error}
              <p
                class="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                data-testid={`${appShellTestIds.telemetrySettingsRowErrorPrefix}-${row.id}`}
              >
                {row.error}
              </p>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  </div>
{/snippet}

{#snippet footer()}
  <button
    class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
    data-testid={appShellTestIds.telemetrySettingsDiscard}
    disabled={!canDiscard}
    onclick={discardChanges}
    type="button"
  >
    Discard changes
  </button>

  <button
    class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    data-testid={appShellTestIds.telemetrySettingsApply}
    disabled={!canApply}
    onclick={() => void applyChanges()}
    type="button"
  >
    {isApplying ? "Applying…" : "Apply settings"}
  </button>
{/snippet}

<Dialog
  ariaLabel="Telemetry settings"
  body={body}
  description="Stage telemetry cadence and live message-rate edits here, then explicitly apply or discard them."
  footer={footer}
  onClose={onClose}
  open={open}
  testId={appShellTestIds.telemetrySettingsDialog}
  title="Telemetry controls"
/>
