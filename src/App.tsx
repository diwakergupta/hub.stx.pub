import "./index.css";

import {
  Box,
  Container,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from "@chakra-ui/react";

import { Provider } from "@/components/ui/provider";
import { BlocksPage } from "./pages/blocks";
import { MinersPage } from "./pages/miners";

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
            <Link href="https://stacks.org" target="_blank" color="teal.500">
              Stacks.org
            </Link>
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

export function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isBlocksPage = path === "/blocks" || path.startsWith("/blocks/");

  return (
    <Provider>
      <Flex direction="column" minH="100vh" bg="gray.50">
        <Header currentPath={path} />
        <Box as="main" flex="1">
          {isBlocksPage ? <BlocksPage /> : <MinersPage />}
        </Box>
        <Footer />
      </Flex>
    </Provider>
  );
}

export default App;
