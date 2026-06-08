import { wasmAvailableMessageRates } from "../wasm";
import { definePlatformCommandHandlers } from "./command-handler";
import { ensureLoadedWasmRuntime } from "./session";

export const vehicleControlCommandHandlers = definePlatformCommandHandlers({
  get_available_modes: async () => {
    const runtime = await ensureLoadedWasmRuntime();
    return runtime.getAvailableModes();
  },
  set_flight_mode: async ({ customMode }) => {
    const runtime = await ensureLoadedWasmRuntime();
    await runtime.setFlightMode(customMode);
  },
  arm_vehicle: async ({ force }) => {
    const runtime = await ensureLoadedWasmRuntime();
    await runtime.armVehicle(force);
  },
  disarm_vehicle: async ({ force }) => {
    const runtime = await ensureLoadedWasmRuntime();
    await runtime.disarmVehicle(force);
  },
  vehicle_takeoff: async ({ altitudeM }) => {
    const runtime = await ensureLoadedWasmRuntime();
    await runtime.vehicleTakeoff(altitudeM);
  },
  set_message_rate: async ({ messageId, rateHz }) => {
    const runtime = await ensureLoadedWasmRuntime();
    await runtime.setMessageRate(messageId, rateHz);
  },
  get_available_message_rates: async () => wasmAvailableMessageRates(),
  set_telemetry_rate: async ({ rateHz }) => {
    const runtime = await ensureLoadedWasmRuntime();
    runtime.setTelemetryRate(rateHz);
  },
});
