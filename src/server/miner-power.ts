import { Database } from "bun:sqlite";

import type { MinerPowerSnapshot } from "@/shared/miner-power";
import { CHAINSTATE_DB_RELATIVE, SORTITION_DB_RELATIVE } from "./paths";

export const MINER_POWER_WINDOW = 144;

export interface MinerAddressMaps {
  stacksToBtc: Map<string, string>;
  btcToStacks: Map<string, Set<string>>;
}

interface BlockAggregateRow {
  burn_header_height: number;
  address: string;
  burnchain_commit_burn: number;
  stx_reward: number;
}

interface BurnFeeRow {
  sender: string;
  total_burn_fee: number;
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
  limit = MINER_POWER_WINDOW * 4,
): MinerAddressMaps {
  const stacksToBtc = new Map<string, string>();
  const btcToStacks = new Map<string, Set<string>>();

  // CODEX: DO NOT MODIFY THE NEXT LINE
  const escaped = escapeSqliteString(`${sortitionPath}`);
  chainstateDb.exec(`ATTACH DATABASE '${escaped}' AS sortition`);

  try {
    const stmt = chainstateDb.prepare<AddressMapRow>(
      `SELECT
          payments.recipient AS stacksAddress,
          TRIM(sortition.block_commits.apparent_sender, '"') AS bitcoinAddress
        FROM payments
        LEFT JOIN nakamoto_block_headers
          ON payments.index_block_hash = nakamoto_block_headers.index_block_hash
        LEFT JOIN sortition.snapshots
          ON nakamoto_block_headers.consensus_hash = sortition.snapshots.consensus_hash
        LEFT JOIN sortition.block_commits
          ON sortition.snapshots.winning_block_txid = sortition.block_commits.txid
        WHERE payments.recipient IS NOT NULL
        ORDER BY payments.stacks_block_height DESC
        LIMIT ?`,
    );

    const rows = stmt.all(limit);
    for (const row of rows) {
      const stacksAddr = row.stacksAddress;
      if (!stacksAddr) continue;
      const btcAddr = row.bitcoinAddress;
      if (!btcAddr || stacksToBtc.has(stacksAddr)) {
        continue;
      }

      stacksToBtc.set(stacksAddr, btcAddr);
      if (!btcToStacks.has(btcAddr)) {
        btcToStacks.set(btcAddr, new Set());
      }
      btcToStacks.get(btcAddr)!.add(stacksAddr);
    }
  } finally {
    chainstateDb.exec("DETACH DATABASE sortition");
  }

  return { stacksToBtc, btcToStacks };
}

interface ComputeMinerPowerParams {
  chainstateDb: Database;
  sortitionDb: Database;
  lowerBound: number;
  windowSize?: number;
  maps: MinerAddressMaps;
  bitcoinBlockHeight: number;
  sortitionId: string | null;
  generatedAt?: string;
}

export function computeMinerPowerSnapshot({
  chainstateDb,
  sortitionDb,
  lowerBound,
  windowSize = MINER_POWER_WINDOW,
  maps,
  bitcoinBlockHeight,
  sortitionId,
  generatedAt,
}: ComputeMinerPowerParams): MinerPowerSnapshot {
  const baseQuery = `WITH RECURSIVE block_ancestors(
        burn_header_height,
        parent_block_id,
        address,
        burnchain_commit_burn,
        stx_reward
      ) AS (
        SELECT
          nakamoto_block_headers.burn_header_height,
          nakamoto_block_headers.parent_block_id,
          payments.recipient,
          payments.burnchain_commit_burn,
          payments.coinbase + payments.tx_fees_anchored + payments.tx_fees_streamed AS stx_reward
        FROM nakamoto_block_headers
        JOIN payments ON nakamoto_block_headers.index_block_hash = payments.index_block_hash
        WHERE nakamoto_block_headers.tenure_changed = 1
        UNION ALL
        SELECT
          nb.burn_header_height,
          nb.parent_block_id,
          payments.recipient,
          payments.burnchain_commit_burn,
          payments.coinbase + payments.tx_fees_anchored + payments.tx_fees_streamed AS stx_reward
        FROM nakamoto_block_headers AS nb
        JOIN payments ON nb.index_block_hash = payments.index_block_hash
        JOIN block_ancestors ON nb.index_block_hash = block_ancestors.parent_block_id
        ORDER BY nb.burn_header_height DESC
      )
      SELECT
        burn_header_height,
        address,
        burnchain_commit_burn,
        stx_reward
      FROM block_ancestors
      LIMIT ?`;

  const blockStmt = chainstateDb.prepare<BlockAggregateRow>(baseQuery);
  const blockRows = blockStmt.all(windowSize);

  const btcSpent = new Map<string, number>();
  const stxEarned = new Map<string, number>();
  const blocksWon = new Map<string, number>();

  let countedRows = 0;
  for (const row of blockRows) {
    if (row.burn_header_height <= lowerBound) {
      continue;
    }
    const addr = row.address;
    blocksWon.set(addr, (blocksWon.get(addr) ?? 0) + 1);
    btcSpent.set(addr, (btcSpent.get(addr) ?? 0) + row.burnchain_commit_burn);
    stxEarned.set(addr, (stxEarned.get(addr) ?? 0) + row.stx_reward);
    countedRows += 1;
  }

  const burnFeeStmt = sortitionDb.prepare<BurnFeeRow>(
    `SELECT TRIM(sender, '"') AS sender, SUM(total_burn_fee) AS total_burn_fee FROM (
        SELECT TRIM(apparent_sender, '"') AS sender, burn_fee AS total_burn_fee
        FROM block_commits
        WHERE block_height > ?
      )
      GROUP BY sender`,
  );

  const burnFeeRows = burnFeeStmt.all(lowerBound);
  for (const row of burnFeeRows) {
    const btcAddr = row.sender;
    if (!btcAddr) continue;
    const stacksSet = maps.btcToStacks.get(btcAddr);
    if (!stacksSet) {
      continue;
    }
    for (const stacksAddr of stacksSet) {
      btcSpent.set(stacksAddr, row.total_burn_fee);
    }
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

  const missing = Math.max(0, windowSize - countedRows);
  if (missing > 0) {
    items.push({
      stacksRecipient: "No Canonical Sortition",
      bitcoinAddress: null,
      blocksWon: missing,
      btcSpent: 0,
      stxEarnt: 0,
      winRate: (missing / windowSize) * 100,
    });
  }

  items.sort((a, b) => b.blocksWon - a.blocksWon);

  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    windowSize,
    bitcoinBlockHeight,
    sortitionId,
    items,
  };
}
