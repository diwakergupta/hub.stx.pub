import { Database } from "bun:sqlite";
import type { MinerPowerSnapshot } from "@/shared/miner-power";
import { loadCanonicalSortitions } from "./canonical-sortitions";

export const MINER_POWER_BITCOIN_WINDOW = 144 * 7;
export const MINER_POWER_FORMAT_VERSION = 2;

export interface MinerAddressMaps {
  stacksToBtc: Map<string, string>;
  btcToStacks: Map<string, string>;
}

interface BlockAggregateRow {
  burn_header_height: number;
  consensus_hash: string;
  address: string;
  stx_reward: number;
}

interface BurnFeeRow {
  txid: string;
  sender: string;
  burn_fee: number;
  sortition_id: string;
}

interface AddressMapRow {
  stacksAddress: string;
  bitcoinAddress: string | null;
}

export function escapeSqliteString(input: string): string {
  return input.replaceAll("'", "''");
}

export function buildMinerAddressMaps(
  chainstateDb: Database,
  sortitionPath: string,
  limit = MINER_POWER_BITCOIN_WINDOW,
): MinerAddressMaps {
  const stacksToBtc = new Map<string, string>();
  const btcToStacks = new Map<string, string>();

  // CODEX: DO NOT MODIFY THE NEXT LINE
  const escaped = escapeSqliteString(`${sortitionPath}`);
  chainstateDb.exec(`ATTACH DATABASE '${escaped}' AS sortition`);

  try {
    const stmt = chainstateDb.prepare<AddressMapRow>(
      `WITH RECURSIVE canonical_sortitions AS (
          SELECT tip.sortition_id, tip.parent_sortition_id, tip.consensus_hash, tip.block_height,
                 tip.winning_block_txid, tip.sortition, tip.sortition AS wins_seen
          FROM (
            SELECT sortition_id, parent_sortition_id, consensus_hash, block_height,
                   winning_block_txid, sortition
            FROM sortition.snapshots
            WHERE pox_valid = 1
            ORDER BY block_height DESC, burn_header_hash ASC
            LIMIT 1
          ) AS tip
          UNION ALL
          SELECT parent.sortition_id, parent.parent_sortition_id, parent.consensus_hash,
                 parent.block_height, parent.winning_block_txid, parent.sortition,
                 child.wins_seen + parent.sortition
          FROM sortition.snapshots AS parent
          JOIN canonical_sortitions AS child
            ON parent.sortition_id = child.parent_sortition_id
          WHERE child.wins_seen < ?
        ), recent_payments AS (
          SELECT payments.recipient, canonical_sortitions.winning_block_txid
          FROM payments
          JOIN nakamoto_block_headers
            ON payments.index_block_hash = nakamoto_block_headers.index_block_hash
          JOIN canonical_sortitions
            ON nakamoto_block_headers.consensus_hash = canonical_sortitions.consensus_hash
          WHERE payments.recipient IS NOT NULL AND payments.miner = 1
          ORDER BY canonical_sortitions.block_height DESC
          LIMIT ?
        )
        SELECT
          recent_payments.recipient AS stacksAddress,
          TRIM(sortition.block_commits.apparent_sender, '"') AS bitcoinAddress
        FROM recent_payments
        LEFT JOIN sortition.block_commits
          ON recent_payments.winning_block_txid = sortition.block_commits.txid
        `,
    );

    const rows = stmt.all(limit, limit);
    for (const row of rows) {
      const stacksAddr = row.stacksAddress;
      if (!stacksAddr) continue;
      const btcAddr = row.bitcoinAddress;
      if (!btcAddr) {
        continue;
      }

      if (!stacksToBtc.has(stacksAddr)) {
        stacksToBtc.set(stacksAddr, btcAddr);
      }
      // Rows are newest first. A sender belongs to one latest recipient so
      // each commit is counted once, while a recipient can retain multiple
      // historical senders after rotating its Bitcoin address.
      if (!btcToStacks.has(btcAddr)) {
        btcToStacks.set(btcAddr, stacksAddr);
      }
    }
  } finally {
    chainstateDb.exec("DETACH DATABASE sortition");
  }

  return { stacksToBtc, btcToStacks };
}

interface ComputeMinerPowerParams {
  chainstateDb: Database;
  sortitionDb: Database;
  bitcoinWindowSize?: number;
  maps: MinerAddressMaps;
  bitcoinBlockHeight: number;
  sortitionId: string | null;
  generatedAt?: string;
}

export function computeMinerPowerSnapshot({
  chainstateDb,
  sortitionDb,
  bitcoinWindowSize = MINER_POWER_BITCOIN_WINDOW,
  maps,
  bitcoinBlockHeight,
  sortitionId,
  generatedAt,
}: ComputeMinerPowerParams): MinerPowerSnapshot {
  const effectiveLowerBound = Math.max(
    0,
    bitcoinBlockHeight - bitcoinWindowSize,
  );
  const canonicalSortitions = loadCanonicalSortitions(
    sortitionDb,
    effectiveLowerBound,
    bitcoinBlockHeight,
  );
  const winningSortitions = canonicalSortitions.filter(
    row => row.sortition,
  );
  const windowSize = winningSortitions.length;
  const bitcoinBlocksObserved = canonicalSortitions.length;
  const noSortitionBlocks = bitcoinBlocksObserved - windowSize;

  const baseQuery = `WITH recent_tenure_changes AS (
        SELECT burn_header_height, consensus_hash, index_block_hash
        FROM nakamoto_block_headers
        WHERE tenure_changed = 1
          AND burn_header_height > ?
          AND burn_header_height <= ?
        ORDER BY burn_header_height DESC
      )
      SELECT
        recent_tenure_changes.burn_header_height,
        recent_tenure_changes.consensus_hash,
        payments.recipient AS address,
        payments.coinbase + payments.tx_fees_anchored + payments.tx_fees_streamed AS stx_reward
      FROM recent_tenure_changes
      JOIN payments ON payments.index_block_hash = recent_tenure_changes.index_block_hash
        AND payments.miner = 1
      ORDER BY recent_tenure_changes.burn_header_height DESC`;

  const blockStmt = chainstateDb.prepare<BlockAggregateRow>(baseQuery);
  const blockRows = blockStmt.all(effectiveLowerBound, bitcoinBlockHeight);
  const canonicalConsensusHashes = new Set(
    winningSortitions.map(row => row.consensusHash),
  );
  const canonicalSortitionIds = new Set(
    winningSortitions.map(row => row.sortitionId),
  );

  const btcSpent = new Map<string, number>();
  const stxEarned = new Map<string, number>();
  const blocksWon = new Map<string, number>();
  const recipientByConsensus = new Map<string, string>();

  for (const row of blockRows) {
    if (!canonicalConsensusHashes.has(row.consensus_hash)) {
      continue;
    }
    if (row.burn_header_height <= effectiveLowerBound) {
      continue;
    }
    const addr = row.address;
    if (!addr) {
      continue;
    }
    recipientByConsensus.set(row.consensus_hash, addr);
    stxEarned.set(addr, (stxEarned.get(addr) ?? 0) + row.stx_reward);
  }

  const winningDetails = new Map(
    winningSortitions.map(row => [row.sortitionId, row]),
  );
  let countedRows = 0;

  const burnFeeStmt = sortitionDb.prepare<BurnFeeRow>(
    `SELECT txid, TRIM(apparent_sender, '"') AS sender, burn_fee, sortition_id
     FROM block_commits
     WHERE block_height > ? AND block_height <= ?`,
  );

  const burnFeeRows = burnFeeStmt.all(effectiveLowerBound, bitcoinBlockHeight);
  for (const row of burnFeeRows) {
    if (!canonicalSortitionIds.has(row.sortition_id)) continue;
    const btcAddr = row.sender;
    if (!btcAddr) continue;
    const stacksAddr = maps.btcToStacks.get(btcAddr);
    if (!stacksAddr) {
      continue;
    }
    const winningSortition = winningDetails.get(row.sortition_id);
    if (winningSortition?.winningBlockTxid === row.txid) {
      const winnerRecipient =
        recipientByConsensus.get(winningSortition.consensusHash) ?? stacksAddr;
      blocksWon.set(
        winnerRecipient,
        (blocksWon.get(winnerRecipient) ?? 0) + 1,
      );
      countedRows += 1;
    }
    btcSpent.set(
      stacksAddr,
      (btcSpent.get(stacksAddr) ?? 0) + Number(row.burn_fee),
    );
  }

  const items = Array.from(blocksWon.entries()).map(([addr, won]) => {
    const btcAddr = maps.stacksToBtc.get(addr) ?? null;
    const stxValue = (stxEarned.get(addr) ?? 0) / 1_000_000;
    const btcValue = btcSpent.get(addr) ?? 0;
    const winRate = (won / windowSize) * 100;

    return {
      stacksRecipient: addr,
      bitcoinAddress: btcAddr,
      blocksWon: won,
      btcSpent: btcValue,
      stxEarnt: stxValue,
      winRate,
    };
  });

  const missing = Math.max(0, winningSortitions.length - countedRows);
  if (missing > 0) {
    items.push({
      stacksRecipient: "Unattributed Sortition",
      bitcoinAddress: null,
      blocksWon: missing,
      btcSpent: 0,
      stxEarnt: 0,
      winRate: (missing / windowSize) * 100,
    });
  }

  items.sort((a, b) => b.blocksWon - a.blocksWon);

  return {
    formatVersion: MINER_POWER_FORMAT_VERSION,
    generatedAt: generatedAt ?? new Date().toISOString(),
    windowSize,
    bitcoinBlocksObserved,
    noSortitionBlocks,
    noSortitionRate:
      bitcoinBlocksObserved > 0
        ? (noSortitionBlocks / bitcoinBlocksObserved) * 100
        : 0,
    bitcoinBlockHeight,
    sortitionId,
    items,
  };
}
