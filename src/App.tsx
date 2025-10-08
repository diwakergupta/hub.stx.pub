import "./index.css";

import { useEffect, useMemo, useState } from "react";
import { D2 } from "@terrastruct/d2";
import {
  Badge,
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

import { Provider } from "@/components/ui/provider";
import { ColorModeButton } from "@/components/ui/color-mode";
import type { MinerPowerSnapshot } from "@/shared/miner-power";

interface MinerVizResponse {
  bitcoinBlockHeight: number;
  generatedAt: string;
  d2Source: string;
  isSample: boolean;
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
        console.log(payload);
        const compiled = await d2.compile(payload.d2Source);
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
      p={6}
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
        {state.payload.isSample && (
          <Text fontSize="sm" color="orange.500">
            Sample data for MVP preview
          </Text>
        )}
        <Text fontSize="sm" color="gray.500">
          {state.payload.description}
        </Text>
      </Stack>

      <Box
        borderWidth="1px"
        borderRadius="md"
        overflow="auto"
        maxH="600px"
        borderColor="gray.100"
        bg="white"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
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
      <Stack direction={{ base: "column", md: "row" }} justify="space-between">
        <Stack>
          <Heading as="h3" size="md">
            Miner Power · Last {payload.windowSize} Blocks
          </Heading>
          <Text fontSize="sm" color="gray.500">
            Updated {new Date(payload.generatedAt).toLocaleString()}
          </Text>
        </Stack>
        {payload.isSample && (
          <Badge
            colorScheme="orange"
            alignSelf={{ base: "flex-start", md: "center" }}
          >
            Sample data
          </Badge>
        )}
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

export function App() {
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
    <Provider>
      <Flex direction="column" minH="100vh">
        <Box as="header" borderBottomWidth="1px">
          <Container
            maxW="5xl"
            py={4}
            display="flex"
            justifyContent="space-between"
          >
            <Stack gap={1}>
              <Heading size="lg">Stacks Hub</Heading>
              <Text fontSize="sm" color="gray.500">
                Rebuilt on Bun · Early preview
              </Text>
            </Stack>
            <Stack direction="row" align="center" gap={4}>
              <Link href="https://stacks.org" target="_blank" color="teal.500">
                Stacks.org
              </Link>
              <ColorModeButton />
            </Stack>
          </Container>
        </Box>

        <Container as="main" maxW="5xl" py={10} flex="1">
          <Stack gap={8}>
            <Stack gap={3}>
              <Heading size="2xl">{heroCopy.title}</Heading>
              <Text fontSize="lg" color="gray.500">
                {heroCopy.subtitle}
              </Text>
            </Stack>

            <MinerPowerView state={minerPowerState} />
            <DiagramView state={vizState} />
          </Stack>
        </Container>

        <Box as="footer" borderTopWidth="1px">
          <Container maxW="5xl" py={6}>
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
                <Link
                  href="https://d2lang.com"
                  target="_blank"
                  color="teal.500"
                >
                  D2 Docs
                </Link>
              </Stack>
            </Stack>
          </Container>
        </Box>
      </Flex>
    </Provider>
  );
}

export default App;
