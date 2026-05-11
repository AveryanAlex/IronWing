<script lang="ts">
import type { Attachment } from "svelte/attachments";
import type UPlot from "uplot";
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

type UPlotConstructor = typeof UPlot;

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

function ensureMatchMedia() {
	if (typeof window === "undefined" || typeof window.matchMedia === "function") {
		return;
	}

	window.matchMedia = ((_query: string) => ({
		matches: false,
		media: "",
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	})) as typeof window.matchMedia;
}

function canMountUPlot() {
	// jsdom does not provide a usable canvas implementation, so mounting the real chart there only adds noisy async errors.
	return typeof navigator === "undefined" || !navigator.userAgent.includes("jsdom");
}

function loadUPlot(): Promise<UPlotConstructor> {
	if (!uPlotModulePromise) {
		ensureMatchMedia();
		uPlotModulePromise = import("uplot").then((module) => (module as unknown as { default: UPlotConstructor }).default);
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

    const resolveHeight = (fallbackHeight: number) => {
      const rectHeight = element.getBoundingClientRect().height;
      return Math.max(80, Math.round(rectHeight || element.clientHeight || fallbackHeight));
    };

    const mountPlot = async (config: PlotConfig) => {
      const requestId = ++mountRequestId;
      destroyPlot();
      if ((config.data[0]?.length ?? 0) === 0 || !canMountUPlot()) {
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
          height: resolveHeight(config.height),
        },
        config.data,
        element,
      );

      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => {
          plot?.setSize({
            width: resolveWidth(),
            height: resolveHeight(config.height),
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
  class="w-full overflow-hidden rounded-xl border border-border/70 bg-bg-primary/70 p-2"
  data-testid={testId}
  style={`height: ${height}px; min-height: ${height}px;`}
>
  <div class="h-full w-full overflow-hidden rounded-lg" {@attach plotAttachment}></div>
</div>
