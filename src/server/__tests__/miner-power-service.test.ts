import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  escapeSqliteString,
  buildMinerAddressMaps,
  computeMinerPowerSnapshot,
} from "@/server/miner-power-service";

test("escapeSqliteString doubles single quotes", () => {
  expect(escapeSqliteString("path/with'single")).toBe("path/with''single");
});

test("escapeSqliteString leaves clean strings untouched", () => {
  const value = "plain/path";
  expect(escapeSqliteString(value)).toBe(value);
});

// Integration tests
test("buildMinerAddressMaps links Stacks addresses to Bitcoin addresses", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "miner-power-"));
  const chainstatePath = join(dataDir, "chainstate.sqlite");
  const sortitionPath = join(dataDir, "sortition.sqlite");

  try {
    const chainstateDb = new Database(chainstatePath, { create: true });
    const sortitionDb = new Database(sortitionPath, { create: true });

    // Setup Chainstate Tables
    chainstateDb.run(`
      CREATE TABLE payments (
        recipient TEXT,
        index_block_hash TEXT,
        stacks_block_height INTEGER,
        miner INTEGER
      )
    `);
    chainstateDb.run(`
      CREATE TABLE nakamoto_block_headers (
        index_block_hash TEXT,
        consensus_hash TEXT
      )
    `);

    // Setup Sortition Tables
    sortitionDb.run(`
      CREATE TABLE snapshots (
        consensus_hash TEXT,
        winning_block_txid TEXT,
        sortition_id TEXT,
        parent_sortition_id TEXT,
        block_height INTEGER,
        burn_header_hash TEXT,
        pox_valid INTEGER,
        sortition INTEGER
      )
    `);
    sortitionDb.run(`
      CREATE TABLE block_commits (
        txid TEXT,
        apparent_sender TEXT,
        sortition_id TEXT
      )
    `);

    // Insert Test Data
    // We want to link Stacks Addr "ST1..." to BTC Addr "bc1..."
    // Path: payments -> nakamoto -> snapshots -> block_commits

    const indexHash = "index_hash_1";
    const consensusHash = "consensus_hash_1";
    const winTxid = "win_txid_1";
    const stxAddr = "ST1TEST";
    const btcAddr = "bc1TEST";

    chainstateDb.run(
      "INSERT INTO payments (recipient, index_block_hash, stacks_block_height, miner) VALUES (?, ?, ?, ?)",
      [stxAddr, indexHash, 100, 1]
    );
    chainstateDb.run(`
      INSERT INTO payments (recipient, index_block_hash, stacks_block_height, miner)
      VALUES
        ('ST1TEST', 'index_hash_older', 99, 1),
        ('ST1OTHER', 'index_hash_oldest', 98, 1),
        ('ST1IGNORED', 'index_hash_1', 100, 0)
    `);
    chainstateDb.run(
      "INSERT INTO nakamoto_block_headers (index_block_hash, consensus_hash) VALUES (?, ?)",
      [indexHash, consensusHash]
    );
    chainstateDb.run(`
      INSERT INTO nakamoto_block_headers (index_block_hash, consensus_hash)
      VALUES
        ('index_hash_older', 'consensus_hash_older'),
        ('index_hash_oldest', 'consensus_hash_oldest')
    `);

    sortitionDb.run(
      `INSERT INTO snapshots
        (consensus_hash, winning_block_txid, sortition_id, parent_sortition_id,
         block_height, burn_header_hash, pox_valid, sortition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [consensusHash, winTxid, "sort_1", "sort_0", 100, "burn_1", 1, 1]
    );
    sortitionDb.run(`
      INSERT INTO snapshots
        (consensus_hash, winning_block_txid, sortition_id, parent_sortition_id,
         block_height, burn_header_hash, pox_valid, sortition)
      VALUES
        ('consensus_hash_older', 'win_txid_older', 'sort_0', 'sort_oldest', 99, 'burn_0', 1, 1),
        ('consensus_hash_oldest', 'win_txid_oldest', 'sort_oldest', 'sort_root', 98, 'burn_oldest', 1, 1)
    `);
    sortitionDb.run(
      "INSERT INTO block_commits (txid, apparent_sender, sortition_id) VALUES (?, ?, ?)",
      [winTxid, `"${btcAddr}"`, "sort_1"] // apparent_sender often has quotes in DB
    );
    sortitionDb.run(`
      INSERT INTO block_commits (txid, apparent_sender, sortition_id)
      VALUES
        ('win_txid_older', '"bc1OLD"', 'sort_0'),
        ('win_txid_oldest', '"bc1OLD"', 'sort_oldest')
    `);

    // Run Function
    const maps = buildMinerAddressMaps(chainstateDb, sortitionPath);

    expect(maps.stacksToBtc.get(stxAddr)).toBe(btcAddr);
    expect(maps.btcToStacks.get(btcAddr)).toBe(stxAddr);
    expect(maps.btcToStacks.get("bc1OLD")).toBe(stxAddr);
    expect(maps.stacksToBtc.has("ST1IGNORED")).toBeFalse();

    chainstateDb.close();
    sortitionDb.close();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("computeMinerPowerSnapshot calculates miner stats", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "miner-power-stats-"));
  const chainstatePath = join(dataDir, "chainstate.sqlite");
  const sortitionPath = join(dataDir, "sortition.sqlite");

  try {
    const chainstateDb = new Database(chainstatePath, { create: true });
    const sortitionDb = new Database(sortitionPath, { create: true });

    // Setup Tables for computeMinerPowerSnapshot
    chainstateDb.run(`
      CREATE TABLE nakamoto_block_headers (
        burn_header_height INTEGER,
        consensus_hash TEXT,
        index_block_hash TEXT,
        parent_block_id TEXT,
        tenure_changed INTEGER
      )
    `);
    chainstateDb.run(`
      CREATE TABLE payments (
        index_block_hash TEXT,
        recipient TEXT,
        burnchain_commit_burn INTEGER,
        coinbase INTEGER,
        tx_fees_anchored INTEGER,
        tx_fees_streamed INTEGER,
        miner INTEGER
      )
    `);
    sortitionDb.run(`
      CREATE TABLE block_commits (
        txid TEXT,
        apparent_sender TEXT,
        burn_fee INTEGER,
        block_height INTEGER,
        sortition_id TEXT
      )
    `);
    sortitionDb.run(`
      CREATE TABLE snapshots (
        consensus_hash TEXT,
        sortition_id TEXT,
        parent_sortition_id TEXT,
        block_height INTEGER,
        burn_header_hash TEXT,
        pox_valid INTEGER,
        winning_block_txid TEXT,
        sortition INTEGER,
        canonical_stacks_tip_height INTEGER DEFAULT 0,
        canonical_stacks_tip_hash TEXT DEFAULT '',
        canonical_stacks_tip_consensus_hash TEXT DEFAULT ''
      )
    `);

    // Insert Data
    // Block 1 (Parent) -> Block 2 (Child)
    // Miner A won Block 2.

    const minerStx = "STX_MINER_A";
    const minerBtc = "BTC_MINER_A";

    // Chain structure
    chainstateDb.run(`
      INSERT INTO nakamoto_block_headers (burn_header_height, consensus_hash, index_block_hash, parent_block_id, tenure_changed)
      VALUES 
      (100, 'consensus_100', 'hash_1', 'hash_0', 1),
      (101, 'consensus_101', 'hash_2', 'hash_1', 1),
      (101, 'consensus_fork', 'hash_fork', 'hash_1', 1),
      (102, 'consensus_102', 'hash_3', 'hash_2', 1)
    `);

    // Payments (Rewards & Commit Burn)
    // For Block 2 (height 101), Miner A gets reward
    chainstateDb.run(`
      INSERT INTO payments (index_block_hash, recipient, burnchain_commit_burn, coinbase, tx_fees_anchored, tx_fees_streamed, miner)
      VALUES 
      ('hash_2', '${minerStx}', 5000, 1000000, 0, 0, 1),
      ('hash_2', 'STX_SUPPORTER', 5000, 500000, 0, 0, 0),
      ('hash_fork', 'STX_FORK', 9000, 9000000, 0, 0, 1),
      ('hash_3', 'STX_FUTURE', 8000, 8000000, 0, 0, 1)
    `);

    // Sortition (Total Burn Fees)
    // Miner A spent BTC at height 101
    sortitionDb.run(`
      INSERT INTO block_commits (txid, apparent_sender, burn_fee, block_height, sortition_id)
      VALUES 
      ('tx_101', '"${minerBtc}"', 5000, 101, 'sort_101'),
      ('tx_100', '"BTC_MINER_OLD"', 2000, 100, 'sort_100'),
      ('tx_fork', '"BTC_FORK"', 9000, 101, 'sort_fork'),
      ('tx_102', '"BTC_FUTURE"', 8000, 102, 'sort_102')
    `);
    sortitionDb.run(`
      INSERT INTO snapshots
        (consensus_hash, sortition_id, parent_sortition_id, block_height, burn_header_hash,
         pox_valid, winning_block_txid, sortition)
      VALUES
        ('consensus_100', 'sort_100', 'sort_99', 100, 'burn_100', 1, 'tx_100', 1),
        ('consensus_101', 'sort_101', 'sort_100', 101, 'burn_101', 1, 'tx_101', 1),
        ('consensus_fork', 'sort_fork', 'sort_100', 101, 'burn_fork', 1, 'tx_fork', 1),
        ('consensus_102', 'sort_102', 'sort_101', 102, 'burn_102', 1, 'tx_102', 1)
    `);

    // Mock Address Map
    const maps = {
      stacksToBtc: new Map([[minerStx, minerBtc]]),
      btcToStacks: new Map([
        [minerBtc, minerStx],
        ["BTC_MINER_OLD", minerStx],
        ["BTC_FORK", "STX_FORK"],
        ["BTC_FUTURE", "STX_FUTURE"],
      ]),
    };

    const snapshot = computeMinerPowerSnapshot({
      chainstateDb,
      sortitionDb,
      bitcoinWindowSize: 10,
      maps,
      bitcoinBlockHeight: 101,
      sortitionId: "test-sort",
    });

    expect(snapshot.items.length).toBeGreaterThan(0);
    const minerStats = snapshot.items.find(i => i.stacksRecipient === minerStx);
    expect(minerStats).toBeDefined();
    expect(minerStats?.blocksWon).toBe(2);
    expect(minerStats?.stxEarnt).toBe(1); // 1000000 microSTX = 1 STX
    expect(minerStats?.btcSpent).toBe(7000);
    expect(snapshot.items.some(i => i.stacksRecipient === "STX_SUPPORTER")).toBeFalse();
    expect(snapshot.items.some(i => i.stacksRecipient === "STX_FORK")).toBeFalse();
    expect(snapshot.items.some(i => i.stacksRecipient === "STX_FUTURE")).toBeFalse();

    chainstateDb.close();
    sortitionDb.close();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
