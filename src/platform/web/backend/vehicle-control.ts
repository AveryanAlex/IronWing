import { wasmAvailableMessageRates } from "../wasm";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import { ensureLoadedWasmRuntime } from "./session";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";

export async function tryHandleVehicleControlCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "get_available_modes": {
      const runtime = await ensureLoadedWasmRuntime();
      return handled(runtime.getAvailableModes());
    }
    case "set_flight_mode": {
      const runtime = await ensureLoadedWasmRuntime();
      await runtime.setFlightMode(Number(args?.customMode ?? 0));
      return handled(undefined);
    }
    case "arm_vehicle": {
      const runtime = await ensureLoadedWasmRuntime();
      await runtime.armVehicle(Boolean(args?.force));
      return handled(undefined);
    }
    case "disarm_vehicle": {
      const runtime = await ensureLoadedWasmRuntime();
      await runtime.disarmVehicle(Boolean(args?.force));
      return handled(undefined);
    }
    case "vehicle_takeoff": {
      const runtime = await ensureLoadedWasmRuntime();
      await runtime.vehicleTakeoff(Number(args?.altitudeM ?? 0));
      return handled(undefined);
    }
    case "set_message_rate": {
      const runtime = await ensureLoadedWasmRuntime();
      await runtime.setMessageRate(Number(args?.messageId ?? 0), Number(args?.rateHz ?? 0));
      return handled(undefined);
    }
    case "get_available_message_rates":
      return handled(await wasmAvailableMessageRates());
    case "set_telemetry_rate": {
      const runtime = await ensureLoadedWasmRuntime();
      runtime.setTelemetryRate(Number(args?.rateHz ?? 0));
      return handled(undefined);
    }
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}
