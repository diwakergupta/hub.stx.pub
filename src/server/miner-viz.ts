export interface MinerVizSnapshot {
  bitcoinBlockHeight: number;
  generatedAt: string;
  d2Source: string;
  isSample: boolean;
  description: string;
}

const SAMPLE_D2 = `direction: right

block_808900: {
  label: "Bitcoin Block 808900"
  commit_alpha: "Miner Alpha (won)"
  commit_beta: "Miner Beta"
}

block_808901: {
  label: "Bitcoin Block 808901"
  commit_gamma: "Miner Gamma (won)"
}

block_808900.commit_alpha -> block_808901.commit_gamma: canonical
block_808900.commit_beta -> block_808901.commit_gamma: competing
`;

export function getLatestMinerViz(): MinerVizSnapshot {
  return {
    bitcoinBlockHeight: 808_901,
    generatedAt: new Date().toISOString(),
    d2Source: SAMPLE_D2,
    isSample: true,
    description:
      "Sample data illustrating two consecutive Bitcoin blocks and their associated Stacks miner commits.",
  };
}
