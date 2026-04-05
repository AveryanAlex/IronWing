import type { SessionEnvelope, SessionEvent } from "../session";

export function scopedEnvelopeKey(envelope: SessionEnvelope): string {
  return `${envelope.source_kind}:${envelope.session_id}:${envelope.seek_epoch}:${envelope.reset_revision}`;
}

export function isSameEnvelope(current: SessionEnvelope, incoming: SessionEnvelope): boolean {
  return scopedEnvelopeKey(current) === scopedEnvelopeKey(incoming);
}

/**
 * Monotonic progression check for subscription delivery. Returns true when the
 * incoming envelope moves forward in reset_revision or seek_epoch, matches the
 * current scope exactly, or introduces a new source/session context.
 *
 * Used by {@link createLatestScopedEventHandler} to build a cursor that only
 * advances. Compare with `shouldDropEvent` in `session.ts`, which is a strict
 * scope guard that rejects any mismatch from the active envelope.
 */
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
