<script lang="ts">
import { resolve } from "$app/paths";
import {
  CircleAlert,
  Fingerprint,
  FolderDown,
  FolderUp,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../app/shell/runtime-context";
import { requestPrearmChecks } from "../../../calibration";
import { ActionRow, Badge, Button, Eyebrow, HelperText } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../../../features/setup/setup-workspace-test-ids";
import { getSetupWorkspaceRouteContext } from "../../../features/setup/components/setup-workspace-route-context";
import SetupContentPanel from "../../../features/setup/shared/SetupContentPanel.svelte";
import SetupFieldStack from "../../../features/setup/shared/SetupFieldStack.svelte";
import SetupIntroCard from "../../../features/setup/shared/SetupIntroCard.svelte";
import SetupNotice from "../../../features/setup/shared/SetupNotice.svelte";
import SetupSectionCard from "../../../features/setup/shared/SetupSectionCard.svelte";
import { trackAnalytics } from "../../../lib/analytics/client";
import { notifyInfo, notifySuccess, notifyUnknownError } from "../../../lib/notifications";
import { createParameterFileIo } from "../../../lib/params/parameter-file-io";
import { buildSetupOverviewModel, type SetupOverviewSafetyFinding } from "../../../lib/setup/overview-model";
import { derivePrearmModel, type PrearmSnapshot } from "../../../lib/setup/prearm-model";
import { setupSectionPath, type SetupSectionId } from "../../../lib/setup-sections";
import { armVehicle, disarmVehicle } from "../../../telemetry";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);
const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);
const fileIo = createParameterFileIo();

let view = $derived(viewStore.current);
let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let fileActionBusy = $state<"refresh" | "save" | "load" | null>(null);
let prearmSnapshot = $state<PrearmSnapshot | null>(null);
let requestPhase = $state<"idle" | "running">("idle");
let actionPhase = $state<"idle" | "arming" | "disarming">("idle");
let confirmArm = $state(false);

let paramsReady = $derived(params.paramStore !== null);
let refreshDisabled = $derived(fileActionBusy !== null || !params.liveSessionConnected);
let fileDisabled = $derived(fileActionBusy !== null || !paramsReady);
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let armed = $derived(session.sessionDomain.value?.vehicle_state?.armed === true);
let vehicleType = $derived(params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let overviewModel = $derived(
  buildSetupOverviewModel({
    vehicleType,
    firmwareVersion: params.firmwareVersion,
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
  }),
);
let prearmModel = $derived(
  derivePrearmModel({
    scopeKey: view.activeScopeKey,
    liveConnected: session.sessionDomain.value?.connection.kind === "connected",
    armed,
    support: session.support,
    sensorHealth: session.sensorHealth,
    statusText: session.statusText,
    previousSnapshot: prearmSnapshot,
  }),
);

$effect(() => {
  const nextSnapshot = prearmModel.snapshot;
  if (!nextSnapshot) {
    return;
  }

  const currentIds = prearmSnapshot?.blockers.map((blocker) => blocker.id).join("|") ?? "";
  const nextIds = nextSnapshot.blockers.map((blocker) => blocker.id).join("|");
  if (prearmSnapshot?.scopeKey !== nextSnapshot.scopeKey || currentIds !== nextIds) {
    prearmSnapshot = nextSnapshot;
  }
});

$effect(() => {
  if (armed) {
    confirmArm = false;
  }
});

async function handleRefresh() {
  if (refreshDisabled) {
    return;
  }

  fileActionBusy = "refresh";
  try {
    await paramsStore.downloadAll();
    notifyInfo("Parameter refresh requested", {
      id: "setup-parameter-refresh-requested",
    });
  } catch (error) {
    notifyUnknownError("Parameter refresh failed", error, {
      id: "setup-parameter-refresh-failed",
    });
  } finally {
    fileActionBusy = null;
  }
}

async function handleSave() {
  if (fileDisabled) {
    return;
  }

  fileActionBusy = "save";
  try {
    const result = await fileIo.exportToPicker({ paramStore: params.paramStore });
    if (result.status !== "cancelled") {
      notifySuccess("Parameter file saved", {
        description: `${result.paramCount} parameter${result.paramCount === 1 ? "" : "s"} exported.`,
        id: "setup-parameter-file-saved",
      });
    }
  } catch (error) {
    notifyUnknownError("Could not save parameter file", error, {
      id: "setup-parameter-file-save-failed",
    });
  } finally {
    fileActionBusy = null;
  }
}

async function handleLoad() {
  if (fileDisabled) {
    return;
  }

  fileActionBusy = "load";
  try {
    const result = await fileIo.importFromPicker({
      paramStore: params.paramStore,
      metadata: params.metadata,
    });
    if (result.status === "success") {
      for (const row of result.stagedRows) {
        paramsStore.stageParameterEdit(row.item, row.nextValue);
      }
      notifySuccess("Parameter file loaded", {
        description: `${result.totalRows} row${result.totalRows === 1 ? "" : "s"} read; ${result.stagedCount} changed value${result.stagedCount === 1 ? "" : "s"} staged for review.`,
        id: "setup-parameter-file-loaded",
      });
    }
  } catch (error) {
    notifyUnknownError("Could not load parameter file", error, {
      id: "setup-parameter-file-load-failed",
    });
  } finally {
    fileActionBusy = null;
  }
}

async function handleRequestChecks() {
  if (actionsBlocked || !prearmModel.canRequestChecks || requestPhase === "running") {
    return;
  }

  requestPhase = "running";
  trackAnalytics("prearm_checks_requested", {
    connected: session.sessionDomain.value?.connection.kind === "connected" ? 1 : 0,
  });
  try {
    await requestPrearmChecks();
  } catch (error) {
    notifyUnknownError("Pre-arm check request failed", error, {
      id: "setup-prearm-check-request-failed",
    });
  } finally {
    requestPhase = "idle";
  }
}

async function handleArm() {
  if (actionsBlocked || !prearmModel.canAttemptArm || actionPhase !== "idle") {
    return;
  }

  if (!confirmArm) {
    confirmArm = true;
    return;
  }

  actionPhase = "arming";
  trackAnalytics("arming_command_requested", { action: "arm", force: 0 });
  try {
    await armVehicle(false);
    confirmArm = false;
  } catch (error) {
    notifyUnknownError("Arm request failed", error, {
      id: "setup-arm-request-failed",
    });
  } finally {
    actionPhase = "idle";
  }
}

async function handleDisarm() {
  if (actionsBlocked || !prearmModel.canAttemptDisarm || actionPhase !== "idle") {
    return;
  }

  actionPhase = "disarming";
  trackAnalytics("arming_command_requested", { action: "disarm", force: 0 });
  try {
    await disarmVehicle(false);
  } catch (error) {
    notifyUnknownError("Disarm request failed", error, {
      id: "setup-disarm-request-failed",
    });
  } finally {
    actionPhase = "idle";
  }
}

function findingStateLabel(state: SetupOverviewSafetyFinding["state"]): string {
  switch (state) {
    case "pending_resolution":
      return "Fix staged";
    case "pending_introduction":
      return "Staged risk";
    case "active":
    default:
      return "Active";
  }
}

function findingStateTone(finding: SetupOverviewSafetyFinding): "warning" | "danger" | "success" {
  if (finding.state === "pending_resolution") {
    return "success";
  }

  return finding.tone;
}

function handleSetupLinkClick(sectionId: SetupSectionId, event: MouseEvent) {
  route.handleSectionLinkClick(sectionId, event);
}
</script>

{#snippet requestChecksAction()}
  <Button
    variant="outline"
    testId={setupWorkspaceTestIds.overviewPrearmRefresh}
    disabled={actionsBlocked || !prearmModel.canRequestChecks || requestPhase === "running"}
    onclick={handleRequestChecks}
  >
    {requestPhase === "running" ? "Requesting checks…" : "Request pre-arm checks"}
  </Button>
{/snippet}

<section class="space-y-4" data-testid={setupWorkspaceTestIds.overviewSection}>
  <SetupIntroCard
    sectionId="overview"
    title="Overview"
    description="Confirm the active configuration, resolve pre-arm issues, and manage parameter snapshots."
  />

  <SetupContentPanel>
    <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <SetupSectionCard
        icon={Fingerprint}
        title="Active configuration"
        description="Applied values for the vehicle currently in this setup scope. Staged edits remain in the review tray until applied."
        surface="elevated"
        testId={setupWorkspaceTestIds.overviewIdentity}
      >
        <dl class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-md border border-border bg-bg-secondary/60 p-3">
            <dt><Eyebrow tracking="widest">Vehicle</Eyebrow></dt>
            <dd class="mt-2 text-sm font-semibold text-text-primary">{overviewModel.identity.vehicle}</dd>
          </div>
          <div class="rounded-md border border-border bg-bg-secondary/60 p-3">
            <dt><Eyebrow tracking="widest">Firmware</Eyebrow></dt>
            <dd class="mt-2 text-sm font-semibold text-text-primary">{overviewModel.identity.firmware}</dd>
          </div>
          <div class="rounded-md border border-border bg-bg-secondary/60 p-3">
            <dt><Eyebrow tracking="widest">Frame</Eyebrow></dt>
            <dd class="mt-2 text-sm font-semibold text-text-primary">{overviewModel.identity.frame}</dd>
          </div>
          <div class="rounded-md border border-border bg-bg-secondary/60 p-3">
            <dt><Eyebrow tracking="widest">Board orientation</Eyebrow></dt>
            <dd class="mt-2 text-sm font-semibold text-text-primary">{overviewModel.identity.orientation}</dd>
          </div>
        </dl>
      </SetupSectionCard>

      <SetupSectionCard
        icon={FolderDown}
        title="Parameter files"
        description="Refresh the active values or move a parameter snapshot through the staged review workflow."
        surface="elevated"
        testId={setupWorkspaceTestIds.overviewParameterActions}
      >
        <div class="grid gap-2">
          <Button variant="secondary" disabled={refreshDisabled} onclick={handleRefresh}>
            <RefreshCw aria-hidden="true" size={16} />
            {fileActionBusy === "refresh" ? "Refreshing..." : "Refresh all"}
          </Button>
          <Button variant="secondary" disabled={fileDisabled} onclick={handleSave}>
            <FolderUp aria-hidden="true" size={16} />
            {fileActionBusy === "save" ? "Saving..." : "Save to file"}
          </Button>
          <Button variant="secondary" disabled={fileDisabled} onclick={handleLoad}>
            <FolderDown aria-hidden="true" size={16} />
            {fileActionBusy === "load" ? "Loading..." : "Load from file"}
          </Button>
        </div>
        <HelperText size="xs" tone="muted">File imports never write immediately; changed values are staged for review.</HelperText>
      </SetupSectionCard>
    </div>

    <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <SetupSectionCard
        icon={ShieldCheck}
        title="Pre-arm readiness"
        description="Live readiness for the connected vehicle scope. Re-run the checks after correcting a blocker."
        surface="elevated"
        testId={setupWorkspaceTestIds.overviewPrearmSummary}
        actions={requestChecksAction}
      >
        <div data-arming-state={prearmModel.state}>
          <p class="text-base font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.overviewPrearmReadiness}>
            {prearmModel.statusText}
          </p>
          <p class="mt-2 text-sm leading-6 text-text-secondary">{prearmModel.detailText}</p>

          {#if prearmModel.requestChecksBlockedReason}
            <p class="mt-3 text-xs leading-5 text-warning">{prearmModel.requestChecksBlockedReason}</p>
          {/if}
        </div>
      </SetupSectionCard>

      <SetupSectionCard icon={Power} title="Live arm control" surface="elevated" testId={setupWorkspaceTestIds.overviewArmControl}>
        <p class={`text-base font-semibold ${armed ? "text-danger" : "text-text-primary"}`}>
          {armed ? "Armed" : "Disarmed"}
        </p>
        <p class="mt-2 text-sm text-text-secondary">
          {armed
            ? "The vehicle currently reports ARMED. Disarm immediately if conditions become unsafe."
            : prearmModel.canAttemptArm
              ? "Current pre-arm state allows an arm request."
              : "Arm stays blocked until the vehicle reports a healthy pre-arm state."}
        </p>

        <ActionRow align="start" class="mt-4">
          {#if armed}
            <Button
              variant="destructive"
              testId={setupWorkspaceTestIds.overviewDisarm}
              disabled={actionsBlocked || !prearmModel.canAttemptDisarm || actionPhase !== "idle"}
              onclick={handleDisarm}
            >
              {actionPhase === "disarming" ? "Disarming…" : "Disarm"}
            </Button>
          {:else}
            <Button
              tone="success"
              variant="soft"
              testId={setupWorkspaceTestIds.overviewArm}
              disabled={actionsBlocked || (!confirmArm && !prearmModel.canAttemptArm) || actionPhase !== "idle"}
              onclick={handleArm}
            >
              {#if actionPhase === "arming"}
                Arming…
              {:else if confirmArm}
                Confirm arm
              {:else}
                Arm
              {/if}
            </Button>
            {#if confirmArm}
              <Button variant="secondary" onclick={() => (confirmArm = false)}>Cancel</Button>
            {/if}
          {/if}
        </ActionRow>
      </SetupSectionCard>
    </div>

    {#if prearmModel.blockers.length > 0}
      <SetupSectionCard
        icon={CircleAlert}
        title="Current pre-arm blockers"
        description="Repeated vehicle messages are collapsed; distinct issues in the same subsystem remain separate."
        surface="elevated"
        testId={setupWorkspaceTestIds.overviewPrearmBlockers}
      >
        <SetupFieldStack divided>
          {#each prearmModel.blockers as blocker (blocker.id)}
            <div class="flex items-start justify-between gap-3 pt-3 first:pt-0">
              <div>
                <p class="text-sm font-semibold text-text-primary">{blocker.category}</p>
                <p class="mt-1 text-sm text-text-secondary">{blocker.rawText}</p>
                <p class="mt-2 text-xs leading-5 text-text-muted">{blocker.guidance}</p>
              </div>
              {#if blocker.stale}
                <Badge variant="warning">stale</Badge>
              {/if}
            </div>
          {/each}
        </SetupFieldStack>
      </SetupSectionCard>
    {/if}

    <SetupSectionCard
      icon={ShieldAlert}
      title="Safety configuration audit"
      description="Checks applied and staged arming, failsafe, return, and fence settings. Findings do not replace a complete pre-flight inspection."
      surface="elevated"
      testId={setupWorkspaceTestIds.overviewSafetyAudit}
    >
      {#if overviewModel.safetyFindings.length === 0}
        <SetupNotice tone="success" testId={setupWorkspaceTestIds.overviewSafetyClear}>
          No high-risk exceptions were found in the checked arming, failsafe, return, and fence settings.
        </SetupNotice>
      {:else}
        <div class="grid gap-2">
          {#each overviewModel.safetyFindings as finding (finding.id)}
            <SetupNotice
              tone={finding.tone}
              testId={`${setupWorkspaceTestIds.overviewSafetyFindingPrefix}-${finding.id}`}
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold text-text-primary">{finding.title}</span>
                    <Badge tone={findingStateTone(finding)} size="xs" case="normal">
                      {findingStateLabel(finding.state)}
                    </Badge>
                  </div>
                  <p class="mt-1">{finding.detail}</p>
                  {#if finding.state === "pending_resolution"}
                    <p class="mt-1 text-text-muted">The risk remains active until the staged fix is applied successfully.</p>
                  {:else if finding.state === "pending_introduction"}
                    <p class="mt-1 text-text-muted">Applying the staged changes would introduce this risk.</p>
                  {/if}
                </div>
                <a
                  class="shrink-0 text-xs font-semibold text-accent underline-offset-2 hover:underline"
                  href={resolve(setupSectionPath(finding.sectionId))}
                  onclick={(event) => handleSetupLinkClick(finding.sectionId, event)}
                >
                  Review {finding.sectionId === "rtl_return" ? "RTL / Return" : finding.sectionId}
                </a>
              </div>
            </SetupNotice>
          {/each}
        </div>
      {/if}
    </SetupSectionCard>
  </SetupContentPanel>
</section>
