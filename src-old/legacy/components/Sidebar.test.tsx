// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

function createVehicle() {
  return {
    telemetry: {},
    linkState: "disconnected",
    vehicleState: {
      armed: true,
      custom_mode: 5,
      mode_name: "LOITER",
      system_status: "ACTIVE",
      vehicle_type: "copter",
      autopilot: "ardu_pilot_mega",
      system_id: 1,
      component_id: 1,
      heartbeat_received: true,
    },
    connected: true,
    connectionError: null,
    isConnecting: false,
    cancelConnect: vi.fn(),
    connectionMode: "udp",
    setConnectionMode: vi.fn(),
    transportDescriptors: [{ kind: "udp", available: true }],
    selectedTransportDescriptor: { kind: "udp", available: true },
    describeTransportAvailability: vi.fn(() => "UDP available"),
    udpBind: "0.0.0.0:14550",
    setUdpBind: vi.fn(),
    tcpAddress: "127.0.0.1:5760",
    setTcpAddress: vi.fn(),
    serialPort: "",
    setSerialPort: vi.fn(),
    baud: 57600,
    setBaud: vi.fn(),
    serialPorts: [],
    btDevices: [],
    btScanning: false,
    selectedBtDevice: "",
    setSelectedBtDevice: vi.fn(),
    scanBleDevices: vi.fn(),
    refreshBondedDevices: vi.fn(),
    takeoffAlt: "10",
    setTakeoffAlt: vi.fn(),
    availableModes: [],
    connect: vi.fn(),
    disconnect: vi.fn(),
    refreshSerialPorts: vi.fn(),
    arm: vi.fn(),
    disarm: vi.fn(),
    setFlightMode: vi.fn(),
    findModeNumber: vi.fn(() => null),
    guided: { available: false, complete: false, provenance: "bootstrap", value: null },
  } as never;
}

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("enables takeoff from guided affordance even when mode text is not GUIDED", () => {
    render(
      <Sidebar
        vehicle={createVehicle()}
        guided={{
          state: { available: true, complete: true, provenance: "stream", value: null },
          activeSession: null,
          guidedGoto: vi.fn(),
          takeoff: vi.fn(),
          stop: vi.fn(),
          available: true,
          takeoffReady: true,
          takeoffPrompt: null,
        }}
        isMobile={false}
        open
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("telemetry-mode-value").textContent).toContain("LOITER");
    expect(screen.getByTestId("controls-takeoff-btn")).toHaveProperty("disabled", false);
    expect(screen.queryByTestId("controls-takeoff-hint")).toBeNull();
  });

  it("fires takeoff from the guided surface instead of a legacy vehicle callback", () => {
    const guidedTakeoff = vi.fn().mockResolvedValue({
      result: "accepted",
      state: { available: true, complete: true, provenance: "stream", value: null },
    });

    render(
      <Sidebar
        vehicle={createVehicle()}
        guided={{
          state: { available: true, complete: true, provenance: "stream", value: null },
          activeSession: null,
          guidedGoto: vi.fn(),
          stop: vi.fn(),
          takeoff: guidedTakeoff,
          available: true,
          takeoffReady: true,
          takeoffPrompt: null,
        }}
        isMobile={false}
        open
        onClose={vi.fn()}
      />, 
    );

    fireEvent.click(screen.getByTestId("controls-takeoff-btn"));

    expect(guidedTakeoff).toHaveBeenCalledWith(10);
  });
});
