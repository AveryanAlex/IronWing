<script lang="ts">
import type { MissionMapView } from "../../lib/mission-map-view";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type LocalMapMessage = {
  tone: "warning" | "info";
  text: string;
};

type Props = {
  mode: MissionMapView["mode"];
  counts: MissionMapView["counts"];
  readOnly: boolean;
  localMessage: LocalMapMessage | null;
  diagnostics: string[];
  debugPayload: unknown;
};

let {
  mode,
  counts,
  readOnly,
  localMessage,
  diagnostics,
  debugPayload,
}: Props = $props();
</script>

{#if localMessage && localMessage.tone === "info"}
  <div class="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
    {localMessage.text}
  </div>
{/if}

<div class="mission-map__stats-grid mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
  <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Markers</p>
    <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapMarkerCount}>{counts.markers}</p>
  </div>
  <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Path features</p>
    <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapPathCount}>{counts.missionFeatures}</p>
  </div>
  <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Survey features</p>
    <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapSurveyCount}>{counts.surveyFeatures}</p>
  </div>
  {#if mode === "fence"}
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Fence features</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapFenceCount}>{counts.fenceFeatures}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Fence vertices</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapFenceVertexCount}>{counts.fenceVertexHandles}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Return point</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapFenceReturnPointState}>{counts.fenceHasReturnPoint ? "set" : "none"}</p>
    </div>
  {:else if mode === "rally"}
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Rally markers</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapRallyCount}>{counts.rallyMarkers}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Rally features</p>
      <p class="mt-1 text-sm font-semibold text-text-primary">{counts.rallyFeatures}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Read-only truth</p>
      <p class="mt-1 text-sm font-semibold text-text-primary">{readOnly ? "blocked" : "editable"}</p>
    </div>
  {:else}
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Preview features</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapPreviewCount}>{counts.surveyPreviewFeatures}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Survey handles</p>
      <p class="mt-1 text-sm font-semibold text-text-primary">{counts.surveyHandles}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Editable vertices</p>
      <p class="mt-1 text-sm font-semibold text-text-primary">{counts.surveyVertexHandles}</p>
    </div>
  {/if}
</div>

{#if diagnostics.length > 0}
  <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
    <p class="font-semibold">Map diagnostics</p>
    <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
      {#each diagnostics as warning (`${warning}`)}
        <li>{warning}</li>
      {/each}
    </ul>
  </div>
{/if}

<pre class="sr-only" data-testid={missionWorkspaceTestIds.mapDebug}>{JSON.stringify(debugPayload)}</pre>
