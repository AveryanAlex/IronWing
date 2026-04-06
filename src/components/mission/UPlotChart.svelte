<script lang="ts">
import type { Attachment } from "svelte/attachments";
import type { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";

type Props = {
  options: Omit<Options, "width" | "height">;
  data: AlignedData;
  height?: number;
  testId?: string;
};

type PlotConfig = {
  options: Omit<Options, "width" | "height">;
  data: AlignedData;
  height: number;
};

type UPlotConstructor = typeof import("uplot").default;

let {
  options,
  data,
  height = 220,
  testId,
}: Props = $props();

let plotConfig = $derived<PlotConfig>({
  options,
  data,
  height,
});

const plotAttachment = createPlotAttachment(() => plotConfig);
let uPlotModulePromise: Promise<UPlotConstructor> | null = null;

function loadUPlot(): Promise<UPlotConstructor> {
  if (!uPlotModulePromise) {
    uPlotModulePromise = import("uplot").then((module) => module.default);
  }

  return uPlotModulePromise;
}

function createPlotAttachment(getConfig: () => PlotConfig): Attachment<HTMLDivElement> {
  return (element) => {
    let plot: InstanceType<UPlotConstructor> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mountRequestId = 0;
    let disposed = false;

    const destroyPlot = () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      plot?.destroy();
      plot = null;
      element.replaceChildren();
    };

    const resolveWidth = () => {
      const rectWidth = element.getBoundingClientRect().width;
      return Math.max(280, Math.round(rectWidth || element.clientWidth || 280));
    };

    const mountPlot = async (config: PlotConfig) => {
      const requestId = ++mountRequestId;
      destroyPlot();
      if ((config.data[0]?.length ?? 0) === 0) {
        return;
      }

      const UPlot = await loadUPlot();
      if (disposed || requestId !== mountRequestId) {
        return;
      }

      plot = new UPlot(
        {
          ...config.options,
          width: resolveWidth(),
          height: config.height,
        },
        config.data,
        element,
      );

      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => {
          plot?.setSize({
            width: resolveWidth(),
            height: config.height,
          });
        });
        resizeObserver.observe(element);
      }
    };

    $effect(() => {
      void mountPlot(getConfig());
    });

    return () => {
      disposed = true;
      mountRequestId += 1;
      destroyPlot();
    };
  };
}
</script>

<div
  class="min-h-[220px] w-full overflow-hidden rounded-xl border border-border/70 bg-bg-primary/70 p-2"
  data-testid={testId}
  {@attach plotAttachment}
></div>
