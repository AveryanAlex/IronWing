export type OsdGridShape = {
  columns: number;
  rows: number;
};

export type OsdBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type OsdGridPoint = {
  x: number;
  y: number;
};

export type OsdGrabOffset = {
  xCells: number;
  yCells: number;
};

export type OsdPointerGeometryInput = {
  clientX: number;
  clientY: number;
  bounds: OsdBounds;
  grid: OsdGridShape;
};

export function captureOsdGrabOffset(
  input: OsdPointerGeometryInput & { item: OsdGridPoint },
): OsdGrabOffset | null {
  if (!hasValidGeometry(input) || !isFinitePoint(input.item)) {
    return null;
  }

  const pointer = pointerInCells(input);
  return {
    xCells: pointer.x - input.item.x,
    yCells: pointer.y - input.item.y,
  };
}

export function osdPointerToGrid(
  input: OsdPointerGeometryInput & { grab: OsdGrabOffset },
): OsdGridPoint | null {
  if (!hasValidGeometry(input) || !isFiniteGrabOffset(input.grab)) {
    return null;
  }

  const pointer = pointerInCells(input);
  return clampPoint(
    Math.floor(pointer.x - input.grab.xCells),
    Math.floor(pointer.y - input.grab.yCells),
    input.grid,
  );
}

export function osdDropToGrid(input: OsdPointerGeometryInput): OsdGridPoint | null {
  if (!hasValidGeometry(input)) {
    return null;
  }

  const pointer = pointerInCells(input);
  return clampPoint(Math.floor(pointer.x), Math.floor(pointer.y), input.grid);
}

function pointerInCells(input: OsdPointerGeometryInput): OsdGridPoint {
  return {
    x: ((input.clientX - input.bounds.left) / input.bounds.width) * input.grid.columns,
    y: ((input.clientY - input.bounds.top) / input.bounds.height) * input.grid.rows,
  };
}

function clampPoint(x: number, y: number, grid: OsdGridShape): OsdGridPoint {
  return {
    x: Math.max(0, Math.min(grid.columns - 1, x)),
    y: Math.max(0, Math.min(grid.rows - 1, y)),
  };
}

function hasValidGeometry(input: OsdPointerGeometryInput): boolean {
  return (
    Number.isFinite(input.clientX) &&
    Number.isFinite(input.clientY) &&
    Number.isFinite(input.bounds.left) &&
    Number.isFinite(input.bounds.top) &&
    Number.isFinite(input.bounds.width) &&
    input.bounds.width > 0 &&
    Number.isFinite(input.bounds.height) &&
    input.bounds.height > 0 &&
    Number.isInteger(input.grid.columns) &&
    input.grid.columns > 0 &&
    Number.isInteger(input.grid.rows) &&
    input.grid.rows > 0
  );
}

function isFinitePoint(point: OsdGridPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteGrabOffset(grab: OsdGrabOffset): boolean {
  return Number.isFinite(grab.xCells) && Number.isFinite(grab.yCells);
}
