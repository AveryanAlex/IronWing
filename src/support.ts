import { listen, type UnlistenFn } from "@platform/event";
import { createLatestScopedValueHandler } from "./lib/scoped-session-events";
import type { DomainValue } from "./lib/domain-status";
import type { SessionEvent } from "./session";

export type SupportState = {
  can_request_prearm_checks: boolean;
  can_calibrate_accel: boolean;
  can_calibrate_compass: boolean;
  can_calibrate_radio: boolean;
};

export type SupportDomain = DomainValue<SupportState>;

export async function subscribeSupport(
  cb: (domain: SupportDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);
  return listen<SessionEvent<SupportDomain>>("support://state", (event) => handleEvent(event.payload));
}
