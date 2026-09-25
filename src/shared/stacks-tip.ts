export interface StacksTipTelemetry {
  blockHeight: number;
  blockHash: string;
  consensusHash: string;
  timestamp: number; // Unix timestamp in seconds
  blockSize: number; // in bytes
  txCount: number;
  heightInTenure: number;
  burnBlockHeight: number;
  tenureHeight: number;
  receivedAt: number; // ms timestamp when observed
}
