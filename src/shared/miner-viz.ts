export interface MinerVizNode {
  txid: string;
  sender: string;
  burnBlockHeight: number;
  spendSats: number;
  sortitionId: string;
  memo: string;
  parentTxid: string | null;
  stacksHeight: number;
  blockHash: string | null;
  won: boolean;
  canonical: boolean;
  tip: boolean;
  coinbaseEarned: number;
  feesEarned: number;
}

export interface MinerVizEdge {
  sourceTxid: string;
  targetTxid: string;
  canonical: boolean;
  isFork: boolean;
}

export interface MinerVizBlock {
  height: number;
  sortitionSpendSats: number;
  commits: MinerVizNode[];
}

export interface MinerVizGraph {
  blocks: MinerVizBlock[];
  edges: MinerVizEdge[];
}

export interface MinerVizResponse {
  bitcoinBlockHeight: number;
  generatedAt: string;
  sortitionId: string | null;
  description: string;
  graph: MinerVizGraph;
}
