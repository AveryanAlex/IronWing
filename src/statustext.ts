import { listen, type UnlistenFn } from "@platform/event";
import type { DomainValue } from "./lib/domain-status";
import { createLatestScopedEventHandler, scopedEnvelopeKey } from "./lib/scoped-session-events";
import type { SessionEvent } from "./session";

export type StatusMessage = {
  sequence: number;
  text: string;
  severity: string;
  timestamp_usec?: number;
};

export type StatusTextState = {
  entries: StatusMessage[];
};

export type StatusTextDomain = DomainValue<StatusTextState>;

export async function subscribeStatusText(
  cb: (msg: StatusMessage) => void,
): Promise<UnlistenFn> {
  let deliveredWithoutSequence = 0;
  let lastDeliveredSequence = -1;
  let envelopeKey = "";

  const handleEvent = createLatestScopedEventHandler<StatusTextDomain>((event) => {
    const nextEnvelopeKey = scopedEnvelopeKey(event.envelope);
    const entries = readLiveStatusText(event.value);
    const hasSequence = entries.some((entry) => entry.sequence != null);

    if (nextEnvelopeKey !== envelopeKey) {
      deliveredWithoutSequence = 0;
      lastDeliveredSequence = -1;
      envelopeKey = nextEnvelopeKey;
    }

    if (!hasSequence) {
      if (entries.length < deliveredWithoutSequence) {
        deliveredWithoutSequence = 0;
      }
      for (const entry of entries.slice(deliveredWithoutSequence)) {
        cb(entry);
      }
      deliveredWithoutSequence = entries.length;
      return;
    }

    for (const entry of entries) {
      const sequence = entry.sequence;
      if (sequence > lastDeliveredSequence) {
        cb(entry);
        lastDeliveredSequence = sequence;
      }
    }
  });

  return listen<SessionEvent<StatusTextDomain>>("status_text://state", (event) => handleEvent(event.payload));
}

export function readLiveStatusText(domain: StatusTextDomain | null | undefined): StatusMessage[] {
  return domain?.value?.entries ?? [];
}

export function readPlaybackStatusText(
  domain: StatusTextDomain | null | undefined,
  cursorUsec: number,
): StatusMessage[] {
  return readLiveStatusText(domain).filter((entry) => (entry.timestamp_usec ?? Number.MIN_SAFE_INTEGER) <= cursorUsec);
}
