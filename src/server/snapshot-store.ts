import { Database } from "bun:sqlite";
import { join } from "path";

import type { MinerPowerSnapshot } from "@/shared/miner-power";
import type { MinerVizGraph } from "@/shared/miner-viz";
import { parseDotToGraph, type MinerVizSnapshot } from "./miner-viz";
import { getHubDbPath } from "./paths";

const SNAPSHOT_SCHEMA = `CREATE TABLE IF NOT EXISTS miner_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  bitcoin_block_height INTEGER NOT NULL,
  sortition_id TEXT,
  miner_power_json TEXT NOT NULL,
  dot_source TEXT NOT NULL,
  graph_json TEXT
)`;

interface SnapshotRow {
  generated_at: string;
  bitcoin_block_height: number;
  sortition_id: string | null;
  miner_power_json: string;
  dot_source: string;
  graph_json?: string | null;
}

export interface MinerSnapshotRecord {
  generatedAt: string;
  bitcoinBlockHeight: number;
  sortitionId: string | null;
  minerPower: MinerPowerSnapshot;
  minerViz: MinerVizSnapshot;
}

function openHubDatabase(dataDir: string, mode: "read" | "write"): Database {
  const path = getHubDbPath(dataDir);
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
  try {
    db.run("ALTER TABLE miner_snapshots ADD COLUMN graph_json TEXT");
  } catch {
    // Ignore if column already exists
  }
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
    const graphJson = record.minerViz.graph
      ? JSON.stringify(record.minerViz.graph)
      : null;
    const stmt = db.prepare(
      `INSERT INTO miner_snapshots (
          generated_at,
          bitcoin_block_height,
          sortition_id,
          miner_power_json,
          dot_source,
          graph_json
        ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      record.generatedAt,
      record.bitcoinBlockHeight,
      record.sortitionId,
      JSON.stringify(record.minerPower),
      record.minerViz.dotSource,
      graphJson,
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

function parseSnapshotRow(row: SnapshotRow): MinerSnapshotRecord {
  const minerPower = JSON.parse(row.miner_power_json) as MinerPowerSnapshot;

  let graph: MinerVizGraph;
  if (row.graph_json) {
    try {
      graph = JSON.parse(row.graph_json);
    } catch {
      graph = parseDotToGraph(row.dot_source);
    }
  } else {
    graph = parseDotToGraph(row.dot_source);
  }

  const minerViz: MinerVizSnapshot = {
    generatedAt: row.generated_at,
    bitcoinBlockHeight: row.bitcoin_block_height,
    sortitionId: row.sortition_id,
    dotSource: row.dot_source,
    graph,
  };

  return {
    generatedAt: row.generated_at,
    bitcoinBlockHeight: row.bitcoin_block_height,
    sortitionId: row.sortition_id,
    minerPower,
    minerViz,
  };
}

function getSelectColumns(db: Database): string {
  try {
    const col = db
      .prepare<{ name: string }>(
        "SELECT name FROM pragma_table_info('miner_snapshots') WHERE name = 'graph_json'",
      )
      .get();
    if (col) {
      return "generated_at, bitcoin_block_height, sortition_id, miner_power_json, dot_source, graph_json";
    }
  } catch {}
  return "generated_at, bitcoin_block_height, sortition_id, miner_power_json, dot_source, NULL AS graph_json";
}

function fetchSnapshot(
  dataDir: string,
  queryBuilder: (columns: string) => string,
  params: any[] = [],
): MinerSnapshotRecord | null {
  const db = openHubDatabase(dataDir, "read");
  try {
    let row: SnapshotRow | null;
    try {
      const columns = getSelectColumns(db);
      const query = queryBuilder(columns);
      row = db.prepare<SnapshotRow, any[]>(query).get(...params);
    } catch (error) {
      if (error instanceof Error && /no such table/i.test(error.message)) {
        return null;
      }
      throw error;
    }

    if (!row) {
      return null;
    }

    return parseSnapshotRow(row);
  } finally {
    db.close();
  }
}

export function loadLatestSnapshot(
  dataDir: string,
): MinerSnapshotRecord | null {
  return fetchSnapshot(
    dataDir,
    (cols) =>
      `SELECT ${cols}
       FROM miner_snapshots
       ORDER BY rowid DESC
       LIMIT 1`,
  );
}

export function loadSnapshotByHeight(
  dataDir: string,
  targetHeight: number,
): MinerSnapshotRecord | null {
  return fetchSnapshot(
    dataDir,
    (cols) =>
      `SELECT ${cols}
       FROM miner_snapshots
       ORDER BY ABS(bitcoin_block_height - ?) ASC
       LIMIT 1`,
    [targetHeight],
  );
}
