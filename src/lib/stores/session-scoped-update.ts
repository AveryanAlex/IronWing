import { shouldDropEvent, type SessionEnvelope } from "../../session";
import type { SessionStoreState } from "./session-state";

type ScopedEvent<T> = {
  envelope: SessionEnvelope;
  value: T;
};

export function applyScopedDomainEvent<T>(
  state: SessionStoreState,
  event: ScopedEvent<T>,
  assign: (state: SessionStoreState, value: T) => Partial<SessionStoreState>,
): SessionStoreState {
  if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
    return state;
  }

  return {
    ...state,
    ...assign(state, event.value),
    activeEnvelope: event.envelope,
    activeSource: event.envelope.source_kind,
  };
}
