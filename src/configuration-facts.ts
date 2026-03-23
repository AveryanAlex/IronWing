import { listen, type UnlistenFn } from "@platform/event";
import { createLatestScopedValueHandler } from "./lib/scoped-session-events";
import type { DomainValue } from "./lib/domain-status";
import type { SessionEvent } from "./session";

export type ConfigurationFlag = {
  configured: boolean;
};

export type ConfigurationFactsState = {
  frame: ConfigurationFlag | null;
  gps: ConfigurationFlag | null;
  battery_monitor: ConfigurationFlag | null;
  motors_esc: ConfigurationFlag | null;
};

export type ConfigurationFactsDomain = DomainValue<ConfigurationFactsState>;

export async function subscribeConfigurationFacts(
  cb: (domain: ConfigurationFactsDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);
  return listen<SessionEvent<ConfigurationFactsDomain>>(
    "configuration_facts://state",
    (event) => handleEvent(event.payload),
  );
}

export async function subscribeConfigurationFactsEvent(
  cb: (event: SessionEvent<ConfigurationFactsDomain>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<ConfigurationFactsDomain>>(
    "configuration_facts://state",
    (event) => cb(event.payload),
  );
}
