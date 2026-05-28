import type { Snippet } from "svelte";

export type MapContextMenuPoint = {
  latitudeDeg: number;
  longitudeDeg: number;
  lat: number;
  lon: number;
};

export type MapContextMenuAction = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
  title?: string;
  icon?: Snippet;
  onSelect: (point: MapContextMenuPoint) => void;
};
