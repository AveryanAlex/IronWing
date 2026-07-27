<script lang="ts">
import type { OsdGridModel } from "../../../../lib/osd/ardupilot-osd-model";
import {
  SNEAKY_FPV_ARDU_WS_ATLAS,
  type OsdScreenRender,
} from "../../../../lib/osd/ardupilot-osd-renderer";

type Props = {
  grid: OsdGridModel;
  render: OsdScreenRender;
  onAtlasError?: (message: string | null) => void;
};

let { grid, render, onAtlasError = () => {} }: Props = $props();
let canvas = $state<HTMLCanvasElement | null>(null);
let canvasWidth = $derived(grid.columns * SNEAKY_FPV_ARDU_WS_ATLAS.glyphWidthPx);
let canvasHeight = $derived(grid.rows * SNEAKY_FPV_ARDU_WS_ATLAS.glyphHeightPx);

$effect(() => {
  if (!canvas) {
    return;
  }

  const target = canvas;
  const frame = render;
  let cancelled = false;

  loadAtlas()
    .then((atlas) => {
      if (cancelled) {
        return;
      }

      drawFrame(target, atlas, frame);
      onAtlasError(null);
    })
    .catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      clearCanvas(target);
      onAtlasError(error instanceof Error ? error.message : "Unable to load the OSD font atlas.");
    });

  return () => {
    cancelled = true;
  };
});

function drawFrame(target: HTMLCanvasElement, atlas: HTMLImageElement, frame: OsdScreenRender) {
  const context = target.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D rendering is unavailable.");
  }

  context.clearRect(0, 0, target.width, target.height);
  context.imageSmoothingEnabled = false;

  for (const glyph of frame.glyphs) {
    if (glyph.glyph < 0 || glyph.glyph >= SNEAKY_FPV_ARDU_WS_ATLAS.glyphCount) {
      continue;
    }

    context.drawImage(
      atlas,
      0,
      glyph.glyph * SNEAKY_FPV_ARDU_WS_ATLAS.glyphHeightPx,
      SNEAKY_FPV_ARDU_WS_ATLAS.glyphWidthPx,
      SNEAKY_FPV_ARDU_WS_ATLAS.glyphHeightPx,
      glyph.x * SNEAKY_FPV_ARDU_WS_ATLAS.glyphWidthPx,
      glyph.y * SNEAKY_FPV_ARDU_WS_ATLAS.glyphHeightPx,
      SNEAKY_FPV_ARDU_WS_ATLAS.glyphWidthPx,
      SNEAKY_FPV_ARDU_WS_ATLAS.glyphHeightPx,
    );
  }
}

function clearCanvas(target: HTMLCanvasElement) {
  target.getContext("2d")?.clearRect(0, 0, target.width, target.height);
}

let atlasPromise: Promise<HTMLImageElement> | null = null;

function loadAtlas(): Promise<HTMLImageElement> {
  atlasPromise ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (
        image.naturalWidth !== SNEAKY_FPV_ARDU_WS_ATLAS.glyphWidthPx
        || image.naturalHeight !== SNEAKY_FPV_ARDU_WS_ATLAS.glyphHeightPx * SNEAKY_FPV_ARDU_WS_ATLAS.glyphCount
      ) {
        reject(new Error(
          `Unexpected OSD font atlas dimensions ${image.naturalWidth}×${image.naturalHeight}; expected 36×13824.`,
        ));
        return;
      }

      resolve(image);
    };
    image.onerror = () => reject(new Error("Unable to load the Sneaky FPV OSD font atlas."));
    image.src = SNEAKY_FPV_ARDU_WS_ATLAS.src;
  });

  return atlasPromise;
}
</script>

<canvas
  bind:this={canvas}
  aria-hidden="true"
  class="block size-full"
  width={canvasWidth}
  height={canvasHeight}
></canvas>
