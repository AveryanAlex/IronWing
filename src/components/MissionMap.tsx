import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker,
  type MapMouseEvent,
} from "maplibre-gl";
import { Map as MapIcon, Layers, Satellite } from "lucide-react";
import type { HomePosition } from "../mission";
import type { TypedDraftItem } from "../lib/mission-draft-typed";
import type { PolygonVertex } from "../lib/mission-grid";

const DEFAULT_CENTER: [number, number] = [8.545594, 47.397742];
const DEFAULT_ZOOM = 13;
const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const SOURCE_ID = "mission-items";
const LINE_LAYER_ID = "mission-line";

type SvsTelemetry = {
  latitude_deg: number;
  longitude_deg: number;
  heading_deg: number;
  pitch_deg: number;
  roll_deg: number;
  altitude_m: number;
};

type MissionMapProps = {
  missionItems: TypedDraftItem[];
  homePosition: HomePosition | null;
  selectedIndex: number | null;
  onSelectIndex?: (index: number | null) => void;
  onMoveWaypoint?: (index: number, latDeg: number, lonDeg: number) => void;
  onContextMenu?: (lat: number, lng: number, screenX: number, screenY: number) => void;
  readOnly?: boolean;
  vehiclePosition?: { latitude_deg: number; longitude_deg: number; heading_deg: number } | null;
  deviceLocation?: { latitude_deg: number; longitude_deg: number; accuracy_m: number } | null;
  followTarget?: "vehicle" | "device" | null;
  centerOnVehicleKey?: number;
  centerOnDeviceKey?: number;
  onUserInteraction?: () => void;
  currentMissionSeq?: number | null;
  flyToSelectedKey?: number;
  syntheticVision?: boolean;
  svsTelemetry?: SvsTelemetry | null;
  flightPath?: [number, number][];
  replayPosition?: { latitude_deg: number; longitude_deg: number; heading_deg: number } | null;
  polygonVertices?: PolygonVertex[];
  isDrawingPolygon?: boolean;
  onPolygonClick?: (lat: number, lng: number) => void;
  onPolygonComplete?: () => void;
  onPolygonVertexMove?: (index: number, lat: number, lng: number) => void;
};

export type { SvsTelemetry };

export function MissionMap({
  missionItems, homePosition, selectedIndex, onSelectIndex,
  onMoveWaypoint, onContextMenu, readOnly,
  vehiclePosition, deviceLocation, followTarget, centerOnVehicleKey, centerOnDeviceKey,
  onUserInteraction, currentMissionSeq, flyToSelectedKey,
  syntheticVision, svsTelemetry,
  flightPath, replayPosition,
  polygonVertices, isDrawingPolygon, onPolygonClick, onPolygonComplete, onPolygonVertexMove,
}: MissionMapProps) {
  type MapLayer = "plan" | "hybrid" | "satellite";
  const [mapLayer, setMapLayer] = useState<MapLayer>("plan");
  const baseLayerIdsRef = useRef<string[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  const homeMarkerRef = useRef<Marker | null>(null);
  const vehicleMarkerRef = useRef<Marker | null>(null);
  const deviceLocationMarkerRef = useRef<Marker | null>(null);
  const replayMarkerRef = useRef<Marker | null>(null);
  const hasSetInitialViewport = useRef(false);
  const onSelectIndexRef = useRef(onSelectIndex);
  const onMoveWaypointRef = useRef(onMoveWaypoint);
  const onContextMenuRef = useRef(onContextMenu);
  const readOnlyRef = useRef(readOnly);
  const longPressFiredRef = useRef(false);
  const onUserInteractionRef = useRef(onUserInteraction);
  const programmaticMoveRef = useRef(false);
  const missionGeoJsonRef = useRef<any>({ type: "FeatureCollection", features: [] });
  const onPolygonClickRef = useRef(onPolygonClick);
  const onPolygonCompleteRef = useRef(onPolygonComplete);
  const onPolygonVertexMoveRef = useRef(onPolygonVertexMove);
  const isDrawingPolygonRef = useRef(isDrawingPolygon);
  const polygonVerticesRef = useRef(polygonVertices);
  const polygonMarkersRef = useRef<Marker[]>([]);
  const missionItemsRef = useRef(missionItems);
  const homePositionRef = useRef(homePosition);

  useEffect(() => {
    onSelectIndexRef.current = onSelectIndex;
    onMoveWaypointRef.current = onMoveWaypoint;
    onContextMenuRef.current = onContextMenu;
    readOnlyRef.current = readOnly;
    onUserInteractionRef.current = onUserInteraction;
    onPolygonClickRef.current = onPolygonClick;
    onPolygonCompleteRef.current = onPolygonComplete;
    onPolygonVertexMoveRef.current = onPolygonVertexMove;
    isDrawingPolygonRef.current = isDrawingPolygon;
    polygonVerticesRef.current = polygonVertices;
    missionItemsRef.current = missionItems;
    homePositionRef.current = homePosition;
  }, [onSelectIndex, onMoveWaypoint, onContextMenu, readOnly, onUserInteraction, onPolygonClick, onPolygonComplete, onPolygonVertexMove, isDrawingPolygon, polygonVertices, missionItems, homePosition]);

  const missionGeoJson = useMemo(() => {
    const lineCoordinates: [number, number][] = [];

    if (homePosition) {
      lineCoordinates.push([homePosition.longitude_deg, homePosition.latitude_deg]);
    }

    for (const item of missionItems) {
      if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) continue;
      lineCoordinates.push([item.preview.longitude_deg, item.preview.latitude_deg]);
    }

    const features: any[] = [];
    if (lineCoordinates.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: lineCoordinates },
        properties: { kind: "mission-line" },
      });
    }

    return { type: "FeatureCollection" as const, features };
  }, [missionItems, homePosition]);

  useEffect(() => {
    missionGeoJsonRef.current = missionGeoJson;
  }, [missionGeoJson]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: DEFAULT_CENTER,
      zoom: syntheticVision ? 14 : DEFAULT_ZOOM,
      pitch: syntheticVision ? 75 : 0,
      maxPitch: 85,
      interactive: !syntheticVision,
      attributionControl: false,
    });

    map.setStyle(BASE_STYLE_URL, {
      transformStyle: (_previousStyle, nextStyle) => {
        const style = nextStyle as any;
        style.sources = {
          ...style.sources,
          satelliteSource: { type: "raster", tiles: [SATELLITE_TILE_URL], tileSize: 256 },
          terrainSource: { type: "raster-dem", tiles: [DEM_TILE_URL], encoding: "terrarium", tileSize: 256, maxzoom: 15 },
          hillshadeSource: { type: "raster-dem", tiles: [DEM_TILE_URL], encoding: "terrarium", tileSize: 256, maxzoom: 15 },
        };

        style.layers.push({
          id: "hills", type: "hillshade", source: "hillshadeSource",
          layout: { visibility: "none" },
          paint: { "hillshade-shadow-color": "#473B24" },
        });

        const firstNonFillLayer = style.layers.find(
          (layer: any) => layer.type !== "fill" && layer.type !== "background"
        );
        if (firstNonFillLayer) {
          style.layers.splice(style.layers.indexOf(firstNonFillLayer), 0, {
            id: "satellite", type: "raster", source: "satelliteSource",
            layout: { visibility: "none" },
            paint: { "raster-opacity": 1 },
          });
        }

        return style;
      },
    });

    if (!syntheticVision) {
      map.addControl(new maplibregl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.GlobeControl(), "top-right");
      map.addControl(new maplibregl.TerrainControl({ source: "terrainSource", exaggeration: 1.5 }), "top-right");
    }

    map.on("style.load", () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
          id: LINE_LAYER_ID, type: "line", source: SOURCE_ID,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": "#78d6ff", "line-width": 4 },
        });
      }
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (source) source.setData(missionGeoJsonRef.current);

      // Replay flight path layer
      if (!map.getSource("replay-path")) {
        map.addSource("replay-path", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
        });
      }
      if (!map.getLayer("replay-path-line")) {
        map.addLayer({
          id: "replay-path-line",
          type: "line",
          source: "replay-path",
          paint: {
            "line-color": "#ffb020",
            "line-width": 3,
            "line-dasharray": [2, 2],
          },
        });
      }

      if (!map.getSource("grid-polygon")) {
        map.addSource("grid-polygon", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} },
        });
      }
      if (!map.getLayer("grid-polygon-fill")) {
        map.addLayer({
          id: "grid-polygon-fill",
          type: "fill",
          source: "grid-polygon",
          paint: { "fill-color": "#78d6ff", "fill-opacity": 0.15 },
        });
      }
      if (!map.getLayer("grid-polygon-line")) {
        map.addLayer({
          id: "grid-polygon-line",
          type: "line",
          source: "grid-polygon",
          paint: { "line-color": "#78d6ff", "line-width": 2, "line-dasharray": [3, 2] },
        });
      }

      if (!map.getSource("polygon-preview")) {
        map.addSource("polygon-preview", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
        });
      }
      if (!map.getLayer("polygon-preview-line")) {
        map.addLayer({
          id: "polygon-preview-line",
          type: "line",
          source: "polygon-preview",
          paint: { "line-color": "#78d6ff", "line-width": 2, "line-dasharray": [4, 3], "line-opacity": 0.6 },
        });
      }

      const ownIds = new Set(["satellite", "hills", LINE_LAYER_ID, "replay-path-line", "grid-polygon-fill", "grid-polygon-line", "polygon-preview-line"]);
      baseLayerIdsRef.current = map.getStyle().layers
        .filter((l: any) => !ownIds.has(l.id))
        .map((l: any) => l.id);

      if (syntheticVision) {
        // Enable satellite + hillshade, hide vector labels
        try { map.setLayoutProperty("satellite", "visibility", "visible"); } catch {}
        try { map.setLayoutProperty("hills", "visibility", "visible"); } catch {}
        for (const id of baseLayerIdsRef.current) {
          try { map.setLayoutProperty(id, "visibility", "none"); } catch {}
        }
        map.setTerrain({ source: "terrainSource", exaggeration: 1.5 });
        map.setSky({
          "sky-color": "#199EF3",
          "sky-horizon-blend": 0.7,
          "horizon-color": "#f0f8ff",
          "fog-color": "#9ec7e8",
          "fog-ground-blend": 0.6,
          "atmosphere-blend": 0.8,
        });
      }
    });

    // Touch long-press state (closure-scoped)
    let lpTimer: ReturnType<typeof setTimeout> | null = null;
    let lpStart: { x: number; y: number } | null = null;
    const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpStart = null; };

    if (!syntheticVision) {
      map.on("click", (event: MapMouseEvent) => {
        if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
        if (isDrawingPolygonRef.current) {
          const verts = polygonVerticesRef.current;
          // Close polygon by clicking the first vertex when 3+ points exist
          if (verts && verts.length >= 3) {
            const firstPt = map.project([verts[0].longitude_deg, verts[0].latitude_deg]);
            if (Math.hypot(firstPt.x - event.point.x, firstPt.y - event.point.y) < 20) {
              onPolygonCompleteRef.current?.();
              return;
            }
          }
          onPolygonClickRef.current?.(event.lngLat.lat, event.lngLat.lng);
          return;
        }
      });

      map.on("dblclick", (event: MapMouseEvent) => {
        if (isDrawingPolygonRef.current) {
          event.preventDefault();
        }
      });

      map.on("contextmenu", (event: MapMouseEvent) => {
        event.preventDefault();
        onContextMenuRef.current?.(event.lngLat.lat, event.lngLat.lng, event.point.x, event.point.y);
      });

      // Prevent native context menu & vibration on touch devices
      const el = containerRef.current!;
      el.addEventListener("contextmenu", (e) => e.preventDefault());

      // Custom long-press for touch (Android doesn't reliably fire contextmenu)
      const LONG_PRESS_MS = 500;
      const MOVE_THRESHOLD = 10;

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) { clearLp(); return; }
        const t = e.touches[0];
        lpStart = { x: t.clientX, y: t.clientY };
        longPressFiredRef.current = false;
        lpTimer = setTimeout(() => {
          if (!lpStart) return;
          longPressFiredRef.current = true;
          const rect = el.getBoundingClientRect();
          const px = lpStart.x - rect.left;
          const py = lpStart.y - rect.top;
          const lngLat = map.unproject([px, py]);
          onContextMenuRef.current?.(lngLat.lat, lngLat.lng, px, py);
        }, LONG_PRESS_MS);
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!lpStart || !lpTimer) return;
        const t = e.touches[0];
        if (Math.hypot(t.clientX - lpStart.x, t.clientY - lpStart.y) > MOVE_THRESHOLD) {
          clearLp();
        }
      };

      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchmove", onTouchMove, { passive: true });
      el.addEventListener("touchend", clearLp);
      el.addEventListener("touchcancel", clearLp);
    }

    // Detect user-initiated map movement to break follow mode
    map.on("movestart", () => {
      if (programmaticMoveRef.current) {
        programmaticMoveRef.current = false;
      } else {
        onUserInteractionRef.current?.();
      }
    });

    mapRef.current = map;

    return () => {
      clearLp();
      for (const m of polygonMarkersRef.current) m.remove();
      polygonMarkersRef.current = [];
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      if (homeMarkerRef.current) { homeMarkerRef.current.remove(); homeMarkerRef.current = null; }
      if (vehicleMarkerRef.current) { vehicleMarkerRef.current.remove(); vehicleMarkerRef.current = null; }
      if (deviceLocationMarkerRef.current) { deviceLocationMarkerRef.current.remove(); deviceLocationMarkerRef.current = null; }
      if (replayMarkerRef.current) { replayMarkerRef.current.remove(); replayMarkerRef.current = null; }
      map.remove();
      mapRef.current = null;
      hasSetInitialViewport.current = false;
    };
  }, []);

  // Update GeoJSON line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) source.setData(missionGeoJson);
  }, [missionGeoJson]);

  // Toggle map layer style (plan / hybrid / satellite)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const showSat = mapLayer !== "plan";
    const showVector = mapLayer !== "satellite";

    try { map.setLayoutProperty("satellite", "visibility", showSat ? "visible" : "none"); } catch {}
    try { map.setLayoutProperty("hills", "visibility", showSat ? "visible" : "none"); } catch {}

    for (const id of baseLayerIdsRef.current) {
      try { map.setLayoutProperty(id, "visibility", showVector ? "visible" : "none"); } catch {}
    }
  }, [mapLayer]);

  // Update home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (homePosition) {
      const lngLat: [number, number] = [homePosition.longitude_deg, homePosition.latitude_deg];
      if (homeMarkerRef.current) {
        homeMarkerRef.current.setLngLat(lngLat);
      } else {
        const markerEl = document.createElement("button");
        markerEl.type = "button";
        markerEl.className = "mission-pin is-home";
        markerEl.textContent = "H";
        markerEl.dataset.missionMarkerSeq = "home";
        markerEl.dataset.missionMarkerKind = "home";
        markerEl.dataset.missionMarkerState = "default";
        markerEl.addEventListener("click", (e) => e.stopPropagation());

        homeMarkerRef.current = new maplibregl.Marker({ element: markerEl, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
      }
    } else if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }
  }, [homePosition]);

  // Update waypoint markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextIndexes = new Set(missionItems.map((item) => item.index));
    for (const [index, marker] of markersRef.current.entries()) {
      if (!nextIndexes.has(index)) {
        marker.remove();
        markersRef.current.delete(index);
      }
    }

    for (const item of missionItems) {
      if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) {
        const existing = markersRef.current.get(item.index);
        if (existing) {
          existing.remove();
          markersRef.current.delete(item.index);
        }
        continue;
      }

      const isDraggable = !readOnly && !item.readOnly;
      const existing = markersRef.current.get(item.index);

      if (existing && existing.isDraggable() !== isDraggable) {
        existing.remove();
        markersRef.current.delete(item.index);
      }

      const reusable = markersRef.current.get(item.index);
      const lngLat: [number, number] = [item.preview.longitude_deg, item.preview.latitude_deg];

      if (reusable) {
        reusable.setLngLat(lngLat);
        reusable.setDraggable(isDraggable);
      } else {
        const markerEl = document.createElement("button");
        markerEl.type = "button";
        markerEl.className = "mission-pin";
        markerEl.dataset.missionMarkerKind = "waypoint";

        markerEl.addEventListener("click", (e) => {
          e.stopPropagation();
          if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
          onSelectIndexRef.current?.(item.index);
        });

        const marker = new maplibregl.Marker({
          element: markerEl,
          anchor: "center",
          draggable: isDraggable,
        })
          .setLngLat(lngLat)
          .addTo(map);

        if (isDraggable) {
          marker.on("drag", () => {
            const pos = marker.getLngLat();
            const m = mapRef.current;
            if (!m) return;
            const src = m.getSource(SOURCE_ID) as GeoJSONSource | undefined;
            if (!src) return;
            const lineCoords: [number, number][] = [];
            const hp = homePositionRef.current;
            if (hp) lineCoords.push([hp.longitude_deg, hp.latitude_deg]);
            for (const mi of missionItemsRef.current) {
              if (mi.preview.latitude_deg === null || mi.preview.longitude_deg === null) continue;
              if (mi.index === item.index) lineCoords.push([pos.lng, pos.lat]);
              else lineCoords.push([mi.preview.longitude_deg, mi.preview.latitude_deg]);
            }
            const feats: any[] = [];
            if (lineCoords.length >= 2) {
              feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: lineCoords }, properties: { kind: "mission-line" } });
            }
            src.setData({ type: "FeatureCollection", features: feats });
          });
          marker.on("dragend", () => {
            const pos = marker.getLngLat();
            onMoveWaypointRef.current?.(item.index, pos.lat, pos.lng);
          });
        }

        markersRef.current.set(item.index, marker);
      }

      const markerElement = markersRef.current.get(item.index)?.getElement();
      if (markerElement) {
        markerElement.textContent = String(item.index + 1);
        markerElement.dataset.missionMarkerSeq = String(item.index);

        const isSelected = selectedIndex === item.index;
        const isCurrent = currentMissionSeq === item.index;
        markerElement.classList.toggle("is-selected", isSelected);
        markerElement.classList.toggle("is-current", isCurrent);

        // Compute state attribute for test/QA selectors
        const state = isSelected && isCurrent
          ? "selected+active"
          : isSelected
            ? "selected"
            : isCurrent
              ? "active"
              : "default";
        markerElement.dataset.missionMarkerState = state;
      }
    }
  }, [missionItems, selectedIndex, readOnly, currentMissionSeq]);

  // Vehicle marker (skip in SVS mode — the pilot IS the vehicle)
  useEffect(() => {
    if (syntheticVision) return;
    const map = mapRef.current;
    if (!map) return;

    if (vehiclePosition) {
      const lngLat: [number, number] = [vehiclePosition.longitude_deg, vehiclePosition.latitude_deg];

      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.setLngLat(lngLat);
        const svg = vehicleMarkerRef.current.getElement().querySelector("svg");
        if (svg) svg.style.transform = `rotate(${vehiclePosition.heading_deg}deg)`;
      } else {
        const el = document.createElement("div");
        el.className = "vehicle-marker";
        el.dataset.missionMarkerKind = "vehicle";
        el.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" style="transform: rotate(${vehiclePosition.heading_deg}deg)"><polygon points="16,4 26,28 16,22 6,28" fill="#ff4444" stroke="#fff" stroke-width="1.5"/></svg>`;

        vehicleMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
      }

      if (followTarget === "vehicle") {
        programmaticMoveRef.current = true;
        map.easeTo({ center: lngLat, duration: 500 });
      }
    } else if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
  }, [vehiclePosition, followTarget, syntheticVision]);

  // SVS camera tracking
  useEffect(() => {
    if (!syntheticVision || !svsTelemetry) return;
    const map = mapRef.current;
    if (!map) return;

    const { latitude_deg, longitude_deg, heading_deg, pitch_deg, roll_deg, altitude_m } = svsTelemetry;
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    map.jumpTo({
      center: [longitude_deg, latitude_deg],
      zoom: clamp(16.5 - Math.log2(Math.max(10, altitude_m) / 30), 11, 17),
      bearing: heading_deg,
      pitch: clamp(75 - pitch_deg, 20, 85),
      roll: roll_deg,
    });
  }, [syntheticVision, svsTelemetry]);

  // Device location marker (blue dot)
  useEffect(() => {
    if (syntheticVision) return;
    const map = mapRef.current;
    if (!map) return;

    if (deviceLocation) {
      const lngLat: [number, number] = [deviceLocation.longitude_deg, deviceLocation.latitude_deg];

      if (deviceLocationMarkerRef.current) {
        deviceLocationMarkerRef.current.setLngLat(lngLat);
      } else {
        const el = document.createElement("div");
        el.className = "device-location-marker";

        deviceLocationMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
      }

      if (followTarget === "device") {
        programmaticMoveRef.current = true;
        map.easeTo({ center: lngLat, duration: 500 });
      }
    } else if (deviceLocationMarkerRef.current) {
      deviceLocationMarkerRef.current.remove();
      deviceLocationMarkerRef.current = null;
    }
  }, [deviceLocation, followTarget, syntheticVision]);

  // One-shot center on vehicle
  useEffect(() => {
    if (!centerOnVehicleKey || !vehiclePosition) return;
    const map = mapRef.current;
    if (!map) return;
    programmaticMoveRef.current = true;
    map.flyTo({
      center: [vehiclePosition.longitude_deg, vehiclePosition.latitude_deg],
      zoom: Math.max(map.getZoom(), 15),
      duration: 800,
    });
  }, [centerOnVehicleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // One-shot center on device
  useEffect(() => {
    if (!centerOnDeviceKey || !deviceLocation) return;
    const map = mapRef.current;
    if (!map) return;
    programmaticMoveRef.current = true;
    map.flyTo({
      center: [deviceLocation.longitude_deg, deviceLocation.latitude_deg],
      zoom: Math.max(map.getZoom(), 15),
      duration: 800,
    });
  }, [centerOnDeviceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to selected marker when triggered by list card click
  useEffect(() => {
    if (!flyToSelectedKey || selectedIndex === null) return;
    const map = mapRef.current;
    if (!map) return;
    const marker = markersRef.current.get(selectedIndex);
    if (marker) {
      const lngLat = marker.getLngLat();
      programmaticMoveRef.current = true;
      map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
  }, [flyToSelectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit bounds on initial load (skip in SVS mode)
  useEffect(() => {
    if (syntheticVision) return;
    const map = mapRef.current;
    if (!map || hasSetInitialViewport.current) return;

    const plottableItems = missionItems.filter(
      (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
    );
    const hasBoundsTarget = plottableItems.length > 0 || homePosition !== null;
    if (!hasBoundsTarget) return;

    const bounds = new maplibregl.LngLatBounds();
    if (homePosition) bounds.extend([homePosition.longitude_deg, homePosition.latitude_deg]);
    for (const item of plottableItems) {
      if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) continue;
      bounds.extend([item.preview.longitude_deg, item.preview.latitude_deg]);
    }

    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    hasSetInitialViewport.current = true;
  }, [missionItems, homePosition, syntheticVision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("grid-polygon") as GeoJSONSource | undefined;
    if (!source) return;

    if (polygonVertices && polygonVertices.length >= 3) {
      const ring = polygonVertices.map((v) => [v.longitude_deg, v.latitude_deg] as [number, number]);
      ring.push(ring[0]);
      source.setData({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {},
      });
    } else if (polygonVertices && polygonVertices.length >= 2) {
      source.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: polygonVertices.map((v) => [v.longitude_deg, v.latitude_deg]) },
        properties: {},
      });
    } else {
      source.setData({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [] },
        properties: {},
      });
    }
  }, [polygonVertices]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const vertices = polygonVertices ?? [];

    while (polygonMarkersRef.current.length > vertices.length) {
      polygonMarkersRef.current.pop()!.remove();
    }

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const lngLat: [number, number] = [v.longitude_deg, v.latitude_deg];
      const existing = polygonMarkersRef.current[i];

      if (existing) {
        existing.setLngLat(lngLat);
        const el = existing.getElement();
        el.textContent = String(i + 1);
        el.classList.toggle("is-closeable", i === 0 && isDrawingPolygon === true && vertices.length >= 3);
      } else {
        const el = document.createElement("div");
        el.className = "polygon-vertex" + (i === 0 ? " is-first" : "");
        el.textContent = String(i + 1);
        if (i === 0 && isDrawingPolygon && vertices.length >= 3) el.classList.add("is-closeable");

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (i === 0 && isDrawingPolygonRef.current && (polygonVerticesRef.current?.length ?? 0) >= 3) {
            onPolygonCompleteRef.current?.();
          }
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: true })
          .setLngLat(lngLat)
          .addTo(map);

        marker.on("drag", () => {
          const pos = marker.getLngLat();
          const verts = polygonVerticesRef.current;
          if (!verts) return;
          const src = map.getSource("grid-polygon") as GeoJSONSource | undefined;
          if (!src) return;
          const coords = verts.map((vv, j) =>
            j === i ? [pos.lng, pos.lat] as [number, number] : [vv.longitude_deg, vv.latitude_deg] as [number, number]
          );
          if (coords.length >= 3) {
            src.setData({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...coords, coords[0]]] }, properties: {} });
          } else if (coords.length >= 2) {
            src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} });
          }
        });

        marker.on("dragend", () => {
          const pos = marker.getLngLat();
          onPolygonVertexMoveRef.current?.(i, pos.lat, pos.lng);
        });

        polygonMarkersRef.current.push(marker);
      }
    }
  }, [polygonVertices, isDrawingPolygon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!isDrawingPolygon) {
      if (map.isStyleLoaded()) {
        const src = map.getSource("polygon-preview") as GeoJSONSource | undefined;
        src?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} });
      }
      return;
    }

    const onMouseMove = (e: MapMouseEvent) => {
      const verts = polygonVerticesRef.current;
      if (!verts || verts.length === 0) return;
      const src = map.getSource("polygon-preview") as GeoJSONSource | undefined;
      if (!src) return;
      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const last: [number, number] = [verts[verts.length - 1].longitude_deg, verts[verts.length - 1].latitude_deg];
      const coords: [number, number][] = [last, cursor];
      if (verts.length >= 2) {
        coords.push([verts[0].longitude_deg, verts[0].latitude_deg]);
      }
      src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} });
    };

    map.on("mousemove", onMouseMove);
    return () => {
      map.off("mousemove", onMouseMove);
      if (map.isStyleLoaded()) {
        const src = map.getSource("polygon-preview") as GeoJSONSource | undefined;
        src?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} });
      }
    };
  }, [isDrawingPolygon]);

  // Update replay flight path
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("replay-path") as GeoJSONSource | undefined;
    if (!source) return;

    if (flightPath && flightPath.length >= 2) {
      source.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: flightPath },
        properties: {},
      });
    } else {
      source.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [] },
        properties: {},
      });
    }
  }, [flightPath]);

  // Replay position marker (orange triangle)
  useEffect(() => {
    if (syntheticVision) return;
    const map = mapRef.current;
    if (!map) return;

    if (replayPosition) {
      const lngLat: [number, number] = [replayPosition.longitude_deg, replayPosition.latitude_deg];

      if (replayMarkerRef.current) {
        replayMarkerRef.current.setLngLat(lngLat);
        const svg = replayMarkerRef.current.getElement().querySelector("svg");
        if (svg) svg.style.transform = `rotate(${replayPosition.heading_deg}deg)`;
      } else {
        const el = document.createElement("div");
        el.className = "vehicle-marker";
        el.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" style="transform: rotate(${replayPosition.heading_deg}deg)"><polygon points="16,4 26,28 16,22 6,28" fill="#ffb020" stroke="#fff" stroke-width="1.5"/></svg>`;

        replayMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
      }
    } else if (replayMarkerRef.current) {
      replayMarkerRef.current.remove();
      replayMarkerRef.current = null;
    }
  }, [replayPosition, syntheticVision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    if (isDrawingPolygon) {
      canvas.style.cursor = "crosshair";
    } else {
      canvas.style.cursor = "";
    }
  }, [isDrawingPolygon]);

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" ref={containerRef} />
      {!syntheticVision && (
        <div className="map-locate-group" style={{ top: 12, left: 12, bottom: "auto", right: "auto" }}>
          <button onClick={() => setMapLayer("plan")} className={`map-locate-btn${mapLayer === "plan" ? " is-active" : ""}`} title="Map">
            <MapIcon size={16} />
          </button>
          <button onClick={() => setMapLayer("hybrid")} className={`map-locate-btn${mapLayer === "hybrid" ? " is-active" : ""}`} title="Hybrid">
            <Layers size={16} />
          </button>
          <button onClick={() => setMapLayer("satellite")} className={`map-locate-btn${mapLayer === "satellite" ? " is-active" : ""}`} title="Satellite">
            <Satellite size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
