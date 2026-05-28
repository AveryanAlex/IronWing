<script lang="ts">
import {
  addRecentCameraWithStatus,
  deleteCustomCameraWithStatus,
  getCameraCatalogState,
  saveCustomCameraWithStatus,
  type CameraCatalogActionResult,
  type CatalogCamera,
} from "../../../lib/survey-camera-catalog";
import type { SurveyRegion } from "../../../lib/survey-region";
import { ActionRow, Alert, Badge, Button, Card, Checkbox, EmptyState, Eyebrow, FactTile, Field, HelperText, Input } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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

</script>

<section class="space-y-3" data-testid={missionWorkspaceTestIds.cameraPicker}>
  <Card.Root density="compact" surface="muted">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Eyebrow>Camera</Eyebrow>
        <div data-testid={missionWorkspaceTestIds.cameraCurrent}>
          {#if region.camera}
            <h4 class="mt-1 text-sm font-semibold text-text-primary">{currentCameraLabel}</h4>
          {:else if unresolvedCameraMessage}
            <HelperText class="mt-1" size="xs" tone="warning">{unresolvedCameraMessage}</HelperText>
          {:else}
            <h4 class="mt-1 text-sm font-semibold text-text-primary">{currentCameraLabel}</h4>
          {/if}
        </div>
      </div>

      {#if region.camera && customCameraNames.has(region.camera.canonicalName)}
        <Badge variant="accent" size="sm">
          Custom
        </Badge>
      {:else if region.camera}
        <Badge variant="success" size="sm">
          Ready
        </Badge>
      {:else}
        <Badge variant="warning" size="sm">
          Missing
        </Badge>
      {/if}
    </div>

    {#if region.camera}
      <div class="mt-3 grid min-w-0 gap-2">
        <FactTile label="Sensor" value={`${region.camera.sensorWidth_mm} × ${region.camera.sensorHeight_mm}`} unit="mm" />
        <FactTile label="Image" value={`${region.camera.imageWidth_px} × ${region.camera.imageHeight_px}`} unit="px" />
      </div>
    {/if}
  </Card.Root>

  {#if combinedWarnings.length > 0}
    <Alert density="compact" variant="warning" testId={missionWorkspaceTestIds.cameraWarning}>
      <ul class="list-inside list-disc space-y-1 text-xs">
        {#each combinedWarnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    </Alert>
  {/if}

  {#if pickerMessage && pickerMessage.tone !== "warning"}
    <Alert density="compact" variant={pickerMessage.tone === "success" ? "success" : "info"} description={pickerMessage.text} />
  {/if}

  <Field.Root>
    <Field.Label class="text-xs font-medium text-text-muted">Search cameras</Field.Label>
    <Input
      bind:value={query}
      placeholder="Search builtin and custom cameras"
      testId={missionWorkspaceTestIds.cameraSearch}
      type="search"
    />
  </Field.Root>

  {#if catalogState.recent.length > 0}
    <Card.Root density="compact" surface="muted">
      <Eyebrow>Recent</Eyebrow>
      <div class="mt-3 flex flex-wrap gap-2">
        {#each catalogState.recent as camera (camera.canonicalName)}
          <Button
            size="sm"
            testId={missionWorkspaceTestIds.cameraRecentPrefix}
            onclick={() => selectCamera(camera)}
            variant="outline"
          >
            Use {camera.canonicalName}
          </Button>
        {/each}
      </div>
    </Card.Root>
  {/if}

  <Card.Root density="compact" surface="muted">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Eyebrow>Catalog</Eyebrow>
        <HelperText class="mt-1" size="xs">
          Matching builtin and custom profiles stay searchable without leaving the mission workspace.
        </HelperText>
      </div>

      <Button
        size="sm"
        testId={missionWorkspaceTestIds.cameraCustomToggle}
        onclick={() => {
          showCustomForm = !showCustomForm;
          pickerMessage = null;
        }}
        variant="outline"
      >
        {showCustomForm ? "Hide custom form" : "New custom camera"}
      </Button>
    </div>

    <div class="mt-4 space-y-3">
      {#if visibleResults.length === 0}
        <EmptyState
          class="bg-bg-primary px-3 py-4"
          title="No matching cameras"
          description="Save a custom profile or clear the query to keep working."
        />
      {:else}
        {#each visibleResults as camera (camera.canonicalName)}
          <Card.Root density="compact" surface="primary">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h5 class="text-sm font-semibold text-text-primary">{camera.canonicalName}</h5>
                  {#if customCameraNames.has(camera.canonicalName)}
                    <Badge variant="accent" size="sm">
                      Custom
                    </Badge>
                  {/if}
                </div>
                <HelperText class="mt-1" size="xs">
                  {camera.brand} · {camera.model} · {camera.focalLength_mm} mm · {camera.imageWidth_px} × {camera.imageHeight_px} px
                </HelperText>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onclick={() => selectCamera(camera)}
                  tone="accent"
                  variant="soft"
                >
                  Use {camera.canonicalName}
                </Button>
                {#if customCameraNames.has(camera.canonicalName)}
                  <Button
                    size="sm"
                    onclick={() => deleteCustomCamera(camera.canonicalName)}
                    tone="danger"
                    variant="soft"
                  >
                    Delete {camera.canonicalName}
                  </Button>
                {/if}
              </div>
            </div>
          </Card.Root>
        {/each}
      {/if}
    </div>

    {#if showCustomForm}
      <Card.Root class="mt-4" density="compact" surface="primary">
        <div class="grid min-w-0 gap-3">
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Canonical name</Field.Label><Input bind:value={customForm.canonicalName} testId={missionWorkspaceTestIds.cameraCustomName} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Brand</Field.Label><Input bind:value={customForm.brand} testId={missionWorkspaceTestIds.cameraCustomBrand} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Model</Field.Label><Input bind:value={customForm.model} testId={missionWorkspaceTestIds.cameraCustomModel} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Focal length (mm)</Field.Label><Input bind:value={customForm.focalLength_mm} inputmode="decimal" testId={missionWorkspaceTestIds.cameraCustomFocal} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Sensor width (mm)</Field.Label><Input bind:value={customForm.sensorWidth_mm} inputmode="decimal" testId={missionWorkspaceTestIds.cameraCustomSensorWidth} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Sensor height (mm)</Field.Label><Input bind:value={customForm.sensorHeight_mm} inputmode="decimal" testId={missionWorkspaceTestIds.cameraCustomSensorHeight} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Image width (px)</Field.Label><Input bind:value={customForm.imageWidth_px} inputmode="numeric" testId={missionWorkspaceTestIds.cameraCustomImageWidth} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Image height (px)</Field.Label><Input bind:value={customForm.imageHeight_px} inputmode="numeric" testId={missionWorkspaceTestIds.cameraCustomImageHeight} type="text" /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Min trigger interval (s)</Field.Label><Input bind:value={customForm.minTriggerInterval_s} inputmode="decimal" testId={missionWorkspaceTestIds.cameraCustomMinTrigger} type="text" /></Field.Root>
          <Card.Root density="compact" justify="center" surface="muted">
            <Checkbox bind:checked={customForm.landscape} label="Landscape default" />
          </Card.Root>
          <Card.Root density="compact" justify="center" surface="muted">
            <Checkbox bind:checked={customForm.fixedOrientation} label="Fixed orientation" />
          </Card.Root>
        </div>

        <ActionRow align="stretch" direction="column" class="mt-4">
          <Button
            testId={missionWorkspaceTestIds.cameraCustomSave}
            onclick={saveCustomCamera}
            tone="accent"
            variant="soft"
          >
            Save custom camera
          </Button>
          <Button
            onclick={() => {
              customForm = { ...EMPTY_FORM };
              pickerMessage = null;
            }}
            variant="secondary"
          >
            Reset form
          </Button>
        </ActionRow>
      </Card.Root>
    {/if}
  </Card.Root>
</section>
