<script lang="ts">
import type { Attachment } from "svelte/attachments";

import type {
  AttitudeRendererState,
  AttitudeSceneConfig,
  AttitudeSceneController,
} from "../lib/attitude-three-scene";

type Props = {
  pitchDeg?: number | null;
  rollDeg?: number | null;
  vehicleType?: string | null;
  yawDeg?: number | null;
};

let {
  pitchDeg = null,
  rollDeg = null,
  vehicleType = null,
  yawDeg = null,
}: Props = $props();

let rendererState = $state<AttitudeRendererState>("loading");
let reducedMotion = $state(false);
let sceneModulePromise: Promise<typeof import("../lib/attitude-three-scene")> | null = null;

let sceneConfig = $derived<AttitudeSceneConfig>({
  pitchDeg,
  reducedMotion,
  rollDeg,
  vehicleType,
  yawDeg,
});

function canMountWebGl(): boolean {
  return typeof navigator === "undefined" || !navigator.userAgent.includes("jsdom");
}

function loadSceneModule() {
  sceneModulePromise ??= import("../lib/attitude-three-scene");
  return sceneModulePromise;
}

function createSceneAttachment(getConfig: () => AttitudeSceneConfig): Attachment<HTMLCanvasElement> {
  return (canvas) => {
    let controller: AttitudeSceneController | null = null;
    let latestConfig: AttitudeSceneConfig | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mediaQuery: MediaQueryList | null = null;
    let disposed = false;

    const measure = () => {
      if (!controller) return;
      const bounds = canvas.getBoundingClientRect();
      controller.resize(
        bounds.width || canvas.clientWidth || 320,
        bounds.height || canvas.clientHeight || 192,
        window.devicePixelRatio,
      );
    };

    const handleMotionPreference = (event: MediaQueryListEvent | MediaQueryList) => {
      reducedMotion = event.matches;
    };

    $effect(() => {
      latestConfig = getConfig();
      controller?.update(latestConfig);
    });

    rendererState = "loading";
    if (!canMountWebGl()) {
      rendererState = "unavailable";
      return;
    }

    if (typeof window.matchMedia === "function") {
      mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      handleMotionPreference(mediaQuery);
      mediaQuery.addEventListener("change", handleMotionPreference);
    }

    const mountScene = async () => {
      try {
        const module = await loadSceneModule();
        if (disposed) return;
        controller = module.createAttitudeScene(canvas, (state) => {
          if (!disposed) rendererState = state;
        });
        if (latestConfig) controller.update(latestConfig);
        measure();

        if (typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(measure);
          resizeObserver.observe(canvas);
        }
      } catch (error) {
        if (!disposed) {
          rendererState = "unavailable";
          console.warn("Failed to initialize the telemetry attitude renderer", error);
        }
      }
    };

    void mountScene();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      mediaQuery?.removeEventListener("change", handleMotionPreference);
      controller?.dispose();
      controller = null;
    };
  };
}

const sceneAttachment = createSceneAttachment(() => sceneConfig);
</script>

<div
  class="relative min-h-48 overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_42%),linear-gradient(180deg,var(--color-bg-secondary),var(--color-bg-primary))]"
>
  <div class="absolute inset-0" role="img" aria-label="Three-dimensional vehicle attitude, north referenced">
    <canvas
      class={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-150 ${rendererState === "ready" ? "opacity-100" : "opacity-0"}`}
      aria-hidden="true"
      {@attach sceneAttachment}
    ></canvas>
  </div>

  {#if rendererState !== "ready"}
    <p class="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-medium text-text-muted" role="status">
      {rendererState === "loading"
        ? "Loading 3D view…"
        : rendererState === "lost"
          ? "3D view interrupted"
          : "3D view unavailable"}
    </p>
  {/if}
</div>
