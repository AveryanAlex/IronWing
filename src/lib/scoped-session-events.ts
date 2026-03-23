import type { SessionEnvelope, SessionEvent } from "../session";

export function scopedEnvelopeKey(envelope: SessionEnvelope): string {
  return `${envelope.source_kind}:${envelope.session_id}:${envelope.seek_epoch}:${envelope.reset_revision}`;
}

export function isSameEnvelope(current: SessionEnvelope, incoming: SessionEnvelope): boolean {
  return scopedEnvelopeKey(current) === scopedEnvelopeKey(incoming);
}

export function isNewerScopedEnvelope(current: SessionEnvelope | null, incoming: SessionEnvelope): boolean {
  if (!current) return true;
  if (incoming.reset_revision !== current.reset_revision) {
    return incoming.reset_revision > current.reset_revision;
  }
  if (incoming.seek_epoch !== current.seek_epoch) {
    return incoming.seek_epoch > current.seek_epoch;
  }
  if (isSameEnvelope(current, incoming)) {
    return true;
  }

  return incoming.source_kind !== current.source_kind || incoming.session_id !== current.session_id;
}

export function createLatestScopedEventHandler<T>(cb: (event: SessionEvent<T>) => void) {
  let latestEnvelope: SessionEnvelope | null = null;

  return (event: SessionEvent<T>) => {
    if (!isNewerScopedEnvelope(latestEnvelope, event.envelope)) {
      return;
    }

    latestEnvelope = event.envelope;
    cb(event);
  };
}

export function createLatestScopedValueHandler<T>(cb: (value: T) => void) {
  const handleEvent = createLatestScopedEventHandler<T>((event) => cb(event.value));
  return (event: SessionEvent<T>) => handleEvent(event);
}
