import { useCallback, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { TopBar } from "./components/TopBar";
import { BottomNav } from "./components/BottomNav";
import { Sidebar } from "./components/Sidebar";
import { MapPanel } from "./components/MapPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { HudPanel } from "./components/hud/HudPanel";
import { MissionPanel } from "./components/MissionPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { LogsPanel } from "./components/LogsPanel";
import { useVehicle } from "./hooks/use-vehicle";
import { useMission } from "./hooks/use-mission";
import { useSettings } from "./hooks/use-settings";
import { useParams } from "./hooks/use-params";
import { useLogs } from "./hooks/use-logs";
import { useRecording } from "./hooks/use-recording";
import { usePlayback } from "./hooks/use-playback";
import { useBreakpoint } from "./hooks/use-breakpoint";
import { useDeviceLocation } from "./hooks/use-device-location";
import { setTelemetryRate } from "./telemetry";
import type { FlightPathPoint } from "./playback";
import "./app.css";

type ActiveTab = "map" | "telemetry" | "hud" | "mission" | "config" | "logs" | "settings";

function checkGpuRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) {
    console.warn("[GPU] WebGL not available");
    toast.error("WebGL is not available — 3D map will not work");
    return;
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (debugInfo) {
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
    console.log(`[GPU] Vendor: ${vendor}`);
    console.log(`[GPU] Renderer: ${renderer}`);

    const isSoftware =
      renderer.includes("SwiftShader") ||
      renderer.includes("Software") ||
      renderer.includes("llvmpipe");
    if (isSoftware) {
      toast.error(
        `Software renderer detected (${renderer}). Performance will be severely degraded. Enable hardware acceleration in your system settings.`,
        { duration: 10000 },
      );
    } else {
      console.log("[GPU] Hardware accelerated");
    }
  } else {
    console.warn("[GPU] WEBGL_debug_renderer_info not available");
  }

  const loseExt = gl.getExtension("WEBGL_lose_context");
  if (loseExt) loseExt.loseContext();
}

/** Interpolate position along the flight path at the given timestamp. */
function interpolatePosition(
  path: FlightPathPoint[],
  timeUsec: number,
): { latitude_deg: number; longitude_deg: number; heading_deg: number } | null {
  if (path.length === 0) return null;
  if (timeUsec <= path[0].timestamp_usec) {
    return { latitude_deg: path[0].lat, longitude_deg: path[0].lon, heading_deg: path[0].heading };
  }
  if (timeUsec >= path[path.length - 1].timestamp_usec) {
    const last = path[path.length - 1];
    return { latitude_deg: last.lat, longitude_deg: last.lon, heading_deg: last.heading };
  }

  // Binary search for bracketing points
  let lo = 0;
  let hi = path.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].timestamp_usec <= timeUsec) lo = mid;
    else hi = mid;
  }

  const a = path[lo];
  const b = path[hi];
  const t = (timeUsec - a.timestamp_usec) / (b.timestamp_usec - a.timestamp_usec);
  return {
    latitude_deg: a.lat + (b.lat - a.lat) * t,
    longitude_deg: a.lon + (b.lon - a.lon) * t,
    heading_deg: a.heading + (b.heading - a.heading) * t,
  };
}

export default function App() {
  const vehicle = useVehicle();
  const mission = useMission(vehicle.connected, vehicle.telemetry, vehicle.homePosition);
  const params = useParams(vehicle.connected, vehicle.vehicleState?.vehicle_type);
  const logs = useLogs();
  const recording = useRecording(vehicle.connected);
  const playback = usePlayback();
  const { settings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<ActiveTab>("map");
  const { isMobile } = useBreakpoint();
  const deviceLocation = useDeviceLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flightPath, setFlightPath] = useState<FlightPathPoint[] | null>(null);

  useEffect(() => { checkGpuRenderer() }, []);

  // Apply saved telemetry rate on mount
  useEffect(() => {
    setTelemetryRate(settings.telemetryRateHz).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const replayActive = playback.isPlaying || playback.currentTimeUsec > 0;

  // Compute map-ready flight path coordinates
  const flightPathCoords = useMemo<[number, number][] | undefined>(() => {
    if (!flightPath || flightPath.length < 2) return undefined;
    return flightPath.map((p) => [p.lon, p.lat]);
  }, [flightPath]);

  // Compute interpolated replay position
  const replayPosition = useMemo(() => {
    if (!flightPath || !replayActive) return null;
    return interpolatePosition(flightPath, playback.currentTimeUsec);
  }, [flightPath, replayActive, playback.currentTimeUsec]);

  const handleFlightPath = useCallback((path: FlightPathPoint[] | null) => {
    setFlightPath(path);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
        {/* Desktop: full top bar with tabs */}
        {!isMobile && (
          <TopBar activeTab={activeTab} onTabChange={setActiveTab} linkState={vehicle.linkState} isRecording={recording.isRecording} />
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Desktop: static sidebar | Mobile: drawer overlay */}
          <Sidebar
            vehicle={vehicle}
            isMobile={isMobile}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            replayActive={replayActive}
          />

          <main
            className="flex-1 overflow-hidden p-2 lg:p-3"
            style={{ paddingTop: isMobile ? "calc(var(--safe-area-top, 0px) + 0.25rem)" : undefined }}
          >
            {activeTab === "map" ? (
              <MapPanel
                vehicle={vehicle}
                mission={mission}
                deviceLocation={deviceLocation}
                flightPath={flightPathCoords}
                replayPosition={replayPosition}
              />
            ) : activeTab === "telemetry" ? (
              <TelemetryPanel vehicle={vehicle} mission={mission} />
            ) : activeTab === "hud" ? (
              <HudPanel vehicle={vehicle} mission={mission} svsEnabled={settings.svsEnabled} />
            ) : activeTab === "mission" ? (
              <MissionPanel vehicle={vehicle} mission={mission} deviceLocation={deviceLocation} />
            ) : activeTab === "config" ? (
              <ConfigPanel params={params} connected={vehicle.connected} />
            ) : activeTab === "logs" ? (
              <LogsPanel
                logs={logs}
                recording={recording}
                connected={vehicle.connected}
                playback={playback}
                onFlightPath={handleFlightPath}
              />
            ) : (
              <SettingsPanel settings={settings} updateSettings={updateSettings} />
            )}
          </main>
        </div>

        {/* Mobile: bottom nav | Desktop: nothing */}
        {isMobile && (
          <BottomNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isConnecting={vehicle.isConnecting}
            connected={vehicle.connected}
            connectionError={vehicle.connectionError}
            onSidebarOpen={() => setSidebarOpen(true)}
          />
        )}

        <Toaster
          richColors
          position={isMobile ? "top-center" : "bottom-right"}
          theme="dark"
          style={isMobile ? { top: "var(--safe-area-top, 0px)" } : undefined}
        />
      </div>
    </TooltipProvider>
  );
}
