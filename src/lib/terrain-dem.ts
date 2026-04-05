export const TERRARIUM_TILE_URL_TEMPLATE =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const DEFAULT_TERRAIN_ZOOM = 14;
export const DEFAULT_TILE_CACHE_SIZE = 64;
export const TERRAIN_ELEVATION_MIN_M = -500;
export const TERRAIN_ELEVATION_MAX_M = 9_000;
export const TILE_SIZE = 256;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_WEB_MERCATOR_LAT = 85.05112878;

export type TerrainPoint = {
  latitude_deg: number;
  longitude_deg: number;
};

export type TileSamplePoint = {
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
};

export type TerrainFetchFn = typeof globalThis.fetch;

export type TileCache = {
  getElevation(lat: number, lon: number, zoom?: number): Promise<number | null>;
  getTileData(zoom: number, tileX: number, tileY: number): Promise<Float32Array | null>;
  readonly stats: {
    hits: number;
    misses: number;
  };
};

export function latLonToTile(lat: number, lon: number, zoom: number): TileSamplePoint {
  const normalizedLat = Math.max(-MAX_WEB_MERCATOR_LAT, Math.min(MAX_WEB_MERCATOR_LAT, lat));
  const wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const tileCount = 2 ** zoom;
  const latRad = (normalizedLat * Math.PI) / 180;
  const tileXFloat = ((wrappedLon + 180) / 360) * tileCount;
  const tileYFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount;

  const clampedTileXFloat = Math.min(tileCount - Number.EPSILON, Math.max(0, tileXFloat));
  const clampedTileYFloat = Math.min(tileCount - Number.EPSILON, Math.max(0, tileYFloat));
  const tileX = Math.floor(clampedTileXFloat);
  const tileY = Math.floor(clampedTileYFloat);
  const pixelX = Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((clampedTileXFloat - tileX) * TILE_SIZE)));
  const pixelY = Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((clampedTileYFloat - tileY) * TILE_SIZE)));

  return { tileX, tileY, pixelX, pixelY };
}

export function decodeTerrarium(r: number, g: number, b: number): number {
  return (r * 256 + g + b / 256) - 32768;
}

export async function fetchTerrainTile(
  zoom: number,
  tileX: number,
  tileY: number,
  fetchFn: TerrainFetchFn,
): Promise<Float32Array | null> {
  const url = tileUrl(zoom, tileX, tileY);
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeoutId =
    controller === null
      ? null
      : setTimeout(() => {
          controller.abort();
        }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return null;

    const blob = await response.blob();
    const imageData = await decodeTileImageData(blob);
    if (!imageData || imageData.width !== TILE_SIZE || imageData.height !== TILE_SIZE) return null;

    const decoded = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let pixelIndex = 0; pixelIndex < decoded.length; pixelIndex += 1) {
      const channelIndex = pixelIndex * 4;
      const elevation = decodeTerrarium(
        imageData.data[channelIndex] ?? 0,
        imageData.data[channelIndex + 1] ?? 0,
        imageData.data[channelIndex + 2] ?? 0,
      );
      decoded[pixelIndex] = sanitizeElevation(elevation);
    }

    return decoded;
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

export function createTileCache(
  fetchFn: TerrainFetchFn,
  maxSize = DEFAULT_TILE_CACHE_SIZE,
): TileCache {
  const cache = new Map<string, Promise<Float32Array | null>>();
  const stats = { hits: 0, misses: 0 };

  const touch = (key: string, value: Promise<Float32Array | null>) => {
    cache.delete(key);
    cache.set(key, value);
  };

  const getTileData = async (zoom: number, tileX: number, tileY: number): Promise<Float32Array | null> => {
    const key = tileKey(zoom, tileX, tileY);
    const existing = cache.get(key);
    if (existing) {
      stats.hits += 1;
      touch(key, existing);
      return existing;
    }

    stats.misses += 1;
    const pending = fetchTerrainTile(zoom, tileX, tileY, fetchFn);
    cache.set(key, pending);

    while (cache.size > Math.max(1, maxSize)) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }

    return pending;
  };

  return {
    getElevation: async (lat: number, lon: number, zoom = DEFAULT_TERRAIN_ZOOM) => {
      const { tileX, tileY, pixelX, pixelY } = latLonToTile(lat, lon, zoom);
      const tile = await getTileData(zoom, tileX, tileY);
      return readTileElevation(tile, pixelX, pixelY);
    },
    getTileData,
    stats,
  };
}

export async function sampleElevations(
  points: TerrainPoint[],
  cache: TileCache,
  zoom = DEFAULT_TERRAIN_ZOOM,
): Promise<Array<number | null>> {
  if (points.length === 0) return [];

  const samples = points.map((point) => ({
    point,
    sample: latLonToTile(point.latitude_deg, point.longitude_deg, zoom),
  }));

  const uniqueTiles = new Map<string, TileSamplePoint>();
  for (const { sample } of samples) {
    uniqueTiles.set(tileKey(zoom, sample.tileX, sample.tileY), sample);
  }

  const resolvedTiles = new Map<string, Float32Array | null>();
  await Promise.all(
    Array.from(uniqueTiles.entries()).map(async ([key, sample]) => {
      resolvedTiles.set(key, await cache.getTileData(zoom, sample.tileX, sample.tileY));
    }),
  );

  return samples.map(({ sample }) =>
    readTileElevation(
      resolvedTiles.get(tileKey(zoom, sample.tileX, sample.tileY)) ?? null,
      sample.pixelX,
      sample.pixelY,
    ),
  );
}

function tileUrl(zoom: number, tileX: number, tileY: number): string {
  return TERRARIUM_TILE_URL_TEMPLATE.replace("{z}", String(zoom))
    .replace("{x}", String(tileX))
    .replace("{y}", String(tileY));
}

function tileKey(zoom: number, tileX: number, tileY: number): string {
  return `${zoom}/${tileX}/${tileY}`;
}

function sanitizeElevation(elevation: number): number {
  if (!Number.isFinite(elevation)) return Number.NaN;
  if (elevation < TERRAIN_ELEVATION_MIN_M || elevation > TERRAIN_ELEVATION_MAX_M) {
    return Number.NaN;
  }
  return elevation;
}

function readTileElevation(tile: Float32Array | null, pixelX: number, pixelY: number): number | null {
  if (!tile) return null;
  const sample = tile[pixelY * TILE_SIZE + pixelX];
  return sample === undefined || Number.isNaN(sample) ? null : sample;
}

async function decodeTileImageData(blob: Blob): Promise<ImageData | null> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      return drawRaster(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close?.();
    }
  }

  if (typeof Image === "undefined" || typeof URL?.createObjectURL !== "function") {
    return null;
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImage(objectUrl);
    return drawRaster(image, image.width, image.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawRaster(source: CanvasImageSource, width: number, height: number): ImageData | null {
  const canvas = createRasterCanvas(width, height);
  if (!canvas) return null;

  const context = createRasterContext(canvas);
  if (!context) return null;

  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function createRasterContext(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  const context = canvas.getContext(
    "2d",
    { willReadFrequently: true } as CanvasRenderingContext2DSettings,
  );
  if (!isRasterContext(context)) {
    return null;
  }

  return context;
}

function isRasterContext(
  context: OffscreenCanvasRenderingContext2D | RenderingContext | null,
): context is OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  return context !== null && "drawImage" in context && "getImageData" in context;
}

function createRasterCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode terrain tile image"));
    image.src = src;
  });
}
