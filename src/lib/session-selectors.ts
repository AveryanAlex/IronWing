import type { TelemetryState } from "../telemetry";
import type { DomainValue } from "./domain-status";

export function selectVehiclePosition(domain: DomainValue<TelemetryState> | null | undefined) {
  const navigation = domain?.value?.navigation;

  if (
    navigation?.latitude_deg == null ||
    navigation.longitude_deg == null ||
    !Number.isFinite(navigation.latitude_deg) ||
    !Number.isFinite(navigation.longitude_deg)
  ) {
    return null;
  }

  return {
    latitude_deg: navigation.latitude_deg,
    longitude_deg: navigation.longitude_deg,
    heading_deg: navigation.heading_deg ?? 0,
  };
}
