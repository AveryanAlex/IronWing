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
import { LogsPanel } from "./components/LogsPanel";
import { SetupSectionPanel } from "./components/setup/SetupSectionPanel";
import { InsetPanelFrame } from "./components/InsetPanelFrame";
import { useSession } from "./hooks/use-session";
import { useMission } from "./hooks/use-mission";
import { useSettings } from "./hooks/use-settings";
import { useParams } from "./hooks/use-params";
import { useSetup } from "./hooks/use-setup";
import { useLogs } from "./hooks/use-logs";
import { useRecording } from "./hooks/use-recording";
import { useFirmware } from "./hooks/use-firmware";
import { usePlayback } from "./hooks/use-playback";
import { useBreakpoint } from "./hooks/use-breakpoint";
import { useDeviceLocation } from "./hooks/use-device-location";
import { useGuided } from "./hooks/use-guided";
import { setTelemetryRate } from "./telemetry";
import { type FlightPathPoint } from "./playback";
import type { ActiveTab } from "./types";
import "./app.css";

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

export default function App() {
  const vehicle = useSession();
  const mission = useMission(
    vehicle.connected,
    vehicle.telemetry,
    vehicle.homePosition,
    vehicle.activeEnvelope,
    vehicle.bootstrapMissionState,
  );
  const params = useParams(
    vehicle.connected,
    vehicle.vehicleState?.vehicle_type,
    vehicle.activeEnvelope,
    vehicle.bootstrapParamStore,
    vehicle.bootstrapParamProgress,
  );
  const setup = useSetup(params, vehicle.vehicleState, {
    support: vehicle.support,
    sensorHealth: vehicle.sensorHealth,
    configurationFacts: vehicle.configurationFacts,
    calibration: vehicle.calibration,
  }, vehicle.connected);
  const logs = useLogs();
  const recording = useRecording(vehicle.connected);
  const firmware = useFirmware();
  const playback = usePlayback();
  const replayActive = playback.activeEnvelope?.source_kind === "playback" || playback.pendingEnvelope?.source_kind === "playback";
  const guided = useGuided({
    connected: vehicle.connected,
    sourceKind: replayActive ? "playback" : "live",
    telemetryAltitudeM: vehicle.telemetry.altitude_m,
    guidedDomain: vehicle.guided,
  });
  const { settings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<ActiveTab>("map");
  const { isMobile } = useBreakpoint();
  const deviceLocation = useDeviceLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flightPath, setFlightPath] = useState<FlightPathPoint[] | null>(null);

  useEffect(() => { checkGpuRenderer() }, []);

  useEffect(() => {
    setTelemetryRate(settings.telemetryRateHz).catch((error) => {
      console.warn("Failed to apply telemetry rate", error);
    });
  }, [settings.telemetryRateHz]);

  const flightPathCoords = useMemo<[number, number][] | undefined>(() => {
    if (!flightPath || flightPath.length < 2) return undefined;
    return flightPath.map((p) => [p.lon, p.lat]);
  }, [flightPath]);

  const effectiveVehicle = useMemo(() => {
    if (!replayActive) return vehicle;
    return {
      ...vehicle,
      sessionDomain: playback.sessionDomain,
      telemetryDomain: playback.telemetryDomain,
      support: playback.support,
      statusText: playback.statusText,
      telemetry: playback.telemetry,
      vehicleState: playback.vehicleState,
      vehiclePosition: playback.vehiclePosition,
    };
  }, [playback, replayActive, vehicle]);

  const handleFlightPath = useCallback((path: FlightPathPoint[] | null) => {
    setFlightPath(path);
  }, []);

  if (!vehicle.hydrated) return <div className="h-screen bg-bg-primary" />;

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
            vehicle={effectiveVehicle}
            guided={guided}
            isMobile={isMobile}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            replayActive={replayActive}
            firmwareActive={firmware.isActive}
          />

          <main
            className="flex-1 overflow-hidden"
            style={{ paddingTop: isMobile ? "calc(var(--safe-area-top, 0px) + 0.25rem)" : undefined }}
          >
            {activeTab === "setup" ? (
                <SetupSectionPanel
                  connected={vehicle.connected}
                  vehicleState={vehicle.vehicleState}
                  telemetry={vehicle.telemetry}
                  linkState={vehicle.linkState}
                  setup={setup}
                  support={vehicle.support}
                  sensorHealth={vehicle.sensorHealth.value}
                  homePosition={vehicle.homePosition}
                availableModes={vehicle.availableModes}
                firmware={firmware}
              />
            ) : (
              <InsetPanelFrame>
                {activeTab === "map" ? (
                    <MapPanel
                      vehicle={effectiveVehicle}
                      guided={guided}
                      mission={mission}
                      deviceLocation={deviceLocation}
                      flightPath={flightPathCoords}
                    />
                ) : activeTab === "telemetry" ? (
                  <TelemetryPanel vehicle={effectiveVehicle} mission={mission} />
                ) : activeTab === "hud" ? (
                  <HudPanel vehicle={effectiveVehicle} mission={mission} svsEnabled={settings.svsEnabled} />
                ) : activeTab === "mission" ? (
                  <MissionPanel vehicle={vehicle} mission={mission} deviceLocation={deviceLocation} isMobile={isMobile} />
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
              </InsetPanelFrame>
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
