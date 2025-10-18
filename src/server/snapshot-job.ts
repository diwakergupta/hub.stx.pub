import { Cron } from "croner";
import { Database } from "bun:sqlite";
import { join } from "path";

import type { MinerPowerSnapshot } from "@/shared/miner-power";
import { getStacksDataDir } from "./env";
import {
  MINER_POWER_WINDOW,
  buildMinerAddressMaps,
  computeMinerPowerSnapshot,
  type MinerAddressMaps,
} from "./miner-power-service";
import {
  MINER_VIZ_WINDOW,
  computeMinerVizSnapshot,
  type MinerVizSnapshot,
} from "./miner-viz";
import { CHAINSTATE_DB_RELATIVE, SORTITION_DB_RELATIVE } from "./paths";
import { insertSnapshot, pruneSnapshots } from "./snapshot-store";

let cachedAddressMaps: MinerAddressMaps | null = null;
let isRunning = false;

function openReadOnlyDatabase(path: string): Database {
  const db = new Database(path, {
    readonly: true,
    strict: true,
  });
  return db;
}

function getBlockRange(db: Database, windowSize: number) {
  const stmt = db.prepare<{ maxHeight: number | null }>(
    "SELECT MAX(block_height) AS maxHeight FROM block_commits",
  );
  const row = stmt.get();
  const start = row?.maxHeight ?? 0;
  const lowerBound = Math.max(0, start - windowSize);
  return { start, lowerBound };
}

function updateAddressMaps(chainstateDb: Database, sortitionPath: string) {
  cachedAddressMaps = buildMinerAddressMaps(chainstateDb, sortitionPath);
}

function getAddressMaps(): MinerAddressMaps {
  if (!cachedAddressMaps) {
    throw new Error("Miner address map has not been initialized yet");
  }
  return cachedAddressMaps;
}

function runSnapshotGeneration() {
  if (isRunning) {
    console.warn(
      "[snapshots] Previous run still in progress; skipping this tick",
    );
    return;
  }

  const dataDir = getStacksDataDir();
  if (!dataDir) {
    console.warn(
      "[snapshots] STACKS_DATA_DIR is not set; unable to generate snapshots",
    );
    return;
  }

  isRunning = true;
  const generatedAt = new Date().toISOString();
  const sortitionPath = join(dataDir, SORTITION_DB_RELATIVE);
  const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);

  let sortitionDb: Database | undefined;
  let chainstateDb: Database | undefined;

  try {
    sortitionDb = openReadOnlyDatabase(sortitionPath);
    chainstateDb = openReadOnlyDatabase(chainstatePath);

    console.time("[snapshots] address-map");
    updateAddressMaps(chainstateDb, sortitionPath);
    const maps = getAddressMaps();
    console.timeEnd("[snapshots] address-map");

    const { start } = getBlockRange(sortitionDb, MINER_VIZ_WINDOW);
    if (start === 0) {
      console.warn(
        "[snapshots] No block commits found; skipping snapshot generation",
      );
      return;
    }

    const lowerBoundViz = Math.max(0, start - MINER_VIZ_WINDOW);
    const lowerBoundPower = Math.max(0, start - MINER_POWER_WINDOW);

    console.time("[snapshots] viz-generation");
    const minerViz = computeMinerVizSnapshot({
      sortitionDb,
      chainstateDb,
      lowerBound: lowerBoundViz,
      startBlock: start,
      generatedAt,
    });
    console.timeEnd("[snapshots] viz-generation");

    console.time("[snapshots] power-generation");
    const minerPower = computeMinerPowerSnapshot({
      chainstateDb,
      sortitionDb,
      lowerBound: lowerBoundPower,
      maps,
      bitcoinBlockHeight: start,
      sortitionId: minerViz.sortitionId,
      generatedAt,
    });
    console.timeEnd("[snapshots] power-generation");

    insertSnapshot(dataDir, {
      generatedAt,
      bitcoinBlockHeight: start,
      sortitionId: minerViz.sortitionId,
      minerPower,
      minerViz,
    });

    pruneSnapshots(dataDir);

    console.log(
      `[snapshots] Stored snapshot for Bitcoin block ${start} (sortition ${
        minerViz.sortitionId ?? "unknown"
      }) at ${generatedAt}`,
    );
  } catch (error) {
    console.error("[snapshots] Failed to generate miner snapshot", error);
  } finally {
    sortitionDb?.close();
    chainstateDb?.close();
    isRunning = false;
  }
}

export function initializeSnapshotScheduler() {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    console.warn(
      "[startup] STACKS_DATA_DIR is not set; miner snapshots disabled",
    );
    return;
  }

  console.log(
    "[startup] Initializing miner snapshot scheduler (interval: 2 minutes)",
  );

  // Prime address map and snapshot table immediately
  console.time("[startup] initial-snapshot");
  runSnapshotGeneration();
  console.timeEnd("[startup] initial-snapshot");

  new Cron("*/4 * * * *", () => {
    console.log("[scheduler] Triggering miner snapshot refresh");
    runSnapshotGeneration();
  });
}

export function getCachedAddressMaps(): MinerAddressMaps | null {
  return cachedAddressMaps;
}

export type { MinerPowerSnapshot, MinerVizSnapshot };
