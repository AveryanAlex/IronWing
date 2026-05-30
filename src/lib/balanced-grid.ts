export function resolveBalancedGridColumnCount(itemCount: number, gridWidthPx: number, minItemWidthPx: number, gapPx: number): number {
  const normalizedItemCount = Math.max(0, Math.floor(itemCount));
  if (normalizedItemCount === 0) {
    return 1;
  }

  const normalizedGapPx = Math.max(0, gapPx);
  const normalizedMinItemWidthPx = Math.max(1, minItemWidthPx);
  const maxColumnsByWidth = gridWidthPx > 0
    ? Math.max(1, Math.floor((gridWidthPx + normalizedGapPx) / (normalizedMinItemWidthPx + normalizedGapPx)))
    : normalizedItemCount;
  const maxColumns = Math.min(normalizedItemCount, maxColumnsByWidth);
  const rowCount = Math.ceil(normalizedItemCount / maxColumns);

  return Math.ceil(normalizedItemCount / rowCount);
}
