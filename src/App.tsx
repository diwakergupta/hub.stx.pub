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
import { UtilitiesPage } from "./pages/utilities";

const NAV_ITEMS = [
  { href: "/", label: "Miners" },
  { href: "/blocks", label: "Blocks" },
  { href: "/utilities", label: "Utilities" },
] as const;

function Header({ currentPath }: { currentPath: string }) {
  return (
    <Box as="header" borderBottomWidth="1px" bg="white">
      <Container
        maxW={{ base: "100%", md: "8xl" }}
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
          </Flex>
        </Flex>
      </Container>
    </Box>
  );
}

function Footer() {
  return (
    <Box as="footer" borderTopWidth="1px" bg="white">
      <Container maxW={{ base: "100%", md: "6xl" }} p={4}>
        80% vibe-coded, 20% hand-crafed, 100% with ❤️ by{" "}
        <Link href="https://diwaker.io">Diwaker</Link>.
      </Container>
    </Box>
  );
}

export function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isBlocksPage = path === "/blocks" || path.startsWith("/blocks/");
  const isUtilitiesPage = path === "/utilities" || path.startsWith("/utilities/");

  return (
    <Provider>
      <Flex
        direction="column"
        minH="100vh"
        fontFamily="mono"
        bg="bg.muted"
        color="fg.muted"
      >
        <Header currentPath={path} />
        <Box as="main" flex="1">
          {isUtilitiesPage ? (
            <UtilitiesPage />
          ) : isBlocksPage ? (
            <BlocksPage />
          ) : (
            <MinersPage />
          )}
        </Box>
        <Footer />
      </Flex>
    </Provider>
  );
}

export default App;
