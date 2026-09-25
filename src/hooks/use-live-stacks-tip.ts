import { useState, useEffect, useRef } from "react";
import type { StacksTipTelemetry } from "@/shared/stacks-tip";
import type { TelemetryEvent } from "./use-telemetry-socket";

export type StacksFreshnessStatus = "healthy" | "warning" | "stale";

export interface LiveStacksTipState {
  tip: StacksTipTelemetry | null;
  secondsAgo: number;
  status: StacksFreshnessStatus;
  isNewBlock: boolean;
  isLoading: boolean;
}

export function useLiveStacksTip(lastWsEvent?: TelemetryEvent | null): LiveStacksTipState {
  const [tip, setTip] = useState<StacksTipTelemetry | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const [isNewBlock, setIsNewBlock] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const prevHeightRef = useRef<number | null>(null);
  const pulseTimeoutRef = useRef<Timer | null>(null);
  const localReceivedAtRef = useRef<number>(Date.now());

  // Initial fetch on mount
  useEffect(() => {
    let isCancelled = false;
    async function fetchInitialTip() {
      try {
        const res = await fetch("/api/stacks/tip");
        if (!res.ok) return;
        const data = (await res.json()) as { tip: StacksTipTelemetry | null };
        if (!isCancelled && data.tip) {
          setTip(data.tip);
          prevHeightRef.current = data.tip.blockHeight;
          const baseTime = data.tip.receivedAt || data.tip.timestamp * 1000;
          const initialAge = Math.max(
            0,
            Math.floor((Date.now() - baseTime) / 1000),
          );
          localReceivedAtRef.current = Date.now() - initialAge * 1000;
          setSecondsAgo(initialAge);
        }
      } catch (err) {
        console.warn("Failed to fetch initial Stacks tip:", err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchInitialTip();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Update when WebSocket emits stacks_tip event
  useEffect(() => {
    if (!lastWsEvent || lastWsEvent.type !== "stacks_tip" || !lastWsEvent.data) {
      return;
    }

    const newTip = lastWsEvent.data as StacksTipTelemetry;
    if (!newTip.blockHeight) return;

    if (prevHeightRef.current !== null && newTip.blockHeight > prevHeightRef.current) {
      setIsNewBlock(true);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = setTimeout(() => {
        setIsNewBlock(false);
      }, 2500);
    }
    prevHeightRef.current = newTip.blockHeight;

    // Reset local elapsed baseline to 0s for newly arrived block
    localReceivedAtRef.current = Date.now();
    setTip(newTip);
    setSecondsAgo(0);
    setIsLoading(false);
  }, [lastWsEvent]);

  // Cleanup pulse timeout
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  // Ticking 1-second timer to update secondsAgo
  useEffect(() => {
    if (!tip) return;

    const interval = setInterval(() => {
      const currentAge = Math.max(
        0,
        Math.floor((Date.now() - localReceivedAtRef.current) / 1000),
      );
      setSecondsAgo(currentAge);
    }, 1000);

    return () => clearInterval(interval);
  }, [tip]);

  // Freshness thresholds:
  // < 45s: healthy (green)
  // 45s - 180s (3m): warning (amber)
  // > 180s: stale (red)
  let status: StacksFreshnessStatus = "healthy";
  if (secondsAgo >= 180) {
    status = "stale";
  } else if (secondsAgo >= 45) {
    status = "warning";
  }

  return {
    tip,
    secondsAgo,
    status,
    isNewBlock,
    isLoading,
  };
}
