export type SharedMapCanvasContextAttributes = Record<string, unknown> & {
  antialias?: boolean;
  powerPreference?: WebGLPowerPreference;
};

export type SharedBaseMapOptions = Record<string, unknown> & {
  canvasContextAttributes?: SharedMapCanvasContextAttributes | null;
};

export type ResolvedSharedBaseMapOptions = SharedBaseMapOptions & {
  container: HTMLElement;
  canvasContextAttributes: SharedMapCanvasContextAttributes & { antialias: true };
};

export function createSharedBaseMapOptions(
  options: SharedBaseMapOptions,
  container: HTMLElement,
): ResolvedSharedBaseMapOptions {
  const { canvasContextAttributes, ...rest } = options;

  return {
    ...rest,
    container,
    canvasContextAttributes: {
      ...normalizeCanvasContextAttributes(canvasContextAttributes),
      antialias: true,
    },
  };
}

function normalizeCanvasContextAttributes(
  canvasContextAttributes: SharedBaseMapOptions["canvasContextAttributes"],
): SharedMapCanvasContextAttributes {
  if (!canvasContextAttributes || typeof canvasContextAttributes !== "object") {
    return {};
  }

  return canvasContextAttributes;
}
