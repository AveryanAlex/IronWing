import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

let configuredWorkerUrl: string | null = null;

export function configureMapLibreWorker(): void {
  if (configuredWorkerUrl === workerUrl) return;

  maplibregl.setWorkerUrl(workerUrl);
  configuredWorkerUrl = workerUrl;
}
