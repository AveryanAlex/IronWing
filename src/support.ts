import { EVENT_NAMES } from "./lib/generated/events";
import { typedListen, type UnlistenFn } from "./lib/ipc/client";
import type { SupportState } from "./lib/generated/ironwing";
import { createLatestScopedValueHandler } from "./lib/scoped-session-events";
import type { DomainValue } from "./lib/domain-status";
import type { SessionEvent } from "./session";

export type { SupportState };

export type SupportDomain = DomainValue<SupportState>;

export async function subscribeSupport(
  cb: (domain: SupportDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);
  return typedListen(EVENT_NAMES.SUPPORT_STATE, (event) => handleEvent(event.payload));
}
