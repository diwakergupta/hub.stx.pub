export interface CostVector {
  readLength: number;
  readCount: number;
  writeLength: number;
  writeCount: number;
  runtime: number;
}

export interface BlockSample {
  blockSize: number;
  cost: CostVector;
  tenureCost: CostVector;
  tenureChanged: boolean;
  tenureTxFees: number;
  blockHeight: number;
  burnHeaderHeight: number;
  timestamp: number;
}

export interface BlocksResponse {
  blocks: BlockSample[];
}
