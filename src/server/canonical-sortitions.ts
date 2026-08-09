import { Database } from "bun:sqlite";

export interface CanonicalSortition {
  sortitionId: string;
  parentSortitionId: string;
  consensusHash: string;
  blockHeight: number;
  burnHeaderHash: string;
  winningBlockTxid: string;
  sortition: boolean;
  canonicalStacksTipHeight: number;
  canonicalStacksTipHash: string;
  canonicalStacksTipConsensusHash: string;
}

interface CanonicalSortitionRow {
  sortition_id: string;
  parent_sortition_id: string;
  consensus_hash: string;
  block_height: number;
  burn_header_hash: string;
  winning_block_txid: string;
  sortition: number;
  canonical_stacks_tip_height: number;
  canonical_stacks_tip_hash: string;
  canonical_stacks_tip_consensus_hash: string;
}

const SELECT_COLUMNS = `sortition_id, parent_sortition_id, consensus_hash,
  block_height, burn_header_hash, winning_block_txid, sortition,
  canonical_stacks_tip_height, canonical_stacks_tip_hash,
  canonical_stacks_tip_consensus_hash`;

function fromRow(row: CanonicalSortitionRow): CanonicalSortition {
  return {
    sortitionId: row.sortition_id,
    parentSortitionId: row.parent_sortition_id,
    consensusHash: row.consensus_hash,
    blockHeight: Number(row.block_height),
    burnHeaderHash: row.burn_header_hash,
    winningBlockTxid: row.winning_block_txid,
    sortition: row.sortition === 1,
    canonicalStacksTipHeight: Number(row.canonical_stacks_tip_height),
    canonicalStacksTipHash: row.canonical_stacks_tip_hash,
    canonicalStacksTipConsensusHash: row.canonical_stacks_tip_consensus_hash,
  };
}

export function loadCanonicalTip(
  db: Database,
  upperBound = Number.MAX_SAFE_INTEGER,
): CanonicalSortition | null {
  const row = db
    .prepare<CanonicalSortitionRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM snapshots
       WHERE pox_valid = 1 AND block_height <= ?
       ORDER BY block_height DESC, burn_header_hash ASC
       LIMIT 1`,
    )
    .get(upperBound);
  return row ? fromRow(row) : null;
}

export function loadCanonicalSortitions(
  db: Database,
  lowerBound: number,
  upperBound: number,
): CanonicalSortition[] {
  const rows = db
    .prepare<CanonicalSortitionRow>(
      `WITH RECURSIVE canonical_sortitions AS (
         SELECT ${SELECT_COLUMNS}
         FROM (
           SELECT ${SELECT_COLUMNS}
           FROM snapshots
           WHERE pox_valid = 1 AND block_height <= ?
           ORDER BY block_height DESC, burn_header_hash ASC
           LIMIT 1
         )
         UNION ALL
         SELECT ${SELECT_COLUMNS.split(",").map(column => `parent.${column.trim()}`).join(", ")}
         FROM snapshots AS parent
         JOIN canonical_sortitions AS child
           ON parent.sortition_id = child.parent_sortition_id
         WHERE parent.block_height > ?
       )
       SELECT ${SELECT_COLUMNS}
       FROM canonical_sortitions
       ORDER BY block_height DESC`,
    )
    .all(upperBound, lowerBound);
  return rows.map(fromRow);
}

export function latestWinningSortition(
  snapshots: CanonicalSortition[],
): CanonicalSortition | null {
  return snapshots.find(snapshot => snapshot.sortition) ?? null;
}
