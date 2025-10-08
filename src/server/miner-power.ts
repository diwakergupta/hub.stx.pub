import { Database } from "bun:sqlite";
import { join } from "path";

import type { MinerPowerRow, MinerPowerSnapshot } from "@/shared/miner-power";
import { getStacksDataDir } from "./env";

const WINDOW_SIZE = 144;
const SORTITION_DB_RELATIVE = "burnchain/sortition/marf.sqlite";
const CHAINSTATE_DB_RELATIVE = "chainstate/vm/index.sqlite";

const SAMPLE_MINER_POWER: MinerPowerSnapshot = {
  generatedAt: new Date().toISOString(),
  windowSize: WINDOW_SIZE,
  isSample: true,
  items: [
    {
      stacksRecipient: "SP3FBR2AGK8M4SPC3588NYK3NM1N7ER8AVB9T9SC3",
      bitcoinAddress: "bc1pjgdpjy597p8t4hhsejzndr2t2h3pfv5j4mryg32v7grljazk3nm",
      blocksWon: 44,
      btcSpent: 523_000_000,
      stxEarnt: 8_450,
      winRate: 30.6,
    },
    {
      stacksRecipient: "SP1PQ03AH0CH7JEHY7ZP9QCHJW7MVYF0E3DEJZPCC",
      bitcoinAddress: "bc1pk0c65sy04hl9h0tte2a4gwt5p6n36faf07pa8htr9l0fu6pduam",
      blocksWon: 32,
      btcSpent: 386_000_000,
      stxEarnt: 6_360,
      winRate: 22.2,
    },
    {
      stacksRecipient: "SP2EB72DEAQ4BHD2GAT4PKXN1ZPQD1V35JBZG9Q41",
      bitcoinAddress: "bc1plu5rd9zfx8dnn0ydnfhf2mr22mxskq7vslvkctacfv5ms08n8tu",
      blocksWon: 18,
      btcSpent: 212_500_000,
      stxEarnt: 3_240,
      winRate: 12.5,
    },
    {
      stacksRecipient: "No Canonical Sortition",
      bitcoinAddress: null,
      blocksWon: 50,
      btcSpent: 0,
      stxEarnt: 0,
      winRate: 34.7,
    },
  ],
};

function escapeSqliteString(input: string): string {
  return input.replaceAll("'", "''");
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

function ensureDatabase(path: string): Database {
  return new Database(path, {
    readonly: true,
    create: false,
    strict: true,
  });
}

interface MinerAddressMaps {
  stacksToBtc: Map<string, string>;
  btcToStacks: Map<string, Set<string>>;
}

function buildMinerAddressMaps(
  chainstateDb: Database,
  sortitionPath: string,
): MinerAddressMaps {
  const stacksToBtc = new Map<string, string>();
  const btcToStacks = new Map<string, Set<string>>();

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

    const rows = stmt.all(WINDOW_SIZE * 4);
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

export function getMinerPowerSnapshot(): MinerPowerSnapshot {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    return SAMPLE_MINER_POWER;
  }

  const sortitionPath = join(dataDir, SORTITION_DB_RELATIVE);
  const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);

  let sortitionDb: Database | undefined;
  let chainstateDb: Database | undefined;

  try {
    sortitionDb = ensureDatabase(sortitionPath);
    chainstateDb = ensureDatabase(chainstatePath);

    sortitionDb.run("PRAGMA query_only = true");
    chainstateDb.run("PRAGMA query_only = true");

    const upperStmt = sortitionDb.prepare<{ maxHeight: number | null }>(
      "SELECT MAX(block_height) as maxHeight FROM block_commits",
    );
    const upperRow = upperStmt.get();
    const startBlock = upperRow?.maxHeight ?? 0;
    const lowerBound = startBlock - WINDOW_SIZE;

    const { stacksToBtc, btcToStacks } = buildMinerAddressMaps(
      chainstateDb,
      sortitionPath,
    );

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
    const blockRows = blockStmt.all(WINDOW_SIZE);

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
      const stacksSet = btcToStacks.get(btcAddr);
      if (!stacksSet) {
        continue;
      }
      for (const stacksAddr of stacksSet) {
        btcSpent.set(stacksAddr, row.total_burn_fee);
      }
    }

    const items: MinerPowerRow[] = [];
    for (const [addr, won] of blocksWon.entries()) {
      const btcAddr = stacksToBtc.get(addr) ?? null;
      const stxValue = (stxEarned.get(addr) ?? 0) / 1_000_000;
      const btcValue = btcSpent.get(addr) ?? 0;
      const winRate = (won / WINDOW_SIZE) * 100;

      items.push({
        stacksRecipient: addr,
        bitcoinAddress: btcAddr,
        blocksWon: won,
        btcSpent: btcValue,
        stxEarnt: stxValue,
        winRate,
      });
    }

    const missing = Math.max(0, WINDOW_SIZE - countedRows);
    if (missing > 0) {
      items.push({
        stacksRecipient: "No Canonical Sortition",
        bitcoinAddress: null,
        blocksWon: missing,
        btcSpent: 0,
        stxEarnt: 0,
        winRate: (missing / WINDOW_SIZE) * 100,
      });
    }

    items.sort((a, b) => b.blocksWon - a.blocksWon);

    return {
      generatedAt: new Date().toISOString(),
      windowSize: WINDOW_SIZE,
      isSample: false,
      items,
    };
  } catch (error) {
    console.warn("Falling back to sample miner power data", error);
    return {
      ...SAMPLE_MINER_POWER,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    sortitionDb?.close();
    chainstateDb?.close();
  }
}
