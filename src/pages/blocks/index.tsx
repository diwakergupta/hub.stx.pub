import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from "recharts";
import { RotateCcw, Activity, Layers, Clock, TrendingUp } from "lucide-react";
import type { BlockSample, BlocksResponse, CostVector } from "@/shared/blocks";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type BlocksState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; blocks: BlockSample[] };

interface CostChartDatum {
  blockHeight: number;
  readLengthPct: number;
  readCountPct: number;
  writeLengthPct: number;
  writeCountPct: number;
  runtimePct: number;
  blockSize: number;
}

interface TenureChartDatum {
  blockHeight: number;
  readLengthPct: number;
  readCountPct: number;
  writeLengthPct: number;
  writeCountPct: number;
  runtimePct: number;
  tenureFees: number;
}

interface TimestampChartDatum {
  blockHeight: number;
  timestampMs: number;
}

interface CdfPoint {
  seconds: number;
  percentile: number;
}

const COST_SERIES = [
  { name: "readLengthPct", label: "Read Length", color: "#ec4899", yAxisId: "cost" },
  { name: "readCountPct", label: "Read Count", color: "#3b82f6", yAxisId: "cost" },
  { name: "writeLengthPct", label: "Write Length", color: "#10b981", yAxisId: "cost" },
  { name: "writeCountPct", label: "Write Count", color: "#f59e0b", yAxisId: "cost" },
  { name: "runtimePct", label: "Runtime", color: "#8b5cf6", yAxisId: "cost" },
  {
    name: "blockSize",
    label: "Block Size (bytes)",
    color: "#f97316",
    yAxisId: "size",
    strokeDasharray: "6 3",
  },
] as const;

const TENURE_SERIES = [
  { name: "readLengthPct", label: "Read Length", color: "#ec4899", yAxisId: "cost" },
  { name: "readCountPct", label: "Read Count", color: "#3b82f6", yAxisId: "cost" },
  { name: "writeLengthPct", label: "Write Length", color: "#10b981", yAxisId: "cost" },
  { name: "writeCountPct", label: "Write Count", color: "#f59e0b", yAxisId: "cost" },
  { name: "runtimePct", label: "Runtime", color: "#8b5cf6", yAxisId: "cost" },
  {
    name: "tenureFees",
    label: "Tenure Fees (STX)",
    color: "#f97316",
    yAxisId: "fees",
    strokeDasharray: "6 3",
  },
] as const;

const TIMESTAMP_SERIES = [
  { name: "timestampMs", label: "Block Timestamp", color: "#14b8a6" },
] as const;

const CDF_SERIES = [
  { name: "percentile", label: "Arrival CDF", color: "#06b6d4" },
] as const;

const datetimeFormatOptions: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const COST_MAX = {
  readLength: 100_000_000,
  readCount: 15_000,
  writeLength: 15_000_000,
  writeCount: 15_000,
  runtime: 5_000_000_000,
} as const;

function normaliseCostVector(source: CostVector, limits: typeof COST_MAX) {
  return {
    readLengthPct: (100 * source.readLength) / limits.readLength,
    readCountPct: (100 * source.readCount) / limits.readCount,
    writeLengthPct: (100 * source.writeLength) / limits.writeLength,
    writeCountPct: (100 * source.writeCount) / limits.writeCount,
    runtimePct: (100 * source.runtime) / limits.runtime,
  };
}

interface ZoomState {
  xDomain: [number, number] | null;
  yDomains: Record<string, [number, number]> | null;
  refLeft: number | null;
  refRight: number | null;
}

function useHighlightZoom<TData extends { blockHeight: number }>(
  initialXDomain: [number, number] | null,
  data: TData[],
  yAxisKeys: Record<string, string[]>,
) {
  const [state, setState] = useState<ZoomState>({
    xDomain: null,
    yDomains: null,
    refLeft: null,
    refRight: null,
  });

  useEffect(() => {
    setState({ xDomain: null, yDomains: null, refLeft: null, refRight: null });
  }, [initialXDomain?.[0], initialXDomain?.[1]]);

  const onMouseDown = useCallback((event: MouseHandlerDataParam) => {
    const value = event?.activeLabel;
    if (typeof value !== "number") return;
    setState((prev) => ({ ...prev, refLeft: value, refRight: value }));
  }, []);

  const onMouseMove = useCallback((event: MouseHandlerDataParam) => {
    const value = event?.activeLabel;
    if (typeof value !== "number") return;
    setState((prev) => {
      if (prev.refLeft == null) return prev;
      if (prev.refRight === value) return prev;
      return { ...prev, refRight: value };
    });
  }, []);

  const onMouseUp = useCallback(() => {
    setState((prev) => {
      if (
        prev.refLeft === null ||
        prev.refRight === null ||
        prev.refLeft === prev.refRight
      ) {
        return { ...prev, refLeft: null, refRight: null };
      }
      const newXDomain: [number, number] = [
        Math.min(prev.refLeft, prev.refRight),
        Math.max(prev.refLeft, prev.refRight),
      ];

      const visibleData = data.filter(
        (d) => d.blockHeight >= newXDomain[0] && d.blockHeight <= newXDomain[1],
      );

      const newYDomains: Record<string, [number, number]> = {};

      if (visibleData.length > 0) {
        for (const yAxisId in yAxisKeys) {
          const keys = yAxisKeys[yAxisId];
          let min = Infinity;
          let max = -Infinity;

          for (const item of visibleData) {
            for (const key of keys) {
              const value = item[key as keyof TData];
              if (typeof value === "number") {
                if (value < min) min = value;
                if (value > max) max = value;
              }
            }
          }

          if (min !== Infinity && max !== -Infinity) {
            const padding = (max - min) * 0.05 || 1;
            newYDomains[yAxisId] = [min - padding, max + padding];
          }
        }
      }

      return {
        xDomain: newXDomain,
        yDomains: newYDomains,
        refLeft: null,
        refRight: null,
      };
    });
  }, [data, yAxisKeys]);

  const reset = useCallback(() => {
    setState({ xDomain: null, yDomains: null, refLeft: null, refRight: null });
  }, []);

  const xDomainValue: [number | "auto", number | "auto"] = state.xDomain ??
    initialXDomain ?? ["auto", "auto"];

  const getYDomain = useCallback(
    (yAxisId: string): [number | "auto", number | "auto"] => {
      return state.yDomains?.[yAxisId] ?? ["auto", "auto"];
    },
    [state.yDomains],
  );

  const referenceArea =
    state.refLeft !== null &&
    state.refRight !== null &&
    state.refLeft !== state.refRight
      ? [
          Math.min(state.refLeft, state.refRight),
          Math.max(state.refLeft, state.refRight),
        ]
      : null;

  return {
    xDomain: xDomainValue,
    getYDomain,
    referenceArea,
    hasCustomDomain: state.xDomain != null,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick: reset,
    reset,
  } as const;
}

function ChartCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-2 border-b border-border flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && (
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          )}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="p-4 h-[380px]">{children}</CardContent>
    </Card>
  );
}

export function BlocksPage() {
  const [state, setState] = useState<BlocksState>({ status: "idle" });

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const response = await fetch("/api/blocks", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as BlocksResponse;
        if (!disposed) {
          setState({ status: "ready", blocks: payload.blocks });
        }
      } catch (error) {
        if (disposed) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unknown error loading block data";
        setState({ status: "error", message });
      }
    }

    void load();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  const blocks = state.status === "ready" ? state.blocks : [];
  const blockDomain = useMemo<[number, number] | null>(() => {
    if (blocks.length === 0) return null;
    const first = blocks[0]?.blockHeight ?? null;
    const last = blocks[blocks.length - 1]?.blockHeight ?? null;
    if (first == null || last == null) return null;
    return [Math.min(first, last), Math.max(first, last)];
  }, [blocks]);

  const tenureChangeHeights = useMemo(() => {
    return blocks
      .filter((block) => block.tenureChanged)
      .map((block) => block.blockHeight);
  }, [blocks]);

  const costChartData = useMemo<CostChartDatum[]>(() => {
    return blocks.map((block) => ({
      blockHeight: block.blockHeight,
      ...normaliseCostVector(block.cost, COST_MAX),
      blockSize: block.blockSize,
    }));
  }, [blocks]);

  const tenureChartData = useMemo<TenureChartDatum[]>(() => {
    return blocks.map((block) => ({
      blockHeight: block.blockHeight,
      ...normaliseCostVector(block.tenureCost, COST_MAX),
      tenureFees: block.tenureTxFees / 1_000_000,
    }));
  }, [blocks]);

  const timestampChartData = useMemo<TimestampChartDatum[]>(() => {
    return blocks.map((block) => ({
      blockHeight: block.blockHeight,
      timestampMs: block.timestamp * 1000,
    }));
  }, [blocks]);

  const cdfData = useMemo<CdfPoint[]>(() => {
    if (blocks.length < 2) return [];
    const diffs: number[] = [];
    for (let i = 1; i < blocks.length; i += 1) {
      const diff = blocks[i].timestamp - blocks[i - 1].timestamp;
      if (Number.isFinite(diff)) {
        const adjusted = diff > 0 ? diff : 0.1;
        diffs.push(adjusted);
      }
    }
    diffs.sort((a, b) => a - b);
    if (diffs.length === 0) return [];
    return diffs.map((seconds, index) => ({
      seconds,
      percentile: ((index + 1) / diffs.length) * 100,
    }));
  }, [blocks]);

  const costYAxisKeys = useMemo(() => {
    const keys: Record<string, string[]> = {};
    for (const series of COST_SERIES) {
      const id = series.yAxisId;
      if (!keys[id]) keys[id] = [];
      keys[id].push(series.name);
    }
    return keys;
  }, []);

  const tenureYAxisKeys = useMemo(() => {
    const keys: Record<string, string[]> = {};
    for (const series of TENURE_SERIES) {
      const id = series.yAxisId;
      if (!keys[id]) keys[id] = [];
      keys[id].push(series.name);
    }
    return keys;
  }, []);

  const timestampYAxisKeys = useMemo(() => {
    const keys: Record<string, string[]> = {};
    for (const series of TIMESTAMP_SERIES) {
      keys["time"] = ["timestampMs"];
    }
    return keys;
  }, []);

  const costZoom = useHighlightZoom(blockDomain, costChartData, costYAxisKeys);
  const tenureZoom = useHighlightZoom(blockDomain, tenureChartData, tenureYAxisKeys);
  const timestampZoom = useHighlightZoom(blockDomain, timestampChartData, timestampYAxisKeys);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    color: "hsl(var(--card-foreground))",
    fontSize: "12px",
    fontFamily: "monospace",
  };

  const firstBlock = blocks[0]?.blockHeight ?? 0;
  const lastBlock = blocks[blocks.length - 1]?.blockHeight ?? 0;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Block Metrics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Execution costs, tenure transaction fees, and arrival intervals over recent Nakamoto blocks (
            {firstBlock > 0 ? `#${firstBlock.toLocaleString()} — #${lastBlock.toLocaleString()}` : "loading..."}).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Block Costs vs Size */}
        <ChartCard
          title="Block Costs vs Size"
          description="Normalized execution costs across read/write limits alongside block size."
          actions={
            costZoom.hasCustomDomain ? (
              <Button size="sm" variant="outline" onClick={costZoom.reset} className="h-7 text-xs gap-1">
                <RotateCcw className="w-3 h-3" /> Reset zoom
              </Button>
            ) : null
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={costChartData}
              margin={{ top: 8, right: 12, left: -10, bottom: 8 }}
              onMouseDown={costZoom.onMouseDown}
              onMouseMove={costZoom.onMouseMove}
              onMouseUp={costZoom.onMouseUp}
              onDoubleClick={costZoom.onDoubleClick}
            >
              <XAxis dataKey="blockHeight" domain={costZoom.xDomain} type="number" allowDataOverflow tick={{ fontSize: 11 }} />
              <YAxis yAxisId="cost" domain={costZoom.getYDomain("cost")} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="size" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: "8px" }} />
              {costZoom.referenceArea ? (
                <ReferenceArea
                  yAxisId="cost"
                  x1={costZoom.referenceArea[0]}
                  x2={costZoom.referenceArea[1]}
                  stroke="transparent"
                  fill="rgba(56, 189, 248, 0.2)"
                />
              ) : null}
              {tenureChangeHeights.map((h) => (
                <ReferenceLine key={h} x={h} yAxisId="cost" stroke="#94a3b8" strokeDasharray="3 3" />
              ))}
              {COST_SERIES.map((s) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  name={s.label}
                  stroke={s.color}
                  strokeDasharray={s.strokeDasharray}
                  strokeWidth={1.5}
                  yAxisId={s.yAxisId}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Tenure Costs vs Fees */}
        <ChartCard
          title="Tenure Costs vs Fees"
          description="Normalized tenure-level costs paired with tenure transaction fees in STX."
          actions={
            tenureZoom.hasCustomDomain ? (
              <Button size="sm" variant="outline" onClick={tenureZoom.reset} className="h-7 text-xs gap-1">
                <RotateCcw className="w-3 h-3" /> Reset zoom
              </Button>
            ) : null
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={tenureChartData}
              margin={{ top: 8, right: 12, left: -10, bottom: 8 }}
              onMouseDown={tenureZoom.onMouseDown}
              onMouseMove={tenureZoom.onMouseMove}
              onMouseUp={tenureZoom.onMouseUp}
              onDoubleClick={tenureZoom.onDoubleClick}
            >
              <XAxis dataKey="blockHeight" domain={tenureZoom.xDomain} type="number" allowDataOverflow tick={{ fontSize: 11 }} />
              <YAxis yAxisId="cost" domain={tenureZoom.getYDomain("cost")} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="fees" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: "8px" }} />
              {tenureZoom.referenceArea ? (
                <ReferenceArea
                  yAxisId="cost"
                  x1={tenureZoom.referenceArea[0]}
                  x2={tenureZoom.referenceArea[1]}
                  stroke="transparent"
                  fill="rgba(74, 222, 128, 0.2)"
                />
              ) : null}
              {tenureChangeHeights.map((h) => (
                <ReferenceLine key={h} x={h} yAxisId="cost" stroke="#94a3b8" strokeDasharray="3 3" />
              ))}
              {TENURE_SERIES.map((s) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  name={s.label}
                  stroke={s.color}
                  strokeDasharray={s.strokeDasharray}
                  strokeWidth={1.5}
                  yAxisId={s.yAxisId}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Block Timestamps */}
        <ChartCard
          title="Block Timestamps"
          description="Chronological arrival timestamps for recent blocks."
          actions={
            timestampZoom.hasCustomDomain ? (
              <Button size="sm" variant="outline" onClick={timestampZoom.reset} className="h-7 text-xs gap-1">
                <RotateCcw className="w-3 h-3" /> Reset zoom
              </Button>
            ) : null
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={timestampChartData}
              margin={{ top: 8, right: 12, left: 10, bottom: 8 }}
              onMouseDown={timestampZoom.onMouseDown}
              onMouseMove={timestampZoom.onMouseMove}
              onMouseUp={timestampZoom.onMouseUp}
              onDoubleClick={timestampZoom.onDoubleClick}
            >
              <XAxis dataKey="blockHeight" domain={timestampZoom.xDomain} type="number" allowDataOverflow tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="time"
                tickFormatter={(ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: any) => [new Date(val).toLocaleString([], datetimeFormatOptions), "Timestamp"]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: "8px" }} />
              {timestampZoom.referenceArea ? (
                <ReferenceArea
                  yAxisId="time"
                  x1={timestampZoom.referenceArea[0]}
                  x2={timestampZoom.referenceArea[1]}
                  stroke="transparent"
                  fill="rgba(129, 140, 248, 0.2)"
                />
              ) : null}
              {TIMESTAMP_SERIES.map((s) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  yAxisId="time"
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Block Arrival CDF */}
        <ChartCard
          title="Block Arrival CDF"
          description="Distribution of inter-block arrival times on a logarithmic scale."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cdfData} margin={{ top: 8, right: 12, left: -10, bottom: 8 }}>
              <XAxis dataKey="seconds" type="number" scale="log" domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => [`${Math.round(val)}%`, "Percentile"]} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: "8px" }} />
              {CDF_SERIES.map((s) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

export default BlocksPage;
