import { useState } from "react";
// @ts-ignore - c32check might not have perfect types exported
import { c32ToB58, b58ToC32 } from "c32check";
import {
  Container,
  Heading,
  Stack,
  Input,
  Text,
  Box,
  Flex,
} from "@chakra-ui/react";
import { FaExchangeAlt } from "react-icons/fa";

export function UtilitiesPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [conversionType, setConversionType] = useState<"stx-to-btc" | "btc-to-stx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = (value: string) => {
    setInput(value);
    setResult(null);
    setConversionType(null);
    setError(null);

    const trimmed = value.trim();
    if (!trimmed) return;

    // Try Stacks -> Bitcoin
    try {
      const btc = c32ToB58(trimmed);
      setResult(btc);
      setConversionType("stx-to-btc");
      return;
    } catch (e) {
      // Ignore
    }

    // Try Bitcoin -> Stacks
    try {
      const stx = b58ToC32(trimmed);
      setResult(stx);
      setConversionType("btc-to-stx");
      return;
    } catch (e) {
      // Ignore
    }

    setError("Invalid address format. Please enter a valid Stacks (SP...) or Bitcoin (1..., 3..., bc1...) address.");
  };

  return (
    <Container maxW={{ base: "100%", md: "8xl" }} py={{ base: 4, md: 6 }} px={{ base: 4, md: 6 }}>
        <Stack gap={6}>
            <Heading size="2xl">Utilities</Heading>
            
            <Box 
              borderWidth="1px" 
              borderRadius="lg" 
              bg="white" 
              p={6} 
              shadow="sm"
              maxW="xl"
            >
                <Stack gap={4}>
                    <Flex align="center" gap={3}>
                        <Box bg="teal.50" p={2} borderRadius="md" color="teal.600">
                             <FaExchangeAlt />
                        </Box>
                        <Heading size="md">Address Converter</Heading>
                    </Flex>
                    
                    <Text fontSize="sm" color="gray.500">
                        Instantly convert between Stacks (c32) and Bitcoin (base58/segwit) address formats. 
                        The converter automatically detects the input format.
                    </Text>
                    
                    <Input 
                        size="lg"
                        placeholder="Enter Stacks or Bitcoin address..." 
                        value={input}
                        onChange={(e) => handleConvert(e.target.value)}
                        autoFocus
                    />

                    {result && (
                        <Box 
                          p={4} 
                          bg="green.50" 
                          borderColor="green.200"
                          borderWidth="1px"
                          borderRadius="md"
                        >
                            <Stack gap={1}>
                                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" color="green.700">
                                    {conversionType === "stx-to-btc" ? "Bitcoin Address" : "Stacks Address"}
                                </Text>
                                <Flex align="center" gap={2}>
                                    <Text fontWeight="mono" fontSize="lg" color="green.900" wordBreak="break-all">
                                        {result}
                                    </Text>
                                </Flex>
                            </Stack>
                        </Box>
                    )}
                    
                    {error && input && (
                         <Box 
                           p={4} 
                           bg="red.50" 
                           borderColor="red.200"
                           borderWidth="1px"
                           borderRadius="md"
                        >
                            <Text color="red.700" fontSize="sm">{error}</Text>
                        </Box>
                    )}
                </Stack>
            </Box>
        </Stack>
    </Container>
  );
}

export default UtilitiesPage;
