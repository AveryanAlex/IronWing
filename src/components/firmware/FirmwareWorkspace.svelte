<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { readable, type Readable } from "svelte/store";

import type { ShellChromeState } from "../../app/shell/chrome-state";
import { getShellChromeStoreContext } from "../../app/shell/runtime-context";
import { createFirmwareFileIo, type FirmwareFileIo } from "../../lib/firmware-file-io";
import {
  createFirmwareService,
  type FirmwareService,
} from "../../lib/platform/firmware";
import {
  createFirmwareWorkspaceStore,
  type FirmwareWorkspaceStore,
} from "../../lib/stores/firmware-workspace";
import FirmwareOutcomePanel from "./FirmwareOutcomePanel.svelte";
import FirmwareSerialPanel from "./FirmwareSerialPanel.svelte";
import {
  firmwareWorkspaceFallbackChromeState,
  resolveFirmwareWorkspaceLayout,
} from "./firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";

const internalService = createFirmwareService();
const internalStore = createFirmwareWorkspaceStore(internalService);
const internalFileIo = createFirmwareFileIo();

function resolveChromeStore(): Readable<ShellChromeState> {
  try {
    return getShellChromeStoreContext();
  } catch {
    return readable(firmwareWorkspaceFallbackChromeState);
  }
}

type Props = {
  store?: FirmwareWorkspaceStore;
  service?: FirmwareService;
  fileIo?: FirmwareFileIo;
  chromeStore?: Readable<ShellChromeState>;
};

let {
  store = internalStore,
  service = internalService,
  fileIo = internalFileIo,
  chromeStore = resolveChromeStore(),
}: Props = $props();

let state = $derived($store);
let shellChrome = $derived($chromeStore);
let layout = $derived(resolveFirmwareWorkspaceLayout(shellChrome));

onMount(() => {
  void store.initialize();
});

onDestroy(() => {
  if (store === internalStore) {
    store.reset();
  }
});
</script>

<section
  class="rounded-[28px] border border-border bg-bg-primary p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
  data-actions-enabled={layout.actionsEnabled ? "true" : "false"}
  data-layout-mode={layout.mode}
  data-testid={firmwareWorkspaceTestIds.root}
>
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Firmware workspace</p>
      <h2 class="mt-2 text-2xl font-semibold text-text-primary">Expert serial install surface</h2>
      <p class="mt-2 max-w-4xl text-sm leading-relaxed text-text-secondary">
        Browse official catalog targets first, force a manual target only when proof is missing or uncertain, and keep every readiness or outcome fact mounted in the workspace.
      </p>
    </div>

    <div
      class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-accent"
      data-testid={firmwareWorkspaceTestIds.mode}
    >
      install-update
    </div>
  </div>

  {#if !layout.actionsEnabled}
    <div
      class="mt-4 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
      data-testid={firmwareWorkspaceTestIds.blockedCopy}
    >
      <p class="font-semibold" data-testid={firmwareWorkspaceTestIds.blockedReason}>{layout.blockedTitle}</p>
      <p class="mt-1">{layout.blockedDetail}</p>
    </div>
  {/if}

  <section class="mt-4 grid gap-2 lg:grid-cols-3">
    <p
      class="rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={firmwareWorkspaceTestIds.layoutMode}
    >
      Layout · {layout.mode}
    </p>
    <p
      class="rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={firmwareWorkspaceTestIds.layoutTier}
    >
      Shell tier · {layout.tier} · {layout.width}×{layout.height}
    </p>
    <p
      class="rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={firmwareWorkspaceTestIds.layoutTierMismatch}
    >
      Tier sync · {layout.tierMismatch ? "mismatch" : "match"}
    </p>
  </section>

  <div class="mt-4 grid gap-4">
    <FirmwareSerialPanel {fileIo} layout={layout} {service} {store} />
    <FirmwareOutcomePanel state={state} {store} />
  </div>
</section>
