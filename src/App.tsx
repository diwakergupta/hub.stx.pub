import "./index.css";
import { Provider } from "@/components/ui/provider";
import { ColorModeButton } from "@/components/ui/color-mode";
import { Box, HStack, Heading, Link, Text, Flex } from "@chakra-ui/react";

export function App() {
  return (
    <Provider>
      <Flex direction="column">
        {/* Header */}
        <Box as="header" w="full" py={4} px={8} borderBottomWidth="1px">
          <HStack as="nav" justify="space-between">
            <Heading>MyApp</Heading>
            <HStack px={8}>
              <Link href="#">About</Link>
              <ColorModeButton />
            </HStack>
          </HStack>
        </Box>

        {/* Main Content */}
        <Box as="main" w="full" maxW="6xl" p={8}>
          <Heading as="h1" size="4xl" mb={4}>
            Welcome to Your Page
          </Heading>
          <Text fontSize="lg">
            This is the main content area. You can start building your
            application here.
          </Text>
        </Box>

        {/* Footer */}
        <Box as="footer" w="full" py={4} px={8} borderTopWidth="1px">
          <Text textAlign="center">
            © {new Date().getFullYear()} MyApp. All rights reserved.
          </Text>
        </Box>
      </Flex>
    </Provider>
  );
}

export default App;
