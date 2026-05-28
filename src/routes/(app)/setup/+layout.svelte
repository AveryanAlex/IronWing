<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { Download, Plug, X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSetupWorkspaceViewStoreContext } from "../../../app/shell/runtime-context";
import { Button, EmptyState, HelperText, Progress } from "../../../components/ui";
import SetupWorkspaceShell from "../../../features/setup/components/SetupWorkspaceShell.svelte";
import { setupWorkspaceTestIds } from "../../../features/setup/setup-workspace-test-ids";
import SetupCard from "../../../features/setup/shared/SetupCard.svelte";
import SetupContentPanel from "../../../features/setup/shared/SetupContentPanel.svelte";
import { setupSectionForPath, setupSectionPath, type SetupSectionId } from "../../../lib/setup-sections";
import { paramProgressCounts, paramProgressPhase } from "../../../params";

let { children }: { children: Snippet } = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);
const setupWorkspaceViewStore = fromStore(getSetupWorkspaceViewStoreContext());

let requestedSectionId = $derived(setupSectionForPath(page.url.pathname) ?? "overview");
let view = $derived(setupWorkspaceViewStore.current);
let paramsReady = $derived(paramsState.current.paramStore !== null);
let setupGateMode = $derived(
  !view.liveSessionConnected || view.activeSource !== "live" ? "disconnected" : paramsReady ? "ready" : "needs_params",
);
let downloadActionBusy = $state(false);
let downloadActionMessage = $state("Download the current vehicle parameter list to unlock setup editors.");
let refreshDisabled = $derived(downloadActionBusy || !view.liveSessionConnected);
let paramProgress = $derived(paramsState.current.paramProgress);
let paramProgressPhaseValue = $derived(paramProgress ? paramProgressPhase(paramProgress) : null);
let paramProgressCountsValue = $derived(paramProgress ? paramProgressCounts(paramProgress) : null);
let downloadInFlight = $derived(paramProgressPhaseValue === "downloading");
let downloadProgressPct = $derived.by(() => {
  if (!downloadInFlight || !paramProgressCountsValue?.expected || paramProgressCountsValue.expected <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, Math.round((paramProgressCountsValue.received / paramProgressCountsValue.expected) * 100)),
  );
});

function navigateToSetupSection(sectionId: SetupSectionId) {
  return goto(resolve(setupSectionPath(sectionId)));
}

async function handleDownloadParameters() {
  if (refreshDisabled) {
    return;
  }

  downloadActionBusy = true;
  downloadActionMessage = "Requesting a fresh parameter download from the vehicle.";
  try {
    await paramsStore.downloadAll();
    downloadActionMessage = "Parameter download requested.";
  } catch (error) {
    downloadActionMessage = `Download failed: ${formatActionError(error)}`;
  } finally {
    downloadActionBusy = false;
  }
}

async function handleCancelDownload() {
  try {
    await paramsStore.cancelDownload();
  } catch (error) {
    downloadActionMessage = `Cancel failed: ${formatActionError(error)}`;
  }
}

function formatActionError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown parameter action error.";
}
</script>

<SetupWorkspaceShell {requestedSectionId} {navigateToSetupSection}>
  {#if setupGateMode === "ready"}
    {@render children()}
  {:else}
    <SetupContentPanel>
      {#if setupGateMode === "disconnected"}
        {#snippet disconnectedIcon()}
          <Plug aria-hidden="true" size={30} />
        {/snippet}
        <EmptyState
          icon={disconnectedIcon}
          title="Connect vehicle to get started"
          description="Setup editors unlock after IronWing connects to a live vehicle session."
          testId={setupWorkspaceTestIds.overviewBanner}
        />
      {:else}
        <SetupCard class="border-accent/30 bg-accent/5 px-6 py-8 text-center" testId={setupWorkspaceTestIds.overviewBanner}>
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Download aria-hidden="true" size={24} />
          </div>
          <h3 class="mt-6 text-2xl font-semibold text-text-primary">Download parameters</h3>
          <p class="mx-auto mt-4 max-w-2xl text-sm leading-7 text-text-secondary">
            Download the current vehicle parameter list to unlock setup editors.
          </p>

          <div class="mt-6 flex justify-center">
            {#if downloadInFlight}
              <Button
                tone="danger"
                variant="soft"
                onclick={handleCancelDownload}
              >
                <X aria-hidden="true" size={16} />
                Cancel
              </Button>
            {:else}
              <Button
                disabled={refreshDisabled}
                onclick={handleDownloadParameters}
              >
                <Download aria-hidden="true" size={16} />
                Download parameters
              </Button>
            {/if}
          </div>

          {#if downloadInFlight}
            <div class="mx-auto mt-5 max-w-sm">
              <Progress value={downloadProgressPct} ariaLabel="Parameter download progress" />
              <HelperText class="mt-2" tone="muted">
                {paramProgressCountsValue?.received ?? 0} / {paramProgressCountsValue?.expected ?? "?"} parameters
              </HelperText>
            </div>
          {/if}

          <HelperText class="mt-4" tone="muted">{downloadActionMessage}</HelperText>
        </SetupCard>
      {/if}
    </SetupContentPanel>
  {/if}
</SetupWorkspaceShell>
