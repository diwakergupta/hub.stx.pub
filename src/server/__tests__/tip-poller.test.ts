import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  checkTipUpdate,
  getCachedStacksTip,
  queryBlockStatsFromDb,
  setCachedStacksTipForTest,
  startTipPoller,
  stopTipPoller,
} from "../tip-poller";

describe("tip-poller service", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "hub-test-tip-"));
    setCachedStacksTipForTest(null);
    stopTipPoller();
  });

  afterEach(() => {
    stopTipPoller();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("queryBlockStatsFromDb queries headers and transactions correctly", () => {
    const vmDir = join(tempDir, "chainstate", "vm");
    mkdirSync(vmDir, { recursive: true });
    const dbPath = join(vmDir, "index.sqlite");

    const db = new Database(dbPath);
    db.run(`
      CREATE TABLE nakamoto_block_headers (
        block_height INTEGER,
        block_hash TEXT,
        consensus_hash TEXT,
        index_block_hash TEXT,
        timestamp INTEGER,
        block_size TEXT,
        height_in_tenure INTEGER,
        burn_header_height INTEGER
      );
    `);
    db.run(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY,
        index_block_hash TEXT,
        txid TEXT
      );
    `);

    db.run(`
      INSERT INTO nakamoto_block_headers VALUES (
        9060000, 'hash123', 'ch123', 'idx123', 1790000000, '4096', 5, 968000
      );
    `);
    db.run(`INSERT INTO transactions VALUES (1, 'idx123', 'tx1');`);
    db.run(`INSERT INTO transactions VALUES (2, 'idx123', 'tx2');`);
    db.run(`INSERT INTO transactions VALUES (3, 'idx123', 'tx3');`);
    db.close();

    const stats = queryBlockStatsFromDb(tempDir, "ch123", "hash123");
    expect(stats).not.toBeNull();
    expect(stats?.blockSize).toBe(4096);
    expect(stats?.txCount).toBe(3);
    expect(stats?.heightInTenure).toBe(5);
    expect(stats?.burnHeaderHeight).toBe(968000);
    expect(stats?.timestamp).toBe(1790000000);
  });

  test("checkTipUpdate falls back cleanly if DB does not have block yet", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          stacks_tip_height: 9060001,
          stacks_tip: "hash999",
          stacks_tip_consensus_hash: "ch999",
          tenure_height: 250000,
          burn_block_height: 968001,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    try {
      const tip = await checkTipUpdate({
        dataDir: tempDir,
        rpcUrl: "http://mock-rpc",
      });

      expect(tip).not.toBeNull();
      expect(tip?.blockHeight).toBe(9060001);
      expect(tip?.blockHash).toBe("hash999");
      expect(tip?.txCount).toBe(0);
      expect(getCachedStacksTip()?.blockHash).toBe("hash999");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("startTipPoller triggers onTip callback when new tip is found", async () => {
    const originalFetch = globalThis.fetch;
    let tipCount = 0;
    globalThis.fetch = mock(async () => {
      tipCount++;
      return new Response(
        JSON.stringify({
          stacks_tip_height: 9060000 + tipCount,
          stacks_tip: `hash_${tipCount}`,
          stacks_tip_consensus_hash: `ch_${tipCount}`,
          tenure_height: 250000,
          burn_block_height: 968000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    let receivedTip: any = null;
    try {
      const poller = startTipPoller({
        dataDir: tempDir,
        rpcUrl: "http://mock-rpc",
        intervalMs: 50,
        onTip: (tip) => {
          receivedTip = tip;
        },
      });

      // Give it a brief moment to run the tick
      await new Promise((resolve) => setTimeout(resolve, 80));
      poller.stop();

      expect(receivedTip).not.toBeNull();
      expect(receivedTip.blockHeight).toBeGreaterThanOrEqual(9060001);
    } finally {
      globalThis.fetch = originalFetch;
      stopTipPoller();
    }
  });
});
