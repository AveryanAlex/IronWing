import { useCallback, useRef, useState } from "react";

export type PlaybackState = {
  isPlaying: boolean;
  currentTimeUsec: number;
  speed: number;
  /** 0..1 progress through the log */
  progress: number;
  startUsec: number;
  endUsec: number;
};

export function usePlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeUsec, setCurrentTimeUsec] = useState(0);
  const [speed, setSpeedState] = useState(1);

  const rangeRef = useRef({ start: 0, end: 0 });
  const currentRef = useRef(0);
  const speedRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const tick = useCallback((ts: DOMHighResTimeStamp) => {
    const last = lastFrameRef.current;
    if (last !== null) {
      const deltaMs = ts - last;
      const advanceUsec = deltaMs * speedRef.current * 1000;
      const next = Math.min(
        currentRef.current + advanceUsec,
        rangeRef.current.end,
      );
      currentRef.current = next;
      setCurrentTimeUsec(next);

      if (next >= rangeRef.current.end) {
        // Reached end — auto-pause
        lastFrameRef.current = null;
        rafRef.current = null;
        setIsPlaying(false);
        return;
      }
    }
    lastFrameRef.current = ts;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (rafRef.current !== null) return;
    // If at end, restart from beginning
    if (currentRef.current >= rangeRef.current.end) {
      currentRef.current = rangeRef.current.start;
      setCurrentTimeUsec(rangeRef.current.start);
    }
    lastFrameRef.current = null;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
    setIsPlaying(false);
  }, []);

  const seek = useCallback((usec: number) => {
    const clamped = Math.max(
      rangeRef.current.start,
      Math.min(usec, rangeRef.current.end),
    );
    currentRef.current = clamped;
    setCurrentTimeUsec(clamped);
  }, []);

  const setSpeed = useCallback((mult: number) => {
    speedRef.current = mult;
    setSpeedState(mult);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
    currentRef.current = 0;
    setCurrentTimeUsec(0);
    setIsPlaying(false);
    rangeRef.current = { start: 0, end: 0 };
  }, []);

  const configure = useCallback((startUsec: number, endUsec: number) => {
    rangeRef.current = { start: startUsec, end: endUsec };
    currentRef.current = startUsec;
    setCurrentTimeUsec(startUsec);
  }, []);

  const { start, end } = rangeRef.current;
  const progress =
    end > start
      ? Math.max(0, Math.min(1, (currentTimeUsec - start) / (end - start)))
      : 0;

  return {
    isPlaying,
    currentTimeUsec,
    speed,
    progress,
    startUsec: rangeRef.current.start,
    endUsec: rangeRef.current.end,
    play,
    pause,
    seek,
    setSpeed,
    stop,
    configure,
  };
}
