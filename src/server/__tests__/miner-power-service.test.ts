import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

import {
  escapeSqliteString,
  buildMinerAddressMaps,
  computeMinerPowerSnapshot,
  MINER_POWER_WINDOW,
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
        stacks_block_height INTEGER
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
        winning_block_txid TEXT
      )
    `);
    sortitionDb.run(`
      CREATE TABLE block_commits (
        txid TEXT,
        apparent_sender TEXT
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
      "INSERT INTO payments (recipient, index_block_hash, stacks_block_height) VALUES (?, ?, ?)",
      [stxAddr, indexHash, 100]
    );
    chainstateDb.run(
      "INSERT INTO nakamoto_block_headers (index_block_hash, consensus_hash) VALUES (?, ?)",
      [indexHash, consensusHash]
    );

    sortitionDb.run(
      "INSERT INTO snapshots (consensus_hash, winning_block_txid) VALUES (?, ?)",
      [consensusHash, winTxid]
    );
    sortitionDb.run(
      "INSERT INTO block_commits (txid, apparent_sender) VALUES (?, ?)",
      [winTxid, `"${btcAddr}"`] // apparent_sender often has quotes in DB
    );

    // Run Function
    const maps = buildMinerAddressMaps(chainstateDb, sortitionPath);

    expect(maps.stacksToBtc.get(stxAddr)).toBe(btcAddr);
    expect(maps.btcToStacks.get(btcAddr)?.has(stxAddr)).toBeTrue();

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
        tx_fees_streamed INTEGER
      )
    `);
    sortitionDb.run(`
      CREATE TABLE block_commits (
        apparent_sender TEXT,
        burn_fee INTEGER,
        block_height INTEGER
      )
    `);

    // Insert Data
    // Block 1 (Parent) -> Block 2 (Child)
    // Miner A won Block 2.

    const minerStx = "STX_MINER_A";
    const minerBtc = "BTC_MINER_A";

    // Chain structure
    chainstateDb.run(`
      INSERT INTO nakamoto_block_headers (burn_header_height, index_block_hash, parent_block_id, tenure_changed)
      VALUES 
      (100, 'hash_1', 'hash_0', 1),
      (101, 'hash_2', 'hash_1', 1)
    `);

    // Payments (Rewards & Commit Burn)
    // For Block 2 (height 101), Miner A gets reward
    chainstateDb.run(`
      INSERT INTO payments (index_block_hash, recipient, burnchain_commit_burn, coinbase, tx_fees_anchored, tx_fees_streamed)
      VALUES 
      ('hash_2', '${minerStx}', 5000, 1000000, 0, 0)
    `);

    // Sortition (Total Burn Fees)
    // Miner A spent BTC at height 101
    sortitionDb.run(`
      INSERT INTO block_commits (apparent_sender, burn_fee, block_height)
      VALUES 
      ('"${minerBtc}"', 5000, 101)
    `);

    // Mock Address Map
    const maps = {
      stacksToBtc: new Map([[minerStx, minerBtc]]),
      btcToStacks: new Map([[minerBtc, new Set([minerStx])]]),
    };

    const snapshot = computeMinerPowerSnapshot({
      chainstateDb,
      sortitionDb,
      lowerBound: 90,
      windowSize: 10,
      maps,
      bitcoinBlockHeight: 101,
      sortitionId: "test-sort",
    });

    expect(snapshot.items.length).toBeGreaterThan(0);
    const minerStats = snapshot.items.find(i => i.stacksRecipient === minerStx);
    expect(minerStats).toBeDefined();
    expect(minerStats?.blocksWon).toBe(1);
    expect(minerStats?.stxEarnt).toBe(1); // 1000000 microSTX = 1 STX
    expect(minerStats?.btcSpent).toBe(5000); 

    chainstateDb.close();
    sortitionDb.close();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
