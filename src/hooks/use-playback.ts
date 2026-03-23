import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { missingDomainValue } from "../lib/domain-status";
import { isNewerScopedEnvelope, isSameEnvelope } from "../lib/scoped-session-events";
import { selectVehiclePosition } from "../lib/session-selectors";
import { selectTelemetryView } from "../lib/telemetry-selectors";
import {
  seekPlayback,
  subscribePlaybackState,
  type PlaybackStateSnapshot,
} from "../playback";
import {
  ackSessionSnapshot,
  openSessionSnapshot,
  shouldDropEvent,
  subscribeSessionState,
  subscribeStatusTextState,
  subscribeSupportState,
  subscribeTelemetryState,
  type SessionDomain,
  type SessionEnvelope,
} from "../session";
import type { StatusTextDomain } from "../statustext";
import type { SupportDomain } from "../support";
import type { TelemetryDomain } from "../telemetry";

type PendingBarrierState = {
  generation: number;
  envelope: SessionEnvelope;
  cursorUsec: number;
  session?: SessionDomain;
  telemetry?: TelemetryDomain;
  support?: SupportDomain;
  statusText?: StatusTextDomain;
  playback?: PlaybackStateSnapshot;
};

type SeekRequest = {
  generation: number;
  cursorUsec: number;
  mode: "manual" | "play-sync";
  resolve?: () => void;
  reject?: (error: unknown) => void;
};

export type PlaybackState = {
  isPlaying: boolean;
  currentTimeUsec: number;
  sourceKind: "playback";
  speed: number;
  progress: number;
  startUsec: number;
  endUsec: number;
  activeEnvelope: SessionEnvelope | null;
  pendingEnvelope: SessionEnvelope | null;
  sessionDomain: SessionDomain;
  telemetryDomain: TelemetryDomain;
  support: SupportDomain;
  statusText: StatusTextDomain;
  telemetry: ReturnType<typeof selectTelemetryView>;
  vehicleState: SessionDomain["value"] extends infer T ? T extends { vehicle_state?: infer U } ? U : never : never;
  vehiclePosition: ReturnType<typeof selectVehiclePosition>;
  play: () => void;
  pause: () => void;
  seek: (usec: number) => Promise<void>;
  setSpeed: (mult: number) => void;
  stop: () => void;
  configure: (startUsec: number, endUsec: number) => void;
};

export function usePlayback(): PlaybackState {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeUsec, setCurrentTimeUsec] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [activeEnvelope, setActiveEnvelope] = useState<SessionEnvelope | null>(null);
  const [pendingEnvelope, setPendingEnvelope] = useState<SessionEnvelope | null>(null);
  const [sessionDomain, setSessionDomain] = useState<SessionDomain>(missingDomainValue("bootstrap"));
  const [telemetryDomain, setTelemetryDomain] = useState<TelemetryDomain>(missingDomainValue("bootstrap"));
  const [support, setSupport] = useState<SupportDomain>(missingDomainValue("bootstrap"));
  const [statusText, setStatusText] = useState<StatusTextDomain>(missingDomainValue("bootstrap"));

  const rangeRef = useRef({ start: 0, end: 0 });
  const currentRef = useRef(0);
  const optimisticCursorRef = useRef(0);
  const speedRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const activeEnvelopeRef = useRef<SessionEnvelope | null>(null);
  const pendingBarrierRef = useRef<PendingBarrierState | null>(null);
  const playbackGenerationRef = useRef(0);
  const seekCoordinatorRunningRef = useRef(false);
  const queuedPlaybackCursorRef = useRef<number | null>(null);
  const queuedManualSeekRef = useRef<SeekRequest[]>([]);
  const configureAttemptRef = useRef(0);

  const telemetry = useMemo(() => selectTelemetryView(telemetryDomain), [telemetryDomain]);
  const vehiclePosition = useMemo(() => selectVehiclePosition(telemetryDomain), [telemetryDomain]);
  const vehicleState = sessionDomain.value?.vehicle_state ?? null;

  const commitPendingBarrier = useCallback((playback: PlaybackStateSnapshot) => {
    const pending = pendingBarrierRef.current;
    if (!pending || pending.generation !== playbackGenerationRef.current || !playback.barrier_ready) {
      return;
    }

    activeEnvelopeRef.current = pending.envelope;
    setActiveEnvelope(pending.envelope);
    setPendingEnvelope(null);
    pendingBarrierRef.current = null;

    if (pending.session) setSessionDomain(pending.session);
    if (pending.telemetry) setTelemetryDomain(pending.telemetry);
    if (pending.support) setSupport(pending.support);
    if (pending.statusText) setStatusText(pending.statusText);

    const nextCursor = playback.cursor_usec ?? pending.cursorUsec;
    currentRef.current = nextCursor;
    optimisticCursorRef.current = nextCursor;
    setCurrentTimeUsec(nextCursor);
  }, []);

  const pause = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
    setIsPlaying(false);
  }, []);

  const runSeekCoordinator = useCallback(() => {
    if (seekCoordinatorRunningRef.current) {
      return;
    }

    seekCoordinatorRunningRef.current = true;
    void (async () => {
      try {
        while (true) {
          const nextRequest = queuedManualSeekRef.current.shift()
            ?? (queuedPlaybackCursorRef.current == null
              ? null
              : {
                  generation: playbackGenerationRef.current,
                  cursorUsec: queuedPlaybackCursorRef.current,
                  mode: "play-sync" as const,
                });
          queuedPlaybackCursorRef.current = nextRequest?.mode === "play-sync" ? null : queuedPlaybackCursorRef.current;

          if (!nextRequest) {
            return;
          }

          if (nextRequest.generation !== playbackGenerationRef.current) {
            nextRequest.resolve?.();
            continue;
          }

          const baseEnvelope = pendingBarrierRef.current?.envelope ?? activeEnvelopeRef.current;
          if (!baseEnvelope || baseEnvelope.source_kind !== "playback") {
            nextRequest.resolve?.();
            continue;
          }

          const predictedEnvelope = {
            ...baseEnvelope,
            seek_epoch: baseEnvelope.seek_epoch + 1,
            reset_revision: baseEnvelope.reset_revision + 1,
          };
          pendingBarrierRef.current = {
            generation: nextRequest.generation,
            envelope: predictedEnvelope,
            cursorUsec: nextRequest.cursorUsec,
          };
          setPendingEnvelope(predictedEnvelope);

          try {
            const next = await seekPlayback(nextRequest.cursorUsec);
            if (nextRequest.generation !== playbackGenerationRef.current) {
              nextRequest.resolve?.();
              continue;
            }

            const pending = pendingBarrierRef.current;
            if (!pending || pending.generation !== nextRequest.generation) {
              nextRequest.resolve?.();
              continue;
            }

            pending.envelope = next.envelope;
            pending.cursorUsec = next.cursor_usec ?? nextRequest.cursorUsec;
            setPendingEnvelope(next.envelope);
            if (pending.playback?.barrier_ready) {
              commitPendingBarrier(pending.playback);
            }
            nextRequest.resolve?.();
          } catch (error) {
            if (nextRequest.generation === playbackGenerationRef.current) {
              pendingBarrierRef.current = null;
              setPendingEnvelope(null);
              if (nextRequest.mode === "play-sync") {
                console.warn("Failed to sync playback cursor", error);
                pause();
                queuedPlaybackCursorRef.current = null;
              }
              nextRequest.reject?.(error);
            } else {
              nextRequest.resolve?.();
            }
          }
        }
      } finally {
        seekCoordinatorRunningRef.current = false;
        if (queuedManualSeekRef.current.length > 0 || queuedPlaybackCursorRef.current != null) {
          runSeekCoordinator();
        }
      }
    })();
  }, [commitPendingBarrier, pause]);

  const queueManualSeek = useCallback((cursorUsec: number) => new Promise<void>((resolve, reject) => {
    queuedManualSeekRef.current.push({
      generation: playbackGenerationRef.current,
      cursorUsec,
      mode: "manual",
      resolve,
      reject,
    });
    runSeekCoordinator();
  }), [runSeekCoordinator]);

  const queuePlaybackSeek = useCallback((cursorUsec: number) => {
    queuedPlaybackCursorRef.current = cursorUsec;
    runSeekCoordinator();
  }, [runSeekCoordinator]);

  const tick = useCallback((ts: DOMHighResTimeStamp) => {
    const last = lastFrameRef.current;
    if (last !== null) {
      const deltaMs = ts - last;
      const advanceUsec = deltaMs * speedRef.current * 1000;
      const next = Math.min(optimisticCursorRef.current + advanceUsec, rangeRef.current.end);
      optimisticCursorRef.current = next;
      queuePlaybackSeek(next);

      if (next >= rangeRef.current.end) {
        lastFrameRef.current = null;
        rafRef.current = null;
        setIsPlaying(false);
        return;
      }
    }
    lastFrameRef.current = ts;
    rafRef.current = requestAnimationFrame(tick);
  }, [queuePlaybackSeek]);

  const play = useCallback(() => {
    if (rafRef.current !== null || pendingBarrierRef.current) return;
    optimisticCursorRef.current = currentRef.current;
    if (optimisticCursorRef.current >= rangeRef.current.end) {
      optimisticCursorRef.current = rangeRef.current.start;
      queuePlaybackSeek(rangeRef.current.start);
    }
    lastFrameRef.current = null;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [queuePlaybackSeek, tick]);

  const setSpeed = useCallback((mult: number) => {
    speedRef.current = mult;
    setSpeedState(mult);
  }, []);

  const stop = useCallback(() => {
    configureAttemptRef.current += 1;
    playbackGenerationRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
    pendingBarrierRef.current = null;
    activeEnvelopeRef.current = null;
    queuedPlaybackCursorRef.current = null;
    queuedManualSeekRef.current = [];
    currentRef.current = 0;
    optimisticCursorRef.current = 0;
    setCurrentTimeUsec(0);
    setIsPlaying(false);
    setActiveEnvelope(null);
    setPendingEnvelope(null);
    setSessionDomain(missingDomainValue("bootstrap"));
    setTelemetryDomain(missingDomainValue("bootstrap"));
    setSupport(missingDomainValue("bootstrap"));
    setStatusText(missingDomainValue("bootstrap"));
    rangeRef.current = { start: 0, end: 0 };
  }, []);

  const seek = useCallback(async (usec: number) => {
    const clamped = Math.max(rangeRef.current.start, Math.min(usec, rangeRef.current.end));
    if (!activeEnvelopeRef.current) {
      currentRef.current = clamped;
      optimisticCursorRef.current = clamped;
      setCurrentTimeUsec(clamped);
      return;
    }

    pause();
    optimisticCursorRef.current = clamped;
    await queueManualSeek(clamped);
  }, [pause, queueManualSeek]);

  const configure = useCallback((startUsec: number, endUsec: number) => {
    playbackGenerationRef.current += 1;
    const generation = playbackGenerationRef.current;
    const attempt = configureAttemptRef.current + 1;
    configureAttemptRef.current = attempt;
    rangeRef.current = { start: startUsec, end: endUsec };
    currentRef.current = startUsec;
    optimisticCursorRef.current = startUsec;
    setCurrentTimeUsec(startUsec);
    pendingBarrierRef.current = null;
    activeEnvelopeRef.current = null;
    queuedPlaybackCursorRef.current = null;
    queuedManualSeekRef.current = [];
    setPendingEnvelope(null);
    setActiveEnvelope(null);

    void (async () => {
      const snapshot = await openSessionSnapshot("playback");
      if (configureAttemptRef.current !== attempt || playbackGenerationRef.current !== generation) {
        return;
      }

      const ack = await ackSessionSnapshot(snapshot.envelope);
      if (configureAttemptRef.current !== attempt || playbackGenerationRef.current !== generation) {
        return;
      }

      if (ack.result === "rejected") {
        return;
      }

      const envelope = ack.envelope ?? snapshot.envelope;
      activeEnvelopeRef.current = envelope;
      setActiveEnvelope(envelope);
      setSessionDomain(snapshot.session);
      setTelemetryDomain(snapshot.telemetry);
      setSupport(snapshot.support);
      setStatusText(snapshot.status_text);

      const cursor = snapshot.playback.cursor_usec ?? startUsec;
      currentRef.current = cursor;
      optimisticCursorRef.current = cursor;
      setCurrentTimeUsec(cursor);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const disposers: Array<() => void> = [];

    const register = (dispose: () => void) => {
      if (cancelled) {
        dispose();
        return;
      }
      disposers.push(dispose);
    };

    const stageScopedValue = <T,>(
      envelope: SessionEnvelope,
      value: T,
      assignPending: (pending: PendingBarrierState, next: T) => void,
      assignRendered: (next: T) => void,
    ) => {
      const pending = pendingBarrierRef.current;
      if (!pending && !activeEnvelopeRef.current) {
        return;
      }
      if (pending && isSameEnvelope(pending.envelope, envelope)) {
        assignPending(pending, value);
        return;
      }
      if (pending && !isNewerScopedEnvelope(pending.envelope, envelope)) {
        return;
      }

      const active = activeEnvelopeRef.current;
      const isNewerPlaybackEnvelope = active !== null
        && active.source_kind === "playback"
        && envelope.source_kind === "playback"
        && active.session_id === envelope.session_id
        && isNewerScopedEnvelope(active, envelope);

      if (!isNewerPlaybackEnvelope && shouldDropEvent(active, envelope)) {
        return;
      }
      if (active && !isNewerScopedEnvelope(active, envelope)) {
        return;
      }
      activeEnvelopeRef.current = envelope;
      setActiveEnvelope(envelope);
      assignRendered(value);
    };

    void (async () => {
      register(await subscribeSessionState((event) => {
        stageScopedValue(event.envelope, event.value, (pending, value) => {
          pending.session = value;
        }, setSessionDomain);
      }));
      register(await subscribeTelemetryState((event) => {
        stageScopedValue(event.envelope, event.value, (pending, value) => {
          pending.telemetry = value;
        }, setTelemetryDomain);
      }));
      register(await subscribeSupportState((event) => {
        stageScopedValue(event.envelope, event.value, (pending, value) => {
          pending.support = value;
        }, setSupport);
      }));
      register(await subscribeStatusTextState((event) => {
        stageScopedValue(event.envelope, event.value, (pending, value) => {
          pending.statusText = value;
        }, setStatusText);
      }));
      register(await subscribePlaybackState((event) => {
        const pending = pendingBarrierRef.current;
        if (!pending && !activeEnvelopeRef.current) {
          return;
        }
        if (pending && isSameEnvelope(pending.envelope, event.envelope)) {
          if (pending.generation !== playbackGenerationRef.current) {
            return;
          }
          pending.playback = event.value;
          commitPendingBarrier(event.value);
          return;
        }
        if (pending) {
          return;
        }
        if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) {
          return;
        }
        if (event.value.cursor_usec != null && event.value.cursor_usec >= currentRef.current) {
          currentRef.current = event.value.cursor_usec;
          optimisticCursorRef.current = event.value.cursor_usec;
          setCurrentTimeUsec(event.value.cursor_usec);
        }
      }));
    })();

    return () => {
      cancelled = true;
      for (const dispose of disposers) {
        dispose();
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [commitPendingBarrier]);

  const { start, end } = rangeRef.current;
  const progress = end > start ? Math.max(0, Math.min(1, (currentTimeUsec - start) / (end - start))) : 0;

  return {
    isPlaying,
    currentTimeUsec,
    sourceKind: "playback",
    speed,
    progress,
    startUsec: start,
    endUsec: end,
    activeEnvelope,
    pendingEnvelope,
    sessionDomain,
    telemetryDomain,
    support,
    statusText,
    telemetry,
    vehicleState,
    vehiclePosition,
    play,
    pause,
    seek,
    setSpeed,
    stop,
    configure,
  };
}
