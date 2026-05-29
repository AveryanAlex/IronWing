<script lang="ts">
import type { Attachment } from "svelte/attachments";
import type { ClassValue } from "clsx";
import type UPlot from "uplot";
import type { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { cn } from "../../lib/utils";

type Props = {
  options: Omit<Options, "width" | "height">;
  data: AlignedData;
  height?: number;
  testId?: string;
  optionsKey?: string | number;
  fillHeight?: boolean;
  class?: ClassValue;
};

type PlotConfig = {
  options: Omit<Options, "width" | "height">;
  data: AlignedData;
  height: number;
  optionsKey: string | number | Omit<Options, "width" | "height">;
};

type UPlotConstructor = typeof UPlot;

let {
  options,
  data,
  height = 220,
  testId,
  optionsKey,
  fillHeight = false,
  class: className,
}: Props = $props();

let plotConfig = $derived<PlotConfig>({
  options,
  data,
  height,
  optionsKey: optionsKey ?? options,
});

const plotAttachment = createPlotAttachment(() => plotConfig);
let uPlotModulePromise: Promise<UPlotConstructor> | null = null;
let rootClass = $derived(cn(
    "min-w-0 w-full overflow-hidden rounded-xl border border-border/70 bg-bg-primary/70 p-2",
  fillHeight && "h-full min-h-0",
  className,
));
let rootStyle = $derived(fillHeight ? undefined : `height: ${height}px; min-height: ${height}px;`);

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
    let lastOptionsKey: PlotConfig["optionsKey"] | null = null;
    let lastHeight = 0;
    let pendingData: AlignedData | null = null;
    let dataFrame: number | null = null;

    const destroyPlot = () => {
      if (dataFrame != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(dataFrame);
      }
      dataFrame = null;
      pendingData = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      plot?.destroy();
      plot = null;
      lastOptionsKey = null;
      lastHeight = 0;
      element.replaceChildren();
    };

    const resolveWidth = () => {
      const rectWidth = element.getBoundingClientRect().width;
      return Math.max(200, Math.round(rectWidth || element.clientWidth || 200));
    };

    const resolveHeight = (fallbackHeight: number) => {
      const rectHeight = element.getBoundingClientRect().height;
      return Math.max(80, Math.round(rectHeight || element.clientHeight || fallbackHeight));
    };

    const setDataSoon = (nextData: AlignedData) => {
      if (!plot) {
        return;
      }

      pendingData = nextData;
      if (dataFrame != null) {
        return;
      }

      const applyData = () => {
        dataFrame = null;
        if (!plot || !pendingData) {
          return;
        }
        plot.setData(pendingData);
        pendingData = null;
      };

      if (typeof requestAnimationFrame === "function") {
        dataFrame = requestAnimationFrame(applyData);
      } else {
        applyData();
      }
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

      lastOptionsKey = config.optionsKey;
      lastHeight = config.height;
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

    const updatePlot = (config: PlotConfig) => {
      if ((config.data[0]?.length ?? 0) === 0 || !canMountUPlot()) {
        destroyPlot();
        return;
      }

      if (!plot || lastOptionsKey !== config.optionsKey || lastHeight !== config.height) {
        void mountPlot(config);
        return;
      }

      setDataSoon(config.data);
    };

    $effect(() => {
      updatePlot(getConfig());
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
  class={rootClass}
  data-testid={testId}
  style={rootStyle}
>
  <div class="h-full w-full overflow-hidden rounded-lg" {@attach plotAttachment}></div>
</div>
