import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { Database } from "bun:sqlite";

import { parseCostVector, fetchRecentBlocks } from "@/server/blocks-service";
import { CHAINSTATE_DB_RELATIVE, SORTITION_DB_RELATIVE } from "@/server/paths";

test("parseCostVector handles null cost payload", () => {
  const result = parseCostVector(null);
  expect(result).toEqual({
    readLength: 0,
    readCount: 0,
    writeLength: 0,
    writeCount: 0,
    runtime: 0,
  });
});

test("parseCostVector supports legacy snake_cased keys", () => {
  const raw = JSON.stringify({
    read_length: 10,
    read_count: "5",
    write_length: 12,
    write_count: "3",
    runtime: "42",
  });
  const result = parseCostVector(raw);
  expect(result).toEqual({
    readLength: 10,
    readCount: 5,
    writeLength: 12,
    writeCount: 3,
    runtime: 42,
  });
});

test("parseCostVector falls back on bad JSON", () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  const result = parseCostVector("{not valid json");
  console.warn = originalWarn;
  expect(result).toEqual({
    readLength: 0,
    readCount: 0,
    writeLength: 0,
    writeCount: 0,
    runtime: 0,
  });
});

test("fetchRecentBlocks retrieves and parses blocks", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "blocks-service-"));
  const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);
  const sortitionPath = join(dataDir, SORTITION_DB_RELATIVE);

  try {
    mkdirSync(dirname(chainstatePath), { recursive: true });
    mkdirSync(dirname(sortitionPath), { recursive: true });
    const db = new Database(chainstatePath, { create: true });
    const sortitionDb = new Database(sortitionPath, { create: true });
    
    db.run(`
      CREATE TABLE nakamoto_block_headers (
        block_size INTEGER,
        cost TEXT,
        total_tenure_cost TEXT,
        tenure_changed INTEGER,
        tenure_tx_fees INTEGER,
        block_height INTEGER,
        burn_header_height INTEGER,
        timestamp INTEGER,
        block_hash TEXT,
        consensus_hash TEXT,
        index_block_hash TEXT,
        parent_block_id TEXT
      )
    `);

    db.run(`
      INSERT INTO nakamoto_block_headers (
        block_size, cost, total_tenure_cost, tenure_changed, tenure_tx_fees,
        block_height, burn_header_height, timestamp, block_hash, consensus_hash,
        index_block_hash, parent_block_id
      ) VALUES (
        100, '{"read_length": 1}', '{"read_length": 2}', 1, 500, 10, 1000,
        1234567890, 'block_10', 'consensus_10', 'index_10', 'index_9'
      )
    `);
    sortitionDb.run(`
      CREATE TABLE snapshots (
        block_height INTEGER,
        burn_header_hash TEXT,
        pox_valid INTEGER,
        canonical_stacks_tip_hash TEXT,
        canonical_stacks_tip_consensus_hash TEXT
      )
    `);
    sortitionDb.run(`
      INSERT INTO snapshots VALUES
        (1000, 'burn_1000', 1, 'block_10', 'consensus_10')
    `);

    db.close();
    sortitionDb.close();

    const blocks = fetchRecentBlocks({ dataDir, windowSize: 10 });
    expect(blocks.length).toBe(1);
    expect(blocks[0].blockHeight).toBe(10);
    expect(blocks[0].cost.readLength).toBe(1);
    expect(blocks[0].tenureCost.readLength).toBe(2);
    expect(blocks[0].tenureChanged).toBe(true);
    expect(blocks[0].tenureTxFees).toBe(500);

  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
