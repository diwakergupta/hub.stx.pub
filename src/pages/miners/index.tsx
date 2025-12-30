import { useEffect, useMemo, useRef, useState } from "react";
import { instance } from "@viz-js/viz";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Link,
  List,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaRedo,
  FaSearch,
} from "react-icons/fa";
import createPanZoom, { type PanZoom } from "panzoom";

import type { MinerPowerSnapshot } from "@/shared/miner-power";

interface MinerVizResponse {
  bitcoinBlockHeight: number;
  generatedAt: string;
  dotSource: string;
  sortitionId: string | null;
  description: string;
}

type VizState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: MinerVizResponse; svg: string };

type MinerPowerState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: MinerPowerSnapshot };

// Initialize Viz instance promise once
const vizPromise = instance();

function useMinerViz(height?: number): VizState {
  const [state, setState] = useState<VizState>({ status: "idle" });

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const url = height
          ? `/api/miners/viz?height=${height}`
          : "/api/miners/viz";
        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as MinerVizResponse;
        const viz = await vizPromise;
        const element = viz.renderSVGElement(payload.dotSource);
        const svg = element.outerHTML;

        if (!disposed) {
          setState({ status: "ready", payload, svg });
        }
      } catch (error) {
        if (disposed) return;
        const message =
          error instanceof Error ? error.message : "Unknown error loading data";
        setState({ status: "error", message });
      }
    }

    void load();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [height]);

  return state;
}

function useMinerPower(height?: number): MinerPowerState {
  const [state, setState] = useState<MinerPowerState>({ status: "idle" });

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const url = height
          ? `/api/miners/power?height=${height}`
          : "/api/miners/power";
        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as MinerPowerSnapshot;

        if (!disposed) {
          setState({ status: "ready", payload });
        }
      } catch (error) {
        if (disposed) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unknown error loading miner power data";
        setState({ status: "error", message });
      }
    }

    void load();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [height]);

  return state;
}

function DiagramView({ state }: { state: VizState }) {
  const ENABLE_PAN_ZOOM = false; // flip to true when you want it back
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panzoomRef = useRef<PanZoom | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (state.status !== "ready") {
      container.innerHTML = "";
      panzoomRef.current?.dispose();
      panzoomRef.current = null;
      container.style.overflow = "";
      return;
    }

    container.innerHTML = state.svg;
    const svg = container.querySelector("svg");
    if (!svg) {
      return;
    }

    const svgElement = svg as SVGSVGElement;
    svgElement.style.display = "block";
    svgElement.style.maxWidth = "100%";
    svgElement.style.height = "auto";
    svgElement.setAttribute("role", svgElement.getAttribute("role") ?? "img");

    if (!ENABLE_PAN_ZOOM) {
      container.style.overflow = "auto";
      return () => {
        container.innerHTML = "";
        container.style.overflow = "";
      };
    }

    container.style.overflow = "hidden";
    panzoomRef.current?.dispose();
    panzoomRef.current = createPanZoom(svgElement, {
      maxZoom: 10,
      minZoom: 1,
      zoomSpeed: 1,
      initialZoom: 1,
    });

    return () => {
      panzoomRef.current?.dispose();
      panzoomRef.current = null;
      container.innerHTML = "";
      container.style.overflow = "";
    };
  }, [state]);

  if (state.status === "loading" || state.status === "idle") {
    return (
      <Flex
        align="center"
        justify="center"
        minH="280px"
        borderWidth="1px"
        borderRadius="lg"
        borderColor="gray.200"
      >
        <Stack align="center">
          <Spinner size="lg" />
          <Text fontSize="sm" color="gray.500">
            Rendering diagram…
          </Text>
        </Stack>
      </Flex>
    );
  }

  if (state.status === "error") {
    return (
      <Flex
        direction="column"
        gap={4}
        borderWidth="1px"
        borderRadius="lg"
        borderColor="gray.200"
        p={6}
      >
        <Heading as="h3" size="md">
          Something went wrong
        </Heading>
        <Text color="red.400">{state.message}</Text>
        <Text color="gray.500" fontSize="sm">
          Retry the page or check the server logs for details.
        </Text>
      </Flex>
    );
  }

  return (
    <Stack
      borderWidth="1px"
      borderRadius="lg"
      borderColor="gray.200"
      width="100%"
      p={{ base: 4, md: 6, lg: 8 }}
      gap={{ base: 4, md: 6 }}
    >
      <Stack>
        <Heading as="h2" size="lg">
          Visualizing Block Commits
        </Heading>
        <Text fontSize="sm" color="gray.500">
          Bitcoin block height{" "}
          {state.payload.bitcoinBlockHeight.toLocaleString()} · Updated{" "}
          {new Date(state.payload.generatedAt).toLocaleString()}
        </Text>
        <Text>
          This is a visualization of the Stacks chain, from the perspective of
          the block commits broadcast by Stacks miners on Bitcoin.
        </Text>
        <List.Root fontSize="sm">
          <List.Item>
            Each "row" or "cluster" represents commits at a given Bitcoin block.
            The label links to the corresponding block on mempool.space
          </List.Item>
          <List.Item>
            Each block commit node links to the corresponding Bitcoin
            transaction.
          </List.Item>
          <List.Item>
            Winning commits are solid, the rest are dashed. For winning commits,
            the node links to the corresponding Stacks block instead.
          </List.Item>
          <List.Item>
            Red edges indicate blocks building on top of non-canonical tips
            (indicating forks)
          </List.Item>
          <List.Item>
            Block commits from the same miner have the same fill color. The
            algorithm is rudimentary: I cast the first 8 bytes of the address to
            an int, and then modulo that into a fixed set of colors.
          </List.Item>
        </List.Root>
      </Stack>

      <Box
        borderWidth="1px"
        borderRadius="md"
        overflow={ENABLE_PAN_ZOOM ? "hidden" : "auto"}
        borderColor="gray.100"
        ref={containerRef}
        minH={{ base: "65vh", md: "78vh", lg: "82vh" }}
        maxH={ENABLE_PAN_ZOOM ? "95vh" : undefined}
        width="100%"
      />
      {ENABLE_PAN_ZOOM ? (
        <Text fontSize="xs" color="gray.500">
          Scroll to zoom, drag to pan. Double-click anywhere to reset the view.
        </Text>
      ) : null}
    </Stack>
  );
}

function MinerPowerView({ state }: { state: MinerPowerState }) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <Flex
        align="center"
        justify="center"
        minH="200px"
        borderWidth="1px"
        borderRadius="lg"
        borderColor="gray.200"
        bg="bg.muted"
      >
        <Stack align="center">
          <Spinner size="lg" />
          <Text fontSize="sm" color="gray.500">
            Loading miner power distribution…
          </Text>
        </Stack>
      </Flex>
    );
  }

  if (state.status === "error") {
    return (
      <Stack
        borderWidth="1px"
        borderRadius="lg"
        borderColor="gray.200"
        bg="white"
        p={6}
      >
        <Heading as="h3" size="md">
          Unable to load miner power
        </Heading>
        <Text color="red.400">{state.message}</Text>
        <Text fontSize="sm" color="gray.500">
          Check the Bun server logs or verify database connectivity.
        </Text>
      </Stack>
    );
  }

  // This check is redundant, but it helps TypeScript narrow down the type of `state`
  if (state.status !== "ready") return null;

  const numberFmt = new Intl.NumberFormat("en-US");
  const percentFmt = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const stxFmt = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const { payload } = state;

  return (
    <Stack borderWidth="1px" borderRadius="lg" borderColor="gray.200" p={4}>
      <Stack
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align={{ base: "flex-start", md: "center" }}
      >
        <Stack>
          <Heading as="h3" size="md">
            Miner Power · Last {payload.windowSize} Blocks
          </Heading>
          <Text fontSize="sm" color="gray.500">
            Last Updated {new Date(payload.generatedAt).toLocaleString()}
          </Text>
        </Stack>
        <Stack
          fontSize="sm"
          color="gray.500"
          align={{ base: "flex-start", md: "flex-end" }}
        >
          <Text>
            Bitcoin block {payload.bitcoinBlockHeight.toLocaleString()}
          </Text>
          {payload.sortitionId && <Text>Sortition {payload.sortitionId}</Text>}
        </Stack>
      </Stack>

      <Table.ScrollArea
        borderWidth="1px"
        borderRadius="md"
        borderColor="gray.100"
      >
        <Table.Root size="md" striped colorPalette="teal">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Miner</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                Blocks Won
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                BTC Spent (sats)
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                STX Earned
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Win Rate</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {payload.items.map((miner) => {
              const explorerUrl = `https://explorer.stacks.co/address/${miner.stacksRecipient}`;
              const btcUrl = miner.bitcoinAddress
                ? `https://mempool.space/address/${miner.bitcoinAddress}`
                : null;
              return (
                <Table.Row key={miner.stacksRecipient}>
                  <Table.Cell>
                    <Stack gap={1}>
                      <Link
                        href={explorerUrl}
                        target="_blank"
                        fontWeight="medium"
                      >
                        {miner.stacksRecipient}
                      </Link>
                      {btcUrl && (
                        <Link href={btcUrl} target="_blank" fontSize="xs">
                          {miner.bitcoinAddress}
                        </Link>
                      )}
                    </Stack>
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {numberFmt.format(miner.blocksWon)}
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {numberFmt.format(miner.btcSpent)}
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {stxFmt.format(miner.stxEarnt)}
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {percentFmt.format(miner.winRate / 100)}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Stack>
  );
}

function SnapshotControls({
  currentHeight,
  onHeightChange,
}: {
  currentHeight?: number;
  onHeightChange: (h: number | undefined) => void;
}) {
  const [inputVal, setInputVal] = useState("");

  useEffect(() => {
    if (currentHeight) {
      setInputVal(currentHeight.toString());
    }
  }, [currentHeight]);

  const handleSubmit = () => {
    const h = parseInt(inputVal, 10);
    if (!isNaN(h) && h > 0) {
      onHeightChange(h);
    }
  };

  return (
    <Flex
      gap={4}
      align="center"
      bg="gray.50"
      p={3}
      borderRadius="md"
      borderWidth="1px"
      borderColor="gray.200"
      wrap="wrap"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={!currentHeight}
        onClick={() => currentHeight && onHeightChange(currentHeight - 1)}
      >
        <FaChevronLeft /> Prev
      </Button>

      <Flex gap={2} align="center">
        <Text fontSize="sm" fontWeight="medium">
          Block Height:
        </Text>
        <Input
          size="sm"
          width="120px"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Height"
          bg="white"
        />
        <Button size="sm" onClick={handleSubmit}>
          Go
        </Button>
      </Flex>

      <Button
        variant="outline"
        size="sm"
        disabled={!currentHeight}
        onClick={() => currentHeight && onHeightChange(currentHeight + 1)}
      >
        Next <FaChevronRight />
      </Button>

      <Box flex="1" />

      <Button
        variant="ghost"
        size="sm"
        colorPalette="blue"
        onClick={() => {
          onHeightChange(undefined);
          setInputVal("");
        }}
      >
        <FaRedo /> Latest
      </Button>
    </Flex>
  );
}

export function MinersPage() {
  const [requestedHeight, setRequestedHeight] = useState<number | undefined>(
    undefined,
  );
  const vizState = useMinerViz(requestedHeight);
  const minerPowerState = useMinerPower(requestedHeight);

  // Derive current height from loaded data if available, otherwise fallback to requested
  const currentHeight =
    vizState.status === "ready"
      ? vizState.payload.bitcoinBlockHeight
      : requestedHeight;

  return (
    <Container
      maxW={{ base: "100%", md: "8xl" }}
      py={{ base: 4, md: 6 }}
      px={{ base: 4, md: 6 }}
    >
      <Stack gap={4}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
          <Heading size="2xl">Stacks Miners</Heading>
        </Flex>

        <SnapshotControls
          currentHeight={currentHeight}
          onHeightChange={setRequestedHeight}
        />

        <MinerPowerView state={minerPowerState} />
        <DiagramView state={vizState} />
      </Stack>
    </Container>
  );
}

export default MinersPage;
