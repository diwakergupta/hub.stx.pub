import "./index.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { D2 } from "@terrastruct/d2";
import {
  Box,
  Container,
  Flex,
  Heading,
  Link,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import createPanZoom, { type PanZoom } from "panzoom";
import { Provider } from "@/components/ui/provider";
import { ColorModeButton } from "@/components/ui/color-mode";
import type { MinerPowerSnapshot } from "@/shared/miner-power";
import { BlocksPage } from "./pages/BlocksPage";

interface MinerVizResponse {
  bitcoinBlockHeight: number;
  generatedAt: string;
  d2Source: string;
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

const d2 = new D2();

function useMinerViz(): VizState {
  const [state, setState] = useState<VizState>({ status: "idle" });

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const response = await fetch("/api/miners/viz", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as MinerVizResponse;
        const compiled = await d2.compile(payload.d2Source, {
          layout: "dagre",
          pad: 0,
        });
        const svg = await d2.render(compiled.diagram, compiled.renderOptions);

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
  }, []);

  return state;
}

function useMinerPower(): MinerPowerState {
  const [state, setState] = useState<MinerPowerState>({ status: "idle" });

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const response = await fetch("/api/miners/power", {
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
  }, []);

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
    svgElement.style.width = "1440px";
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
      initialZoom: 2,
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
        bg="white"
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
        bg="white"
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
      bg="white"
      width="100%"
      p={{ base: 4, md: 6, lg: 8 }}
      gap={{ base: 4, md: 6 }}
    >
      <Stack>
        <Heading as="h3" size="md">
          Latest Diagram
        </Heading>
        <Text fontSize="sm" color="gray.500">
          Bitcoin block height{" "}
          {state.payload.bitcoinBlockHeight.toLocaleString()} · Updated{" "}
          {new Date(state.payload.generatedAt).toLocaleString()}
        </Text>
        {state.payload.sortitionId && (
          <Text fontSize="sm" color="gray.500">
            Sortition ID {state.payload.sortitionId}
          </Text>
        )}
        <Text fontSize="sm" color="gray.500">
          {state.payload.description}
        </Text>
      </Stack>

      <Box
        borderWidth="1px"
        borderRadius="md"
        overflow={ENABLE_PAN_ZOOM ? "hidden" : "auto"}
        borderColor="gray.100"
        bg="white"
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
        bg="white"
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
    <Stack
      borderWidth="1px"
      borderRadius="lg"
      borderColor="gray.200"
      bg="white"
      p={6}
    >
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
            Updated {new Date(payload.generatedAt).toLocaleString()}
          </Text>
        </Stack>
        <Stack
          spacing={0}
          fontSize="xs"
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
        overflow="hidden"
        borderColor="gray.100"
      >
        <Table.Root size="sm" variant="striped">
          <Table.Header bg="gray.50">
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
                        color="teal.500"
                        fontWeight="medium"
                      >
                        {miner.stacksRecipient}
                      </Link>
                      {btcUrl && (
                        <Link
                          href={btcUrl}
                          target="_blank"
                          fontSize="xs"
                          color="gray.500"
                        >
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

const NAV_ITEMS = [
  { href: "/", label: "Miners" },
  { href: "/blocks", label: "Blocks" },
] as const;

function Header({ currentPath }: { currentPath: string }) {
  return (
    <Box as="header" borderBottomWidth="1px" bg="white">
      <Container
        maxW={{ base: "100%", md: "6xl" }}
        py={4}
        px={{ base: 4, md: 6 }}
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "flex-start", md: "center" }}
          gap={4}
        >
          <Stack gap={1}>
            <Heading size="lg">Stacks Hub</Heading>
            <Text fontSize="sm" color="gray.500">
              Rebuilt on Bun · Early preview
            </Text>
          </Stack>
          <Flex
            direction={{ base: "column", md: "row" }}
            align={{ base: "flex-start", md: "center" }}
            gap={{ base: 3, md: 6 }}
          >
            <Stack
              direction="row"
              gap={4}
              flexWrap="wrap"
              align={{ base: "flex-start", md: "center" }}
            >
              {NAV_ITEMS.map((item) => {
                const isActive =
                  currentPath === item.href ||
                  (item.href !== "/" && currentPath.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    fontWeight={isActive ? "semibold" : "medium"}
                    color={isActive ? "teal.500" : "gray.600"}
                    _hover={{ color: "teal.600" }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </Stack>
            <Flex align="center" gap={4}>
              <Link href="https://stacks.org" target="_blank" color="teal.500">
                Stacks.org
              </Link>
              <ColorModeButton />
            </Flex>
          </Flex>
        </Flex>
      </Container>
    </Box>
  );
}

function Footer() {
  return (
    <Box as="footer" borderTopWidth="1px" bg="white">
      <Container
        maxW={{ base: "100%", md: "6xl" }}
        py={6}
        px={{ base: 4, md: 6 }}
      >
        <Stack
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          gap={4}
        >
          <Text color="gray.500" fontSize="sm">
            © {new Date().getFullYear()} Stx.pub · MVP build in progress
          </Text>
          <Stack direction="row" gap={4}>
            <Link
              href="https://github.com/stxpub"
              target="_blank"
              color="teal.500"
            >
              GitHub
            </Link>
            <Link href="https://d2lang.com" target="_blank" color="teal.500">
              D2 Docs
            </Link>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

function HomePage() {
  const vizState = useMinerViz();
  const minerPowerState = useMinerPower();

  const heroCopy = useMemo(
    () => ({
      title: "Stacks Miner Graph (MVP)",
      subtitle:
        "A Bun-powered preview of the block commit visualization rebuilt with React and Chakra UI.",
    }),
    [],
  );

  return (
    <Container
      maxW={{ base: "100%", md: "6xl" }}
      py={{ base: 8, md: 12 }}
      px={{ base: 4, md: 6 }}
    >
      <Stack gap={10}>
        <Stack gap={4}>
          <Heading size="2xl">{heroCopy.title}</Heading>
          <Text fontSize="lg" color="gray.500">
            {heroCopy.subtitle}
          </Text>
        </Stack>

        <MinerPowerView state={minerPowerState} />
        <DiagramView state={vizState} />
      </Stack>
    </Container>
  );
}

export function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isBlocksPage = path === "/blocks" || path.startsWith("/blocks/");

  return (
    <Provider>
      <Flex direction="column" minH="100vh" bg="gray.50">
        <Header currentPath={path} />
        <Box as="main" flex="1">
          {isBlocksPage ? <BlocksPage /> : <HomePage />}
        </Box>
        <Footer />
      </Flex>
    </Provider>
  );
}

export default App;
