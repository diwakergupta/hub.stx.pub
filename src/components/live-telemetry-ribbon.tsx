import React from "react";
import { Activity, Clock, ExternalLink, Zap, Layers } from "lucide-react";
import type { LiveStacksTipState } from "@/hooks/use-live-stacks-tip";

interface LiveTelemetryRibbonProps {
  telemetry: LiveStacksTipState;
}

function formatRelativeTime(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, seconds)}s ago`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) {
    return `${mins}m ${secs}s ago`;
  }
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function LiveTelemetryRibbon({ telemetry }: LiveTelemetryRibbonProps) {
  const { tip, secondsAgo, status, isNewBlock, isLoading } = telemetry;

  if (isLoading && !tip) {
    return (
      <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-3 sm:px-4 sm:py-3 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="h-4 w-48 bg-muted rounded hidden sm:block" />
      </div>
    );
  }

  if (!tip) return null;

  const explorerUrl = `https://explorer.hiro.so/block/${tip.blockHash}?chain=mainnet`;

  // Status visual cues
  const statusConfig = {
    healthy: {
      label: "Active",
      dotClass: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse",
      badgeClass:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      borderClass:
        "border-emerald-500/30 bg-emerald-500/[0.02] dark:border-emerald-500/20 dark:bg-emerald-500/[0.03]",
      timeTextClass: "text-emerald-600 dark:text-emerald-400",
      tooltip: "Healthy fast block cadence (< 45s)",
    },
    warning: {
      label: "Transition",
      dotClass: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
      badgeClass:
        "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      borderClass:
        "border-amber-500/30 bg-amber-500/[0.02] dark:border-amber-500/20 dark:bg-amber-500/[0.03]",
      timeTextClass: "text-amber-600 dark:text-amber-400",
      tooltip: "Waiting for next block / tenure handover (45s – 3m)",
    },
    stale: {
      label: "Delayed",
      dotClass: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)] animate-ping",
      badgeClass:
        "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
      borderClass:
        "border-rose-500/40 bg-rose-500/[0.04] dark:border-rose-500/30 dark:bg-rose-500/[0.04]",
      timeTextClass: "text-rose-600 dark:text-rose-400 font-bold",
      tooltip: "Significant delay in block arrival (> 3m)",
    },
  }[status];

  return (
    <div
      className={`relative w-full rounded-xl border p-3 sm:px-5 sm:py-3 transition-all duration-300 shadow-xs ${
        statusConfig.borderClass
      } ${
        isNewBlock
          ? "ring-2 ring-emerald-500/60 shadow-md shadow-emerald-500/15"
          : ""
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        {/* Left Section: Fixed-width Status Pill & Block Height (Zero layout shift) */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div
            className={`flex items-center justify-center gap-1.5 w-[96px] h-7 rounded-full text-[11px] font-medium border transition-all duration-300 shrink-0 ${
              isNewBlock
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
                : statusConfig.badgeClass
            }`}
            title={isNewBlock ? "New block received!" : statusConfig.tooltip}
          >
            {isNewBlock ? (
              <>
                <Zap className="w-3 h-3 fill-current text-emerald-500 animate-pulse shrink-0" />
                <span className="uppercase tracking-wider font-bold text-[10px]">
                  New Block
                </span>
              </>
            ) : (
              <>
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dotClass}`} />
                <span className="uppercase tracking-wider font-semibold text-[10px]">
                  {statusConfig.label}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Tip:
            </span>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex items-center gap-1 text-sm sm:text-base font-bold font-mono transition-colors duration-300 ${
                isNewBlock
                  ? "text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                  : "text-foreground hover:text-primary"
              }`}
              title={`View Block #${tip.blockHeight.toLocaleString()} on Hiro Explorer`}
            >
              <span>#{tip.blockHeight.toLocaleString()}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>
        </div>

        {/* Center / Stats Section */}
        <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1.5 text-xs text-muted-foreground font-mono">
          {/* Relative Time with Clock */}
          <div
            className="flex items-center gap-1.5"
            title={`Block timestamp: ${new Date(
              tip.timestamp * 1000,
            ).toLocaleTimeString()} UTC`}
          >
            <Clock className="w-3.5 h-3.5 opacity-70" />
            <span>Mined:</span>
            <span className={`font-semibold ${statusConfig.timeTextClass}`}>
              {formatRelativeTime(secondsAgo)}
            </span>
          </div>

          {/* Transactions Count */}
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 opacity-70" />
            <span className="text-foreground font-medium">
              {tip.txCount.toLocaleString()}
            </span>
            <span>{tip.txCount === 1 ? "tx" : "txs"}</span>
            {tip.blockSize > 0 && (
              <span className="text-muted-foreground/80">
                ({formatBytes(tip.blockSize)})
              </span>
            )}
          </div>

          {/* Tenure & Burnchain context */}
          <div className="flex items-center gap-1.5 hidden sm:flex">
            <Layers className="w-3.5 h-3.5 opacity-70" />
            <span>Tenure:</span>
            <span className="text-foreground font-medium">
              #{tip.heightInTenure}
            </span>
            <span>in BTC</span>
            <span className="text-foreground font-medium">
              #{tip.burnBlockHeight.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Truncated Hash / Explorer Pill */}
        <div className="hidden xl:flex items-center gap-2 shrink-0">
          <span
            className="font-mono text-[11px] text-muted-foreground/70 truncate max-w-[140px]"
            title={tip.blockHash}
          >
            0x{tip.blockHash.slice(0, 6)}...{tip.blockHash.slice(-6)}
          </span>
        </div>
      </div>
    </div>
  );
}
