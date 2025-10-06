export interface MinerPowerRow {
  stacksRecipient: string;
  bitcoinAddress: string | null;
  blocksWon: number;
  btcSpent: number;
  stxEarnt: number;
  winRate: number;
}

export interface MinerPowerSnapshot {
  items: MinerPowerRow[];
  windowSize: number;
  generatedAt: string;
  isSample: boolean;
}
