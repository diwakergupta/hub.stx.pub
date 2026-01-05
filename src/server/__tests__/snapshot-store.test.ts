import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { insertSnapshot, loadLatestSnapshot, pruneSnapshots } from "@/server/snapshot-store";
import { HUB_DB_RELATIVE } from "@/server/paths";
import { Database } from "bun:sqlite";

test("pruneSnapshots removes rows older than a day", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "snapshot-store-"));

  try {
    const baseSnapshot = {
      bitcoinBlockHeight: 123,
      sortitionId: "abc",
      minerPower: {
        generatedAt: "",
        windowSize: 10,
        bitcoinBlockHeight: 123,
        sortitionId: "abc",
        items: [],
      },
      minerViz: {
        generatedAt: "",
        bitcoinBlockHeight: 123,
        sortitionId: "abc",
        dotSource: "digraph {}",
      },
    };

    insertSnapshot(dataDir, {
      ...baseSnapshot,
      generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      minerPower: {
        ...baseSnapshot.minerPower,
        generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      minerViz: {
        ...baseSnapshot.minerViz,
        generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    insertSnapshot(dataDir, {
      ...baseSnapshot,
      generatedAt: new Date().toISOString(),
      minerPower: {
        ...baseSnapshot.minerPower,
        generatedAt: new Date().toISOString(),
      },
      minerViz: {
        ...baseSnapshot.minerViz,
        generatedAt: new Date().toISOString(),
      },
    });

    pruneSnapshots(dataDir);

    const db = new Database(join(dataDir, HUB_DB_RELATIVE), { readonly: true });
    try {
      const count = db
        .prepare<{ total: number }>(
          "SELECT COUNT(*) AS total FROM miner_snapshots",
        )
        .get();
      expect(count?.total).toBe(1);
    } finally {
      db.close();
    }

    const latest = loadLatestSnapshot(dataDir);
    expect(latest).not.toBeNull();
    expect(latest?.generatedAt).toBeDefined();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
