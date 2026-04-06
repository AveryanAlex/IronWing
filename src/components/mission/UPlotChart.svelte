<script lang="ts">
import uPlot from "uplot";
import type { Attachment } from "svelte/attachments";
import "uplot/dist/uPlot.min.css";

type Props = {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  height?: number;
  testId?: string;
};

type PlotConfig = {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  height: number;
};

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

function createPlotAttachment(getConfig: () => PlotConfig): Attachment<HTMLDivElement> {
  return (element) => {
    let plot: uPlot | null = null;
    let resizeObserver: ResizeObserver | null = null;

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

    const mountPlot = (config: PlotConfig) => {
      destroyPlot();
      if ((config.data[0]?.length ?? 0) === 0) {
        return;
      }

      plot = new uPlot(
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
      mountPlot(getConfig());
    });

    return destroyPlot;
  };
}
</script>

<div
  class="min-h-[220px] w-full overflow-hidden rounded-xl border border-border/70 bg-bg-primary/70 p-2"
  data-testid={testId}
  {@attach plotAttachment}
></div>
