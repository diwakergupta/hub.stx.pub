export interface MinerPowerRow {
  stacksRecipient: string;
  bitcoinAddress: string | null;
  blocksWon: number;
  btcSpent: number;
  stxEarnt: number;
  winRate: number;
}

export interface MinerPowerSnapshot {
  formatVersion: number;
  items: MinerPowerRow[];
  windowSize: number;
  bitcoinBlocksObserved: number;
  noSortitionBlocks: number;
  noSortitionRate: number;
  generatedAt: string;
  bitcoinBlockHeight: number;
  sortitionId: string | null;
}
