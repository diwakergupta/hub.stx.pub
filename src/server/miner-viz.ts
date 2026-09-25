import { Database, type Statement } from "bun:sqlite";
import type {
  MinerVizBlock,
  MinerVizEdge,
  MinerVizGraph,
  MinerVizNode,
} from "@/shared/miner-viz";
import {
  latestWinningSortition,
  loadCanonicalSortitions,
} from "./canonical-sortitions";

export interface MinerVizSnapshot {
  generatedAt: string;
  bitcoinBlockHeight: number;
  sortitionId: string | null;
  graph: MinerVizGraph;
}

export const MINER_VIZ_WINDOW = 20;

interface BlockCommitRow {
  burn_header_hash: string;
  txid: string;
  apparent_sender: string;
  sortition_id: string;
  vtxindex: number;
  block_height: number;
  burn_fee: number;
  parent_block_ptr: number;
  parent_vtxindex: number;
  memo: string | null;
}

interface SnapshotRow {
  winning_block_txid: string;
  canonical_stacks_tip_height: number;
  consensus_hash: string;
  sortition_id: string | null;
}

interface PaymentRow {
  block_hash: string | null;
  coinbase: number | null;
}

interface FeesRow {
  tenure_tx_fees: number | null;
}

export interface BlockCommit {
  burnHeaderHash: string;
  txid: string;
  vtxindex: number;
  sender: string;
  burnBlockHeight: number;
  spend: number;
  sortitionId: string;
  parentBlockPtr: number;
  parentVtxindex: number;
  memo: string;
  parent: string;
  stacksHeight: number;
  blockHash: string;
  won: boolean;
  canonical: boolean;
  tip: boolean;
  coinbaseEarned: number;
  feesEarned: number;
  potentialTip: boolean;
  nextTip: boolean;
  key: string;
  parentKey: string;
}

export interface BlockCommits {
  sortitionFeesMap: Map<string, number>;
  allCommits: Map<string, BlockCommit>;
  commitsByBlock: Map<number, BlockCommit[]>;
}

function makeHashKey(height: number, vtxindex: number): string {
  return `${height}:${vtxindex}`;
}

export function fetchCommitData(
  sortitionDb: Database,
  lowerBound: number,
  startBlock: number,
): BlockCommits {
  const sortitionFeesMap = new Map<string, number>();
  const allCommits = new Map<string, BlockCommit>();
  const commitsByBlock = new Map<number, BlockCommit[]>();
  const hashMap = new Map<string, string>();

  const stmt = sortitionDb.prepare<BlockCommitRow>(
    `SELECT
        burn_header_hash,
        txid,
        apparent_sender,
        sortition_id,
        vtxindex,
        block_height,
        burn_fee,
        parent_block_ptr,
        parent_vtxindex,
        memo
      FROM block_commits
      WHERE block_height BETWEEN ? AND ?
      ORDER BY block_height ASC`,
  );

  const rows = stmt.all(lowerBound, startBlock);
  for (const row of rows) {
    const commit: BlockCommit = {
      burnHeaderHash: row.burn_header_hash,
      txid: row.txid,
      vtxindex: row.vtxindex ?? 0,
      sender: (row.apparent_sender ?? "").replace(/['"]/g, ""),
      burnBlockHeight: row.block_height ?? 0,
      spend: Number(row.burn_fee) || 0,
      sortitionId: row.sortition_id ?? "",
      parentBlockPtr: row.parent_block_ptr ?? 0,
      parentVtxindex: row.parent_vtxindex ?? 0,
      memo: row.memo ?? "",
      parent: "",
      stacksHeight: 0,
      blockHash: "",
      won: false,
      canonical: false,
      tip: false,
      coinbaseEarned: 0,
      feesEarned: 0,
      potentialTip: false,
      nextTip: false,
      key: makeHashKey(row.block_height ?? 0, row.vtxindex ?? 0),
      parentKey: makeHashKey(
        row.parent_block_ptr ?? 0,
        row.parent_vtxindex ?? 0,
      ),
    };

    const parentTxid = hashMap.get(commit.parentKey);
    if (parentTxid) {
      commit.parent = parentTxid;
    }

    allCommits.set(commit.txid, commit);
    hashMap.set(commit.key, commit.txid);
  }

  // loop over all commits in allCommits
  for (const commit of allCommits.values()) {
    const bucket = commitsByBlock.get(commit.burnBlockHeight);
    if (bucket) {
      bucket.push(commit);
    } else {
      commitsByBlock.set(commit.burnBlockHeight, [commit]);
    }

    const totalSpend =
      (sortitionFeesMap.get(commit.sortitionId) ?? 0) + commit.spend;
    sortitionFeesMap.set(commit.sortitionId, totalSpend);
  }

  return {
    sortitionFeesMap,
    allCommits,
    commitsByBlock,
  };
}

function processWinningCommit(
  commit: BlockCommit,
  parentCommit: BlockCommit | undefined,
  stacksHeight: number,
  consensusHash: string,
  paymentStmt: Statement<PaymentRow>,
  feesStmt: Statement<FeesRow>,
) {
  commit.won = true;
  commit.potentialTip = true;
  commit.stacksHeight = stacksHeight;

  if (parentCommit) {
    parentCommit.potentialTip = false;
  }

  if (stacksHeight <= 0) {
    return;
  }

  const payment = paymentStmt.get(consensusHash);
  if (payment) {
    commit.blockHash = payment.block_hash ?? commit.blockHash;
    commit.coinbaseEarned = payment.coinbase ?? commit.coinbaseEarned;
  }

  const feesRow = feesStmt.get(consensusHash);
  if (feesRow?.tenure_tx_fees != null) {
    commit.feesEarned = feesRow.tenure_tx_fees;
  }
}

export function processWinningBlocks(
  sortitionDb: Database,
  chainstateDb: Database,
  lowerBound: number,
  startBlock: number,
  blockCommits: BlockCommits,
): SnapshotRow | undefined {
  const paymentStmt = chainstateDb.prepare<PaymentRow>(
    `SELECT block_hash, coinbase
     FROM payments
     WHERE consensus_hash = ? AND miner = 1
     LIMIT 1`,
  );
  const feesStmt = chainstateDb.prepare<FeesRow>(
    `SELECT tenure_tx_fees FROM nakamoto_block_headers
      WHERE consensus_hash = ?
      ORDER BY height_in_tenure DESC
      LIMIT 1`,
  );

  const canonicalSnapshots = loadCanonicalSortitions(
    sortitionDb,
    Math.max(0, lowerBound - 1),
    startBlock,
  );
  const snapshotsByHeight = new Map(
    canonicalSnapshots.map(snapshot => [snapshot.blockHeight, snapshot]),
  );

  let latestSnapshot: SnapshotRow | undefined;

  for (let height = lowerBound; height <= startBlock; height += 1) {
    const snapshot = snapshotsByHeight.get(height);
    if (!snapshot) {
      continue;
    }
    latestSnapshot = {
      winning_block_txid: snapshot.winningBlockTxid,
      canonical_stacks_tip_height: snapshot.canonicalStacksTipHeight,
      consensus_hash: snapshot.consensusHash,
      sortition_id: snapshot.sortitionId,
    };

    const commits = blockCommits.commitsByBlock.get(height);
    if (!commits || commits.length === 0) {
      continue;
    }

    for (const commit of commits) {
      commit.stacksHeight =
        snapshot.canonicalStacksTipHeight ?? commit.stacksHeight;
      const parentCommit = commit.parent
        ? blockCommits.allCommits.get(commit.parent)
        : undefined;
      if (commit.txid === snapshot.winningBlockTxid) {
        processWinningCommit(
          commit,
          parentCommit,
          snapshot.canonicalStacksTipHeight,
          snapshot.consensusHash,
          paymentStmt,
          feesStmt,
        );
      }
    }
  }

  return latestSnapshot;
}

export function processCanonicalTip(
  sortitionDb: Database,
  startBlock: number,
  commits: Map<string, BlockCommit>,
) {
  const commitHeights = Array.from(commits.values(), commit => commit.burnBlockHeight);
  const lowerBound =
    commitHeights.length > 0 ? Math.min(...commitHeights) - 1 : startBlock - 1;
  const canonicalSnapshots = loadCanonicalSortitions(
    sortitionDb,
    Math.max(0, lowerBound),
    startBlock,
  );
  const winningTip = latestWinningSortition(canonicalSnapshots);
  if (!winningTip) {
    return;
  }

  let tipTxid = winningTip.winningBlockTxid;
  let isHead = true;
  while (tipTxid) {
    const commit = commits.get(tipTxid);
    if (!commit) {
      break;
    }
    if (isHead) {
      commit.tip = true;
      isHead = false;
    }
    commit.canonical = true;
    tipTxid = commit.parent;
  }
}
export function generateGraph(
  lowerBound: number,
  startBlock: number,
  blockCommits: BlockCommits,
): MinerVizGraph {
  const blocks: MinerVizBlock[] = [];
  const edges: MinerVizEdge[] = [];

  for (let height = lowerBound; height <= startBlock; height += 1) {
    const commits = blockCommits.commitsByBlock.get(height);
    if (!commits || commits.length === 0) {
      continue;
    }

    let sortitionSpend = 0;
    const commitNodes: MinerVizNode[] = [];

    for (const commit of commits) {
      if (sortitionSpend === 0) {
        sortitionSpend =
          blockCommits.sortitionFeesMap.get(commit.sortitionId) ?? 0;
      }

      commitNodes.push({
        txid: commit.txid,
        sender: commit.sender,
        burnBlockHeight: commit.burnBlockHeight,
        spendSats: commit.spend,
        sortitionId: commit.sortitionId,
        memo: commit.memo,
        parentTxid: commit.parent || null,
        stacksHeight: commit.stacksHeight,
        blockHash: commit.blockHash || null,
        won: commit.won,
        canonical: commit.canonical,
        tip: commit.tip,
        coinbaseEarned: commit.coinbaseEarned,
        feesEarned: commit.feesEarned,
      });
    }

    blocks.push({
      height,
      sortitionSpendSats: sortitionSpend,
      commits: commitNodes,
    });
  }

  for (const commit of blockCommits.allCommits.values()) {
    if (commit.parent) {
      const parentCommit = blockCommits.allCommits.get(commit.parent);
      if (parentCommit) {
        const isCanonical = Boolean(commit.canonical);
        const isFork =
          !isCanonical &&
          (commit.burnBlockHeight > parentCommit.burnBlockHeight + 1 ||
            !parentCommit.canonical ||
            !parentCommit.won);
        edges.push({
          sourceTxid: parentCommit.txid,
          targetTxid: commit.txid,
          canonical: isCanonical,
          isFork,
        });
      }
    }
  }

  return { blocks, edges };
}

export function computeMinerVizSnapshot(params: {
  sortitionDb: Database;
  chainstateDb: Database;
  lowerBound: number;
  startBlock: number;
  generatedAt?: string;
}): MinerVizSnapshot {
  const { sortitionDb, chainstateDb, lowerBound, startBlock, generatedAt } =
    params;

  const blockCommits = fetchCommitData(sortitionDb, lowerBound, startBlock);
  const latestSnapshot = processWinningBlocks(
    sortitionDb,
    chainstateDb,
    lowerBound,
    startBlock,
    blockCommits,
  );
  processCanonicalTip(sortitionDb, startBlock, blockCommits.allCommits);

  const graph = generateGraph(lowerBound, startBlock, blockCommits);

  return {
    bitcoinBlockHeight: startBlock,
    generatedAt: generatedAt ?? new Date().toISOString(),
    sortitionId: latestSnapshot?.sortition_id ?? null,
    graph,
  };
}
