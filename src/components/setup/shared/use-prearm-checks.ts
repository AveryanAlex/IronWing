import { useCallback, useEffect, useRef, useState } from "react";

import { requestPrearmChecks } from "../../../calibration";
import { attachAsyncListener } from "../../../lib/async-listener";
import { subscribeStatusText, type StatusMessage } from "../../../statustext";
import { type PrearmBlocker, classifyPrearm } from "./prearm-helpers";

type UsePrearmChecksOptions = {
  connected: boolean;
  canRequestChecks: boolean;
  preArmGood: boolean;
  resetKey: string;
};

type UsePrearmChecksResult = {
  blockers: PrearmBlocker[];
  checking: boolean;
  hasChecked: boolean;
  runChecks: () => Promise<void>;
};

export function usePrearmChecks({
  connected,
  canRequestChecks,
  preArmGood,
  resetKey,
}: UsePrearmChecksOptions): UsePrearmChecksResult {
  const [blockers, setBlockers] = useState<PrearmBlocker[]>([]);
  const [checking, setChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const autoChecked = useRef(false);
  const checkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCheckingTimer = useCallback(() => {
    if (checkingTimerRef.current) {
      clearTimeout(checkingTimerRef.current);
      checkingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleStatus = (msg: StatusMessage) => {
      const normalized = msg.text.toLowerCase();
      if (!normalized.includes("prearm") && !normalized.includes("pre-arm")) return;

      const blocker = classifyPrearm(msg.text, Date.now());
      setBlockers((prev) => {
        const filtered = prev.filter((item) => item.category !== blocker.category);
        return [...filtered, blocker];
      });
    };

    return attachAsyncListener(() => subscribeStatusText(handleStatus));
  }, []);

  useEffect(() => {
    autoChecked.current = false;
    clearCheckingTimer();
    setBlockers([]);
    setChecking(false);
    setHasChecked(false);
  }, [clearCheckingTimer, resetKey]);

  useEffect(() => clearCheckingTimer, [clearCheckingTimer]);

  useEffect(() => {
    if (preArmGood) {
      setBlockers([]);
    }
  }, [preArmGood]);

  const runChecks = useCallback(async () => {
    if (!connected || !canRequestChecks) return;
    clearCheckingTimer();
    setChecking(true);
    setBlockers([]);
    try {
      await requestPrearmChecks();
      setHasChecked(true);
    } catch {
      // Unsupported/request failures are surfaced by disabled gating or other UI paths.
    } finally {
      checkingTimerRef.current = setTimeout(() => {
        checkingTimerRef.current = null;
        setChecking(false);
      }, 3000);
    }
  }, [canRequestChecks, clearCheckingTimer, connected]);

  useEffect(() => {
    if (!connected || !canRequestChecks || autoChecked.current) return;
    autoChecked.current = true;
    void runChecks();
  }, [canRequestChecks, connected, runChecks]);

  return { blockers, checking, hasChecked, runChecks };
}
