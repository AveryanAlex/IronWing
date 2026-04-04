import { derived, type Readable } from "svelte/store";

import { createSessionLifecycleView } from "../platform/session";
import { selectVehiclePosition, selectVehicleStatusCardView } from "../session-selectors";
import { selectTelemetrySummaryView, selectTelemetryView } from "../telemetry-selectors";
import type { SessionStoreState } from "./session-state";

export function createSessionViewStore(store: Readable<SessionStoreState>) {
  return derived(store, ($session) => {
    const lifecycle = createSessionLifecycleView(
      $session.activeEnvelope,
      $session.sessionDomain,
      $session.optimisticConnection,
    );
    const connected = lifecycle.linkState === "connected";
    const isConnecting = lifecycle.linkState === "connecting";
    const telemetry = selectTelemetryView($session.telemetryDomain);
    const vehicleState = lifecycle.session?.vehicle_state ?? null;

    return {
      ...lifecycle,
      hydrated: $session.hydrated,
      lastPhase: $session.lastPhase,
      lastError: $session.lastError,
      activeEnvelope: $session.activeEnvelope,
      activeSource: $session.activeSource,
      telemetry,
      telemetrySummary: selectTelemetrySummaryView(connected, telemetry),
      vehicleState,
      vehicleStatusCard: selectVehicleStatusCardView({
        connected,
        vehicleState,
        activeSource: $session.activeSource,
      }),
      homePosition: lifecycle.session?.home_position ?? null,
      vehiclePosition: selectVehiclePosition($session.telemetryDomain),
      connected,
      isConnecting,
      selectedTransportDescriptor:
        $session.transportDescriptors.find((descriptor) => descriptor.kind === $session.connectionForm.mode) ?? null,
    };
  });
}

export type SessionViewStore = ReturnType<typeof createSessionViewStore>;
