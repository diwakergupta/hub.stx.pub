import { useCallback, useEffect, useMemo, useState } from "react";
import { Chart, useChart } from "@chakra-ui/charts";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from "recharts";

import type { BlockSample, BlocksResponse, CostVector } from "@/shared/blocks";

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
  {
    name: "readLengthPct",
    label: "Read Length",
    color: "pink.500",
    yAxisId: "cost",
  },
  {
    name: "readCountPct",
    label: "Read Count",
    color: "blue.500",
    yAxisId: "cost",
  },
  {
    name: "writeLengthPct",
    label: "Write Length",
    color: "green.500",
    yAxisId: "cost",
  },
  {
    name: "writeCountPct",
    label: "Write Count",
    color: "yellow.500",
    yAxisId: "cost",
  },
  {
    name: "runtimePct",
    label: "Runtime",
    color: "purple.500",
    yAxisId: "cost",
  },
  {
    name: "blockSize",
    label: "Block Size (bytes)",
    color: "orange.500",
    yAxisId: "size",
    strokeDasharray: "6 3",
  },
] as const;

const TENURE_SERIES = [
  {
    name: "readLengthPct",
    label: "Read Length",
    color: "pink.500",
    yAxisId: "cost",
  },
  {
    name: "readCountPct",
    label: "Read Count",
    color: "blue.500",
    yAxisId: "cost",
  },
  {
    name: "writeLengthPct",
    label: "Write Length",
    color: "green.500",
    yAxisId: "cost",
  },
  {
    name: "writeCountPct",
    label: "Write Count",
    color: "yellow.500",
    yAxisId: "cost",
  },
  {
    name: "runtimePct",
    label: "Runtime",
    color: "purple.500",
    yAxisId: "cost",
  },
  {
    name: "tenureFees",
    label: "Tenure Fees (STX)",
    color: "orange.500",
    yAxisId: "fees",
    strokeDasharray: "6 3",
  },
] as const;

const TIMESTAMP_SERIES = [
  { name: "timestampMs", label: "Block Timestamp", color: "teal.500" },
] as const;

const CDF_SERIES = [
  { name: "percentile", label: "Arrival CDF", color: "cyan.500" },
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

function ChartCard(props: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { title, description, actions, children } = props;
  return (
    <Stack
      borderWidth="1px"
      borderRadius="lg"
      borderColor="gray.200"
      bg="white"
      p={{ base: 3, md: 4 }}
      gap={4}
    >
      <Stack>
        <Flex
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
          gap={2}
          wrap="wrap"
        >
          <Heading as="h3" size="md">
            {title}
          </Heading>
          {actions}
        </Flex>
        {description ? (
          <Text fontSize="sm" color="gray.500">
            {description}
          </Text>
        ) : null}
      </Stack>
      <Box h={{ base: "300px", md: "400px" }}>{children}</Box>
    </Stack>
  );
}

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
    if (diffs.length === 0) {
      return [];
    }
    return diffs.map((seconds, index) => ({
      seconds,
      percentile: ((index + 1) / diffs.length) * 100,
    }));
  }, [state]);

  const costSeries = useMemo(
    () =>
      COST_SERIES.map((item) => ({
        name: item.name,
        label: item.label,
        color: item.color,
        yAxisId: item.yAxisId,
      })),
    [],
  );

  const tenureSeries = useMemo(
    () =>
      TENURE_SERIES.map((item) => ({
        name: item.name,
        label: item.label,
        color: item.color,
        yAxisId: item.yAxisId,
      })),
    [],
  );

  const timestampSeries = useMemo(
    () =>
      TIMESTAMP_SERIES.map((item) => ({
        name: item.name,
        label: item.label,
        color: item.color,
      })),
    [],
  );

  const cdfSeries = useMemo(
    () =>
      CDF_SERIES.map((item) => ({
        name: item.name,
        label: item.label,
        color: item.color,
      })),
    [],
  );

  const costYAxisKeys = useMemo(() => {
    const keys: Record<string, string[]> = {};
    for (const series of costSeries) {
      const id = series.yAxisId;
      if (!id) continue;
      if (!keys[id]) keys[id] = [];
      keys[id].push(series.name as string);
    }
    return keys;
  }, [costSeries]);

  const tenureYAxisKeys = useMemo(() => {
    const keys: Record<string, string[]> = {};
    for (const series of tenureSeries) {
      const id = series.yAxisId;
      if (!id) continue;
      if (!keys[id]) keys[id] = [];
      keys[id].push(series.name as string);
    }
    return keys;
  }, [tenureSeries]);

  const timestampYAxisKeys = useMemo(() => {
    const keys: Record<string, string[]> = {};
    for (const series of timestampSeries) {
      const id = series.yAxisId;
      if (!id) continue;
      if (!keys[id]) keys[id] = [];
      keys[id].push(series.name as string);
    }
    return keys;
  }, [timestampSeries]);

  const costZoom = useHighlightZoom(blockDomain, costChartData, costYAxisKeys);
  const tenureZoom = useHighlightZoom(
    blockDomain,
    tenureChartData,
    tenureYAxisKeys,
  );
  const timestampZoom = useHighlightZoom(
    blockDomain,
    timestampChartData,
    timestampYAxisKeys,
  );

  const costChart = useChart<CostChartDatum>({
    data: costChartData,
    series: costSeries,
  });
  const tenureChart = useChart<TenureChartDatum>({
    data: tenureChartData,
    series: tenureSeries,
  });
  const timestampChart = useChart<TimestampChartDatum>({
    data: timestampChartData,
    series: timestampSeries,
  });
  const arrivalChart = useChart<CdfPoint>({
    data: cdfData,
    series: cdfSeries,
  });

  const minTimestampMs =
    timestampChart.data.length > 0
      ? Math.min(...timestampChart.data.map((d) => d.timestampMs))
      : null;
  const maxTimestampMs =
    timestampChart.data.length > 0
      ? Math.max(...timestampChart.data.map((d) => d.timestampMs))
      : null;
  const timestampDomain =
    minTimestampMs != null && maxTimestampMs != null
      ? [
          Math.max(0, minTimestampMs - 2 * 60 * 1000),
          maxTimestampMs + 2 * 60 * 1000,
        ]
      : undefined;

  const minCdfSeconds =
    arrivalChart.data.length > 0
      ? Math.min(...arrivalChart.data.map((d) => d.seconds))
      : null;
  const maxCdfSeconds =
    arrivalChart.data.length > 0
      ? Math.max(...arrivalChart.data.map((d) => d.seconds))
      : null;
  const cdfDomain =
    minCdfSeconds != null && maxCdfSeconds != null
      ? [
          Math.max(0.1, minCdfSeconds * 0.8),
          Math.max(minCdfSeconds * 1.2, maxCdfSeconds * 1.2, 1),
        ]
      : undefined;

  const cdfTicks = useMemo(() => {
    if (!cdfDomain) return undefined;
    const [domainMin, domainMax] = cdfDomain;
    if (!(domainMin > 0) || !(domainMax > domainMin)) {
      return undefined;
    }

    const ticks: number[] = [];
    const logMin = Math.floor(Math.log10(domainMin));
    const logMax = Math.ceil(Math.log10(domainMax));
    const multipliers = [1, 2, 5];

    for (let exp = logMin; exp <= logMax; exp += 1) {
      const base = 10 ** exp;
      for (const multiplier of multipliers) {
        const value = multiplier * base;
        if (value >= domainMin && value <= domainMax) {
          ticks.push(Number(value.toPrecision(6)));
        }
      }
    }

    if (ticks.length === 0) {
      ticks.push(Number(domainMin.toPrecision(6)));
      ticks.push(Number(domainMax.toPrecision(6)));
    }

    return Array.from(new Set(ticks)).sort((a, b) => a - b);
  }, [cdfDomain]);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <Container
        maxW={{ base: "100%", md: "6xl" }}
        py={{ base: 12, md: 16 }}
        px={{ base: 4, md: 6 }}
      >
        <Flex
          align="center"
          justify="center"
          minH="40vh"
          borderWidth="1px"
          borderRadius="lg"
          borderColor="gray.200"
          bg="white"
        >
          <Stack align="center" gap={3}>
            <Spinner size="lg" />
            <Text fontSize="sm" color="gray.500">
              Loading recent block metrics…
            </Text>
          </Stack>
        </Flex>
      </Container>
    );
  }

  if (state.status === "error") {
    return (
      <Container
        maxW={{ base: "100%", md: "6xl" }}
        py={{ base: 12, md: 16 }}
        px={{ base: 4, md: 6 }}
      >
        <Stack
          borderWidth="1px"
          borderRadius="lg"
          borderColor="gray.200"
          bg="white"
          p={{ base: 6, md: 8 }}
          gap={4}
        >
          <Heading as="h2" size="lg">
            Unable to load block data
          </Heading>
          <Text color="red.400">{state.message}</Text>
          <Text fontSize="sm" color="gray.500">
            Check the Bun server logs and ensure STACKS_DATA_DIR points to a
            synced chainstate database.
          </Text>
        </Stack>
      </Container>
    );
  }

  const firstBlock = state.blocks[0]?.blockHeight ?? 0;
  const lastBlock = state.blocks[state.blocks.length - 1]?.blockHeight ?? 0;

  return (
    <Container
      maxW={{ base: "100%", md: "8xl" }}
      py={{ base: 6, md: 8 }}
      px={0}
    >
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading size="2xl">Block Metrics</Heading>
          <Text fontSize="lg" color="gray.500">
            Comparing execution costs, tenure fees, and timing over the most
            recent {state.blocks.length} blocks ({firstBlock.toLocaleString()} —{" "}
            {lastBlock.toLocaleString()}).
          </Text>
        </Stack>

        <ChartCard
          title="Block Costs vs Size"
          description="Normalized execution costs across read/write limits alongside on-chain block size."
          actions={
            costZoom.hasCustomDomain ? (
              <Button size="xs" variant="outline" onClick={costZoom.reset}>
                Reset zoom
              </Button>
            ) : null
          }
        >
          <Chart.Root chart={costChart} h="100%">
            <LineChart
              data={costChart.data}
              margin={{ left: 16, right: 16 }}
              onMouseDown={costZoom.onMouseDown}
              onMouseMove={costZoom.onMouseMove}
              onMouseUp={costZoom.onMouseUp}
              onDoubleClick={costZoom.onDoubleClick}
              style={{
                cursor: costZoom.referenceArea
                  ? "crosshair"
                  : costZoom.hasCustomDomain
                    ? "grab"
                    : "default",
              }}
            >
              <XAxis
                dataKey="blockHeight"
                type="number"
                domain={costZoom.xDomain}
                allowDataOverflow
              />
              <YAxis
                yAxisId="cost"
                width={60}
                domain={costZoom.getYDomain("cost")}
              />
              <YAxis yAxisId="cost" domain={[0, "auto"]} width={60} />
              <YAxis yAxisId="size" orientation="right" width={80} />
              <Tooltip content={<Chart.Tooltip />} />
              <Legend content={<Chart.Legend />} />
              {costZoom.referenceArea ? (
                <ReferenceArea
                  yAxisId="cost"
                  x1={costZoom.referenceArea[0]}
                  x2={costZoom.referenceArea[1]}
                  stroke="transparent"
                  fill="rgba(66, 153, 225, 0.18)"
                />
              ) : null}
              {tenureChangeHeights.map((height) => (
                <ReferenceLine
                  key={`tenure-${height}`}
                  x={height}
                  yAxisId="cost"
                  stroke={costChart.color("gray.400")}
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
              ))}
              {costSeries.map((series) => (
                <Line
                  key={series.name.toString()}
                  type="monotone"
                  dataKey={series.name as string}
                  name={series.label}
                  stroke={costChart.color(series.color)}
                  strokeDasharray={series.strokeDasharray}
                  strokeWidth={1.5}
                  yAxisId={series.yAxisId}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </Chart.Root>
        </ChartCard>

        <ChartCard
          title="Tenure Costs vs Fees"
          description="Normalized tenure-level costs paired with tenure transaction fees denominated in STX."
          actions={
            tenureZoom.hasCustomDomain ? (
              <Button size="xs" variant="outline" onClick={tenureZoom.reset}>
                Reset zoom
              </Button>
            ) : null
          }
        >
          <Chart.Root chart={tenureChart} h="100%">
            <LineChart
              data={tenureChart.data}
              margin={{ left: 16, right: 16 }}
              onMouseDown={tenureZoom.onMouseDown}
              onMouseMove={tenureZoom.onMouseMove}
              onMouseUp={tenureZoom.onMouseUp}
              onDoubleClick={tenureZoom.onDoubleClick}
              style={{
                cursor: tenureZoom.referenceArea
                  ? "crosshair"
                  : tenureZoom.hasCustomDomain
                    ? "grab"
                    : "default",
              }}
            >
              <XAxis
                dataKey="blockHeight"
                type="number"
                domain={tenureZoom.xDomain}
                allowDataOverflow
              />
              <YAxis
                yAxisId="cost"
                width={60}
                domain={tenureZoom.getYDomain("cost")}
              />
              <YAxis yAxisId="cost" width={60} />
              <YAxis yAxisId="fees" orientation="right" width={80} />
              <Tooltip content={<Chart.Tooltip />} />
              <Legend content={<Chart.Legend />} />
              {tenureZoom.referenceArea ? (
                <ReferenceArea
                  yAxisId="cost"
                  x1={tenureZoom.referenceArea[0]}
                  x2={tenureZoom.referenceArea[1]}
                  stroke="transparent"
                  fill="rgba(72, 187, 120, 0.2)"
                />
              ) : null}
              {tenureChangeHeights.map((height) => (
                <ReferenceLine
                  key={`tenure-fees-${height}`}
                  x={height}
                  yAxisId="cost"
                  stroke={tenureChart.color("gray.400")}
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
              ))}
              {tenureSeries.map((series) => (
                <Line
                  key={series.name.toString()}
                  type="monotone"
                  dataKey={series.name as string}
                  name={series.label}
                  stroke={tenureChart.color(series.color)}
                  strokeDasharray={series.strokeDasharray}
                  strokeWidth={1.5}
                  yAxisId={series.yAxisId}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </Chart.Root>
        </ChartCard>

        <ChartCard
          title="Block Timestamps"
          actions={
            timestampZoom.hasCustomDomain ? (
              <Button size="xs" variant="outline" onClick={timestampZoom.reset}>
                Reset zoom
              </Button>
            ) : null
          }
        >
          <Chart.Root chart={timestampChart} h="100%">
            <LineChart
              data={timestampChart.data}
              margin={{ left: 16, right: 16, top: 12, bottom: 12 }}
              onMouseDown={timestampZoom.onMouseDown}
              onMouseMove={timestampZoom.onMouseMove}
              onMouseUp={timestampZoom.onMouseUp}
              onDoubleClick={timestampZoom.onDoubleClick}
              style={{
                cursor: timestampZoom.referenceArea
                  ? "crosshair"
                  : timestampZoom.hasCustomDomain
                    ? "grab"
                    : "default",
              }}
            >
              <XAxis
                dataKey="blockHeight"
                type="number"
                domain={timestampZoom.xDomain}
                allowDataOverflow
              />
              <YAxis
                yAxisId="time"
                tickFormatter={timestampChart.formatDate(datetimeFormatOptions)}
                width={120}
                domain={
                  timestampZoom.hasCustomDomain
                    ? timestampZoom.getYDomain("time")
                    : timestampDomain
                }
              />
              <Tooltip
                content={
                  <Chart.Tooltip
                    formatter={timestampChart.formatDate(datetimeFormatOptions)}
                  />
                }
              />
              <Legend content={<Chart.Legend />} />
              {timestampZoom.referenceArea ? (
                <ReferenceArea
                  yAxisId="time"
                  x1={timestampZoom.referenceArea[0]}
                  x2={timestampZoom.referenceArea[1]}
                  stroke="transparent"
                  fill="rgba(102, 126, 234, 0.2)"
                />
              ) : null}
              {tenureChangeHeights.map((height) => (
                <ReferenceLine
                  key={`tenure-time-${height}`}
                  x={height}
                  yAxisId="time"
                  stroke={timestampChart.color("gray.400")}
                  strokeDasharray="4 4"
                />
              ))}
              {timestampSeries.map((series) => (
                <Line
                  key={series.name.toString()}
                  type="monotone"
                  dataKey={series.name as string}
                  name={series.label}
                  stroke={timestampChart.color(series.color)}
                  strokeWidth={2}
                  yAxisId="time"
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </Chart.Root>
        </ChartCard>

        <ChartCard
          title="Block Arrival CDF"
          description="Distribution of inter-block arrival times on a logarithmic scale."
        >
          <Chart.Root chart={arrivalChart} h="100%">
            <LineChart
              data={arrivalChart.data}
              margin={{ left: 16, right: 16, top: 12, bottom: 12 }}
            >
              <XAxis
                dataKey="seconds"
                type="number"
                scale="log"
                domain={cdfDomain}
                allowDataOverflow
                ticks={cdfTicks}
              />
              <YAxis width={60} domain={[0, 100]} />
              <Tooltip content={<Chart.Tooltip />} />
              <Legend content={<Chart.Legend />} />
              {cdfSeries.map((series) => (
                <Line
                  key={series.name.toString()}
                  type="monotone"
                  dataKey={series.name as string}
                  name={series.label}
                  stroke={arrivalChart.color(series.color)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </Chart.Root>
        </ChartCard>
      </Stack>
    </Container>
  );
}

export default BlocksPage;
