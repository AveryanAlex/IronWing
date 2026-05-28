<script lang="ts">
import { onMount } from "svelte";
import type { SvelteHTMLElements } from "svelte/elements";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";

import { createSharedBaseMapOptions, type SharedBaseMapOptions } from "../../../lib/map/base-map";
import { configureMapLibreWorker } from "../../../lib/map/worker";

type DivAttributes = Omit<SvelteHTMLElements["div"], "children" | "class">;
type MapReadyCleanup = () => void;

type Props = DivAttributes & {
  options: SharedBaseMapOptions;
  onMapReady?: (map: MapLibreMap, container: HTMLDivElement) => MapReadyCleanup | void;
  onMapError?: (error: unknown) => void;
};

let {
  options,
  onMapReady,
  onMapError,
  ...rest
}: Props = $props();

let mapContainer = $state<HTMLDivElement | null>(null);

onMount(() => {
  if (!mapContainer) return;

  let map: MapLibreMap | null = null;
  let readyCleanup: MapReadyCleanup | undefined;

  try {
    configureMapLibreWorker();
    map = new maplibregl.Map(
      createSharedBaseMapOptions(options, mapContainer) as ConstructorParameters<typeof maplibregl.Map>[0],
    );
    const cleanup = onMapReady?.(map, mapContainer);
    readyCleanup = typeof cleanup === "function" ? cleanup : undefined;
  } catch (error) {
    readyCleanup?.();
    map?.remove();
    map = null;

    if (onMapError) {
      onMapError(error);
      return;
    }

    throw error;
  }

  return () => {
    readyCleanup?.();
    map?.remove();
    map = null;
  };
});
</script>

<div {...rest} bind:this={mapContainer} class="size-full"></div>
