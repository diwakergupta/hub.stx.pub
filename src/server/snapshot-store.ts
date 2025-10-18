import { Database } from "bun:sqlite";
import { join } from "path";

import type { MinerPowerSnapshot } from "@/shared/miner-power";
import type { MinerVizSnapshot } from "./miner-viz";
import { HUB_DB_RELATIVE } from "./paths";

const SNAPSHOT_SCHEMA = `CREATE TABLE IF NOT EXISTS miner_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  bitcoin_block_height INTEGER NOT NULL,
  sortition_id TEXT,
  miner_power_json TEXT NOT NULL,
  d2_source TEXT NOT NULL
)`;

interface SnapshotRow {
  generated_at: string;
  bitcoin_block_height: number;
  sortition_id: string | null;
  miner_power_json: string;
  d2_source: string;
}

export interface MinerSnapshotRecord {
  generatedAt: string;
  bitcoinBlockHeight: number;
  sortitionId: string | null;
  minerPower: MinerPowerSnapshot;
  minerViz: MinerVizSnapshot;
}

function openHubDatabase(dataDir: string, mode: "read" | "write"): Database {
  const path = join(dataDir, HUB_DB_RELATIVE);
  if (mode === "read") {
    const db = new Database(path, {
      readonly: true,
      strict: true,
    });
    return db;
  }

  const db = new Database(path, {
    create: true,
    readwrite: true,
    strict: true,
  });
  db.run("PRAGMA journal_mode=WAL");
  db.run(SNAPSHOT_SCHEMA);
  return db;
}

export function insertSnapshot(
  dataDir: string,
  record: {
    generatedAt: string;
    bitcoinBlockHeight: number;
    sortitionId: string | null;
    minerPower: MinerPowerSnapshot;
    minerViz: MinerVizSnapshot;
  },
) {
  const db = openHubDatabase(dataDir, "write");
  try {
    const stmt = db.prepare(
      `INSERT INTO miner_snapshots (
          generated_at,
          bitcoin_block_height,
          sortition_id,
          miner_power_json,
          d2_source
        ) VALUES (?, ?, ?, ?, ?)`,
    );
    stmt.run(
      record.generatedAt,
      record.bitcoinBlockHeight,
      record.sortitionId,
      JSON.stringify(record.minerPower),
      record.minerViz.d2Source,
    );
  } finally {
    db.close();
  }
}

export function pruneSnapshots(
  dataDir: string,
  maxAgeMs = 1000 * 60 * 60 * 24,
) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const db = openHubDatabase(dataDir, "write");
  try {
    const stmt = db.prepare(
      `DELETE FROM miner_snapshots WHERE generated_at < ?`,
    );
    stmt.run(cutoff);
  } finally {
    db.close();
  }
}

export function loadLatestSnapshot(
  dataDir: string,
): MinerSnapshotRecord | null {
  const db = openHubDatabase(dataDir, "read");
  try {
    let row: SnapshotRow | undefined;
    try {
      row = db
        .prepare<SnapshotRow>(
          `SELECT
             generated_at,
             bitcoin_block_height,
             sortition_id,
             miner_power_json,
             d2_source
           FROM miner_snapshots
           ORDER BY rowid DESC
           LIMIT 1`,
        )
        .get();
    } catch (error) {
      if (error instanceof Error && /no such table/i.test(error.message)) {
        return null;
      }
      throw error;
    }

    if (!row) {
      return null;
    }

    const minerPower = JSON.parse(row.miner_power_json) as MinerPowerSnapshot;
    const minerViz: MinerVizSnapshot = {
      generatedAt: row.generated_at,
      bitcoinBlockHeight: row.bitcoin_block_height,
      sortitionId: row.sortition_id,
      d2Source: row.d2_source,
    };

    return {
      generatedAt: row.generated_at,
      bitcoinBlockHeight: row.bitcoin_block_height,
      sortitionId: row.sortition_id,
      minerPower,
      minerViz,
    };
  } finally {
    db.close();
  }
}
