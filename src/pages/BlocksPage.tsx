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
} from "recharts";

import type { CategoricalChartState } from "recharts/types/chart/generateCategoricalChart";

import type { BlockSample, BlocksResponse } from "@/shared/blocks";

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

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-US");
const secondsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const stxFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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
      p={{ base: 4, md: 6 }}
      gap={4}
    >
      <Stack spacing={1}>
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
      <Box h={{ base: "260px", md: "340px" }}>{children}</Box>
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
  domain: [number, number] | null;
  refLeft: number | null;
  refRight: number | null;
}

function useHighlightZoom(initialDomain: [number, number] | null) {
  const [{ domain, refLeft, refRight }, setState] = useState<ZoomState>(() => ({
    domain: null,
    refLeft: null,
    refRight: null,
  }));

  useEffect(() => {
    setState({ domain: null, refLeft: null, refRight: null });
  }, [initialDomain?.[0], initialDomain?.[1]]);

  const onMouseDown = useCallback((event: CategoricalChartState | undefined) => {
    const value = event?.activeLabel;
    if (typeof value !== "number") return;
    setState((prev) => ({ ...prev, refLeft: value, refRight: value }));
  }, []);

  const onMouseMove = useCallback((event: CategoricalChartState | undefined) => {
    const value = event?.activeLabel;
    if (typeof value !== "number") return;
    setState((prev) => {
      if (prev.refLeft == null) return prev;
      if (prev.refRight === value) return prev;
      return { ...prev, refRight: value };
    });
  }, []);

  const clampSelection = useCallback((left: number | null, right: number | null) => {
    if (left == null || right == null) return null;
    if (left === right) return null;
    const min = Math.min(left, right);
    const max = Math.max(left, right);
    return [min, max] as [number, number];
  }, []);

  const onMouseUp = useCallback(() => {
    setState((prev) => {
      const range = clampSelection(prev.refLeft, prev.refRight);
      if (!range) {
        return { ...prev, refLeft: null, refRight: null };
      }
      return { domain: range, refLeft: null, refRight: null };
    });
  }, [clampSelection]);

  const onMouseLeave = useCallback(() => {
    setState((prev) => ({ ...prev, refLeft: null, refRight: null }));
  }, []);

  const reset = useCallback(() => {
    setState({ domain: null, refLeft: null, refRight: null });
  }, [initialDomain]);

  const domainValue: [number | "auto", number | "auto"] =
    domain ?? initialDomain ?? ["auto", "auto"];
  const referenceArea = clampSelection(refLeft, refRight);

  return {
    domain: domainValue,
    referenceArea,
    hasCustomDomain: domain != null,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
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

  const costZoom = useHighlightZoom(blockDomain);
  const tenureZoom = useHighlightZoom(blockDomain);
  const timestampZoom = useHighlightZoom(blockDomain);

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
        strokeDasharray: item.strokeDasharray,
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
        strokeDasharray: item.strokeDasharray,
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
      maxW={{ base: "100%", md: "6xl" }}
      py={{ base: 10, md: 14 }}
      px={{ base: 4, md: 6 }}
    >
      <Stack gap={10}>
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
              onMouseLeave={costZoom.onMouseLeave}
              onDoubleClick={costZoom.onDoubleClick}
              style={{ cursor: costZoom.referenceArea ? "crosshair" : costZoom.hasCustomDomain ? "grab" : "default" }}
            >
              <XAxis
                dataKey="blockHeight"
                type="number"
                domain={costZoom.domain}
                allowDataOverflow
              />
              <YAxis
                yAxisId="cost"
                tickFormatter={(value: number) =>
                  `${percentFormatter.format(value)}%`
                }
                width={60}
              />
              <YAxis
                yAxisId="size"
                orientation="right"
                tickFormatter={(value: number) => numberFormatter.format(value)}
                width={80}
              />
              <Tooltip
                content={
                  <Chart.Tooltip
                    formatter={(value: number, name: string) => {
                      if (name.includes("bytes")) {
                        return [numberFormatter.format(value), name] as const;
                      }
                      return [
                        `${percentFormatter.format(value)}%`,
                        name,
                      ] as const;
                    }}
                  />
                }
              />
              <Legend content={<Chart.Legend />} />
              {costZoom.referenceArea ? (
                <ReferenceArea
                  x1={costZoom.referenceArea[0]}
                  x2={costZoom.referenceArea[1]}
                  y1="auto"
                  y2="auto"
                  strokeOpacity={0}
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
                  ifOverflow="extendDomain"
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
                  strokeWidth={series.yAxisId === "size" ? 2.5 : 1.75}
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
              onMouseLeave={tenureZoom.onMouseLeave}
              onDoubleClick={tenureZoom.onDoubleClick}
              style={{ cursor: tenureZoom.referenceArea ? "crosshair" : tenureZoom.hasCustomDomain ? "grab" : "default" }}
            >
              <XAxis
                dataKey="blockHeight"
                type="number"
                domain={tenureZoom.domain}
                allowDataOverflow
              />
              <YAxis
                yAxisId="cost"
                tickFormatter={(value: number) =>
                  `${percentFormatter.format(value)}%`
                }
                width={60}
              />
              <YAxis
                yAxisId="fees"
                orientation="right"
                tickFormatter={(value: number) => stxFormatter.format(value)}
                width={80}
              />
              <Tooltip
                content={
                  <Chart.Tooltip
                    formatter={(value: number, name: string) => {
                      if (name.includes("Fees")) {
                        return [
                          `${stxFormatter.format(value)} STX`,
                          name,
                        ] as const;
                      }
                      return [
                        `${percentFormatter.format(value)}%`,
                        name,
                      ] as const;
                    }}
                  />
                }
              />
              <Legend content={<Chart.Legend />} />
              {tenureZoom.referenceArea ? (
                <ReferenceArea
                  x1={tenureZoom.referenceArea[0]}
                  x2={tenureZoom.referenceArea[1]}
                  y1="auto"
                  y2="auto"
                  strokeOpacity={0}
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
                  ifOverflow="extendDomain"
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
                  strokeWidth={series.yAxisId === "fees" ? 2.5 : 1.75}
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
              onMouseLeave={timestampZoom.onMouseLeave}
              onDoubleClick={timestampZoom.onDoubleClick}
              style={{ cursor: timestampZoom.referenceArea ? "crosshair" : timestampZoom.hasCustomDomain ? "grab" : "default" }}
            >
              <XAxis
                dataKey="blockHeight"
                type="number"
                domain={timestampZoom.domain}
                allowDataOverflow
              />
              <YAxis
                tickFormatter={(value: number) =>
                  dateTimeFormatter.format(new Date(value))
                }
                width={120}
                domain={timestampDomain}
              />
              <Tooltip
                content={
                  <Chart.Tooltip
                    formatter={(value: number, name: string) => [
                      dateTimeFormatter.format(new Date(value)),
                      name,
                    ]}
                    labelFormatter={(label: number) =>
                      `Block ${numberFormatter.format(label)}`
                    }
                  />
                }
              />
              <Legend content={<Chart.Legend />} />
              {timestampZoom.referenceArea ? (
                <ReferenceArea
                  x1={timestampZoom.referenceArea[0]}
                  x2={timestampZoom.referenceArea[1]}
                  y1="auto"
                  y2="auto"
                  strokeOpacity={0}
                  fill="rgba(102, 126, 234, 0.2)"
                />
              ) : null}
              {tenureChangeHeights.map((height) => (
                <ReferenceLine
                  key={`tenure-time-${height}`}
                  x={height}
                  stroke={timestampChart.color("gray.400")}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
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
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
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
                tickFormatter={(value: number) =>
                  `${secondsFormatter.format(value)}s`
                }
              />
              <YAxis
                tickFormatter={(value: number) =>
                  `${percentFormatter.format(value)}%`
                }
                width={60}
                domain={[0, 100]}
              />
              <Tooltip
                content={
                  <Chart.Tooltip
                    formatter={(value: number, name: string) => [
                      `${percentFormatter.format(value)}%`,
                      name,
                    ]}
                    labelFormatter={(label: number) =>
                      `${secondsFormatter.format(label)} seconds`
                    }
                  />
                }
              />
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
