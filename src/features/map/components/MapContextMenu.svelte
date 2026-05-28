<script lang="ts">
import { MapPin } from "lucide-svelte";

import { ContextMenu, type ContextMenuItem } from "../../../components/ui";
import type { MapContextMenuAction, MapContextMenuPoint } from "./map-context-menu-types";

type Props = {
  /** Viewport/client pixel x-coordinate for the menu anchor. */
  x: number;
  /** Viewport/client pixel y-coordinate for the menu anchor. */
  y: number;
  lat: number;
  lon: number;
  actions?: ReadonlyArray<MapContextMenuAction>;
  testId?: string;
  coordinatesTestId?: string;
  onClose: () => void;
};

let {
  x,
  y,
  lat,
  lon,
  actions = [],
  testId = "map-context-menu",
  coordinatesTestId = "map-context-menu-coordinates",
  onClose,
}: Props = $props();

let selectedPoint = $derived<MapContextMenuPoint>({
  latitudeDeg: lat,
  longitudeDeg: lon,
  lat,
  lon,
});
let coordinatesText = $derived(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
let menuItems = $derived<ContextMenuItem[]>(
  actions.map((action) => ({
    id: action.id,
    label: action.label,
    destructive: action.destructive,
    disabled: action.disabled,
    testId: action.testId,
    title: action.title,
    icon: action.icon,
    onSelect: () => action.onSelect(selectedPoint),
  })),
);
</script>

<ContextMenu
  items={menuItems}
  {testId}
  controlled={{
    open: true,
    x,
    y,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  }}
>
  <div class="mt-1 border-t border-border px-2.5 py-2" data-testid={coordinatesTestId}>
    <div class="flex items-start gap-2 text-text-secondary">
      <MapPin aria-hidden="true" class="mt-0.5 shrink-0 text-accent" size={14} />
      <div class="min-w-0">
        <div class="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-text-muted">Selected point</div>
        <div class="font-mono text-xs text-text-primary" title={coordinatesText}>{coordinatesText}</div>
      </div>
    </div>
  </div>
</ContextMenu>
