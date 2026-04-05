<script lang="ts">
import {
  addRecentCameraWithStatus,
  deleteCustomCameraWithStatus,
  getCameraCatalogState,
  saveCustomCameraWithStatus,
  type CameraCatalogActionResult,
  type CatalogCamera,
} from "../../lib/survey-camera-catalog";
import type { SurveyRegion } from "../../lib/survey-region";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type PickerMessageTone = "success" | "warning" | "info";
type PickerMessage = {
  tone: PickerMessageTone;
  text: string;
};

type Props = {
  region: SurveyRegion;
  onSelectCamera: (camera: CatalogCamera) => void;
};

type CustomCameraForm = {
  canonicalName: string;
  brand: string;
  model: string;
  sensorWidth_mm: string;
  sensorHeight_mm: string;
  imageWidth_px: string;
  imageHeight_px: string;
  focalLength_mm: string;
  minTriggerInterval_s: string;
  landscape: boolean;
  fixedOrientation: boolean;
};

const EMPTY_FORM: CustomCameraForm = {
  canonicalName: "",
  brand: "",
  model: "",
  sensorWidth_mm: "",
  sensorHeight_mm: "",
  imageWidth_px: "",
  imageHeight_px: "",
  focalLength_mm: "",
  minTriggerInterval_s: "",
  landscape: true,
  fixedOrientation: false,
};

let { region, onSelectCamera }: Props = $props();

let query = $state("");
let showCustomForm = $state(false);
let customForm = $state<CustomCameraForm>({ ...EMPTY_FORM });
let pickerMessage = $state<PickerMessage | null>(null);
let catalogState = $state(getCameraCatalogState());

let customCameraNames = $derived(new Set(catalogState.custom.map((camera) => camera.canonicalName)));
let visibleResults = $derived.by(() => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const source = normalizedQuery.length === 0
    ? catalogState.all
    : catalogState.all.filter((camera) => {
      const haystack = [camera.brand, camera.model, camera.canonicalName]
        .join("\n")
        .toLocaleLowerCase();
      return haystack.includes(normalizedQuery);
    });

  return source.slice(0, 18);
});
let unresolvedCameraMessage = $derived.by(() => {
  if (region.camera) {
    return null;
  }

  if (region.cameraId) {
    return `Imported camera \"${region.cameraId}\" is unavailable in the active catalog. Choose a valid builtin or custom camera before generating.`;
  }

  if (region.qgcPassthrough) {
    return "This imported survey region did not bring a reusable camera profile. Choose a valid camera before generating.";
  }

  return "Choose a valid camera before generating this survey region.";
});
let currentCameraLabel = $derived(region.camera?.canonicalName ?? region.cameraId ?? "No camera selected");
let combinedWarnings = $derived.by(() => {
  const warnings = [...catalogState.warnings];
  if (pickerMessage?.tone === "warning") {
    warnings.push(pickerMessage.text);
  }
  return [...new Set(warnings)];
});

function selectCamera(camera: CatalogCamera) {
  onSelectCamera(camera);
  applyCatalogActionResult(addRecentCameraWithStatus(camera.canonicalName), {
    successMessage: `Selected ${camera.canonicalName} for this survey region.`,
    warningFallback: `Selected ${camera.canonicalName}, but recent-camera history could not be saved.`,
  });
  reloadCatalogState();
}

function deleteCustomCamera(canonicalName: string) {
  applyCatalogActionResult(deleteCustomCameraWithStatus(canonicalName), {
    successMessage: `Removed ${canonicalName} from the custom camera catalog.`,
    warningFallback: `Could not delete ${canonicalName} from the custom camera catalog.`,
  });
  reloadCatalogState();
}

function saveCustomCamera() {
  const parsed = parseCustomCameraForm(customForm);
  if (!parsed.ok) {
    pickerMessage = {
      tone: "warning",
      text: parsed.message,
    };
    return;
  }

  const camera = parsed.camera;
  const result = saveCustomCameraWithStatus(camera);
  applyCatalogActionResult(result, {
    successMessage: `Saved ${camera.canonicalName} to the custom camera catalog.`,
    warningFallback: `Could not save ${camera.canonicalName} to the custom camera catalog.`,
  });
  reloadCatalogState();

  if (result.ok) {
    customForm = { ...EMPTY_FORM };
    showCustomForm = false;
    selectCamera(camera);
  }
}

function reloadCatalogState() {
  catalogState = getCameraCatalogState();
}

function applyCatalogActionResult(
  result: CameraCatalogActionResult,
  copy: { successMessage: string; warningFallback: string },
) {
  pickerMessage = result.ok
    ? {
      tone: "success",
      text: copy.successMessage,
    }
    : {
      tone: "warning",
      text: result.message ?? copy.warningFallback,
    };
}

function parseCustomCameraForm(form: CustomCameraForm):
  | { ok: true; camera: CatalogCamera }
  | { ok: false; message: string } {
  const canonicalName = form.canonicalName.trim();
  const brand = form.brand.trim();
  const model = form.model.trim();

  if (!canonicalName || !brand || !model) {
    return {
      ok: false,
      message: "Custom cameras require canonical name, brand, and model before they can be saved.",
    };
  }

  const sensorWidth = parsePositiveNumber(form.sensorWidth_mm);
  const sensorHeight = parsePositiveNumber(form.sensorHeight_mm);
  const imageWidth = parsePositiveNumber(form.imageWidth_px);
  const imageHeight = parsePositiveNumber(form.imageHeight_px);
  const focalLength = parsePositiveNumber(form.focalLength_mm);
  const minTriggerInterval = parseOptionalNonNegativeNumber(form.minTriggerInterval_s);

  if (
    sensorWidth === null
    || sensorHeight === null
    || imageWidth === null
    || imageHeight === null
    || focalLength === null
  ) {
    return {
      ok: false,
      message: "Custom cameras require valid positive sensor, image, and focal-length values before they can be saved.",
    };
  }

  if (form.minTriggerInterval_s.trim().length > 0 && minTriggerInterval === null) {
    return {
      ok: false,
      message: "Custom camera minimum trigger interval must be zero or greater.",
    };
  }

  return {
    ok: true,
    camera: {
      canonicalName,
      brand,
      model,
      sensorWidth_mm: sensorWidth,
      sensorHeight_mm: sensorHeight,
      imageWidth_px: imageWidth,
      imageHeight_px: imageHeight,
      focalLength_mm: focalLength,
      landscape: form.landscape,
      fixedOrientation: form.fixedOrientation,
      ...(minTriggerInterval === null ? {} : { minTriggerInterval_s: minTriggerInterval }),
    },
  };
}

function parsePositiveNumber(value: string): number | null {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNonNegativeNumber(value: string): number | null {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function pickerMessageClass(tone: PickerMessageTone): string {
  switch (tone) {
    case "warning":
      return "border-warning/40 bg-warning/10 text-warning";
    case "info":
      return "border-accent/30 bg-accent/10 text-text-primary";
    case "success":
    default:
      return "border-success/30 bg-success/10 text-success";
  }
}
</script>

<section class="space-y-3" data-testid={missionWorkspaceTestIds.cameraPicker}>
  <div class="rounded-2xl border border-border bg-bg-secondary/60 p-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Camera</p>
        <h4 class="mt-1 text-sm font-semibold text-text-primary">{currentCameraLabel}</h4>
      </div>

      {#if region.camera && customCameraNames.has(region.camera.canonicalName)}
        <span class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Custom
        </span>
      {:else if region.camera}
        <span class="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-success">
          Ready
        </span>
      {:else}
        <span class="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
          Missing
        </span>
      {/if}
    </div>

    {#if region.camera}
      <dl class="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div class="rounded-xl border border-border/70 bg-bg-primary px-3 py-2">
          <dt class="text-text-muted">Sensor</dt>
          <dd class="mt-1 font-medium text-text-primary">
            {region.camera.sensorWidth_mm} × {region.camera.sensorHeight_mm} mm
          </dd>
        </div>
        <div class="rounded-xl border border-border/70 bg-bg-primary px-3 py-2">
          <dt class="text-text-muted">Image</dt>
          <dd class="mt-1 font-medium text-text-primary">
            {region.camera.imageWidth_px} × {region.camera.imageHeight_px} px
          </dd>
        </div>
      </dl>
    {:else if unresolvedCameraMessage}
      <p class="mt-3 text-xs text-warning" data-testid={missionWorkspaceTestIds.cameraCurrent}>
        {unresolvedCameraMessage}
      </p>
    {/if}
  </div>

  {#if combinedWarnings.length > 0}
    <div
      class="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.cameraWarning}
    >
      <ul class="list-inside list-disc space-y-1 text-xs">
        {#each combinedWarnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if pickerMessage && pickerMessage.tone !== "warning"}
    <div class={`rounded-2xl border px-4 py-3 text-sm ${pickerMessageClass(pickerMessage.tone)}`}>
      {pickerMessage.text}
    </div>
  {/if}

  <label class="block space-y-1">
    <span class="text-xs font-medium text-text-muted">Search cameras</span>
    <input
      bind:value={query}
      class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
      data-testid={missionWorkspaceTestIds.cameraSearch}
      placeholder="Search builtin and custom cameras"
      type="search"
    />
  </label>

  {#if catalogState.recent.length > 0}
    <div class="rounded-2xl border border-border bg-bg-secondary/60 p-3">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Recent</p>
      <div class="mt-3 flex flex-wrap gap-2">
        {#each catalogState.recent as camera (camera.canonicalName)}
          <button
            class="rounded-full border border-border bg-bg-primary px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
            data-testid={missionWorkspaceTestIds.cameraRecentPrefix}
            onclick={() => selectCamera(camera)}
            type="button"
          >
            Use {camera.canonicalName}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="rounded-2xl border border-border bg-bg-secondary/60 p-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Catalog</p>
        <p class="mt-1 text-xs text-text-secondary">
          Matching builtin and custom profiles stay searchable without leaving the mission workspace.
        </p>
      </div>

      <button
        class="rounded-full border border-border bg-bg-primary px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={missionWorkspaceTestIds.cameraCustomToggle}
        onclick={() => {
          showCustomForm = !showCustomForm;
          pickerMessage = null;
        }}
        type="button"
      >
        {showCustomForm ? "Hide custom form" : "New custom camera"}
      </button>
    </div>

    <div class="mt-4 space-y-3">
      {#if visibleResults.length === 0}
        <div class="rounded-xl border border-dashed border-border bg-bg-primary px-3 py-4 text-sm text-text-secondary">
          No catalog cameras matched this search. Save a custom profile or clear the query to keep working.
        </div>
      {:else}
        {#each visibleResults as camera (camera.canonicalName)}
          <div class="rounded-xl border border-border/70 bg-bg-primary px-3 py-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h5 class="text-sm font-semibold text-text-primary">{camera.canonicalName}</h5>
                  {#if customCameraNames.has(camera.canonicalName)}
                    <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                      Custom
                    </span>
                  {/if}
                </div>
                <p class="mt-1 text-xs text-text-secondary">
                  {camera.brand} · {camera.model} · {camera.focalLength_mm} mm · {camera.imageWidth_px} × {camera.imageHeight_px} px
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  class="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:brightness-105"
                  onclick={() => selectCamera(camera)}
                  type="button"
                >
                  Use {camera.canonicalName}
                </button>
                {#if customCameraNames.has(camera.canonicalName)}
                  <button
                    class="rounded-full border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:brightness-105"
                    onclick={() => deleteCustomCamera(camera.canonicalName)}
                    type="button"
                  >
                    Delete {camera.canonicalName}
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if showCustomForm}
      <div class="mt-4 rounded-2xl border border-border/70 bg-bg-primary p-4">
        <div class="grid gap-3 md:grid-cols-2">
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Canonical name</span>
            <input bind:value={customForm.canonicalName} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomName} type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Brand</span>
            <input bind:value={customForm.brand} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomBrand} type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Model</span>
            <input bind:value={customForm.model} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomModel} type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Focal length (mm)</span>
            <input bind:value={customForm.focalLength_mm} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomFocal} inputmode="decimal" type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Sensor width (mm)</span>
            <input bind:value={customForm.sensorWidth_mm} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomSensorWidth} inputmode="decimal" type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Sensor height (mm)</span>
            <input bind:value={customForm.sensorHeight_mm} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomSensorHeight} inputmode="decimal" type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Image width (px)</span>
            <input bind:value={customForm.imageWidth_px} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomImageWidth} inputmode="numeric" type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Image height (px)</span>
            <input bind:value={customForm.imageHeight_px} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomImageHeight} inputmode="numeric" type="text" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Min trigger interval (s)</span>
            <input bind:value={customForm.minTriggerInterval_s} class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.cameraCustomMinTrigger} inputmode="decimal" type="text" />
          </label>
          <label class="flex items-center gap-2 rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary">
            <input bind:checked={customForm.landscape} type="checkbox" />
            Landscape default
          </label>
          <label class="flex items-center gap-2 rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary">
            <input bind:checked={customForm.fixedOrientation} type="checkbox" />
            Fixed orientation
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            class="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105"
            data-testid={missionWorkspaceTestIds.cameraCustomSave}
            onclick={saveCustomCamera}
            type="button"
          >
            Save custom camera
          </button>
          <button
            class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
            onclick={() => {
              customForm = { ...EMPTY_FORM };
              pickerMessage = null;
            }}
            type="button"
          >
            Reset form
          </button>
        </div>
      </div>
    {/if}
  </div>
</section>
