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
import {
  insertSnapshot,
  loadLatestSnapshot,
  pruneSnapshots,
} from "./snapshot-store";

let cachedAddressMaps: MinerAddressMaps | null = null;
let isRunning = false;
let snapshotCron: Cron | null = null;
const SNAPSHOT_INTERVAL_MINUTES = 1;

function openReadOnlyDatabase(path: string): Database {
  const db = new Database(path, {
    readonly: true,
    strict: true,
  });
  db.exec("PRAGMA query_only = true");
  db.exec("PRAGMA temp_store = MEMORY");
  return db;
}

function getBlockRange(db: Database, windowSize: number) {
  const stmt = db.prepare<{ maxHeight: number | null }, []>(
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

function generateSnapshot(dataDir: string) {
  const generatedAt = new Date().toISOString();
  const sortitionPath = join(dataDir, SORTITION_DB_RELATIVE);
  const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);

  let sortitionDb: Database | undefined;
  let chainstateDb: Database | undefined;

  try {
    sortitionDb = openReadOnlyDatabase(sortitionPath);

    const { start } = getBlockRange(sortitionDb, MINER_VIZ_WINDOW);
    if (start === 0) {
      console.warn(
        "[snapshots] No block commits found; skipping snapshot generation",
      );
      return;
    }

    const latestSnapshot = loadLatestSnapshot(dataDir);
    if (latestSnapshot?.bitcoinBlockHeight === start) {
      console.log(
        `[snapshots] Snapshot for Bitcoin block ${start} already exists; skipping`,
      );
      return;
    }

    chainstateDb = openReadOnlyDatabase(chainstatePath);

    console.time("[snapshots] address-map");
    updateAddressMaps(chainstateDb, sortitionPath);
    const maps = getAddressMaps();
    console.timeEnd("[snapshots] address-map");

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
  } finally {
    sortitionDb?.close();
    chainstateDb?.close();
  }
}

async function runSnapshotGeneration() {
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
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      generateSnapshot(dataDir);
      break; // Success
    } catch (error) {
      console.error(`[snapshots] Attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`[snapshots] Retrying in ${delay}ms...`);
        await Bun.sleep(delay);
      } else {
         console.error("[snapshots] All snapshot generation attempts failed");
      }
    }
  }
  
  isRunning = false;
}

export function initializeSnapshotScheduler() {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    console.warn(
      "[startup] STACKS_DATA_DIR is not set; miner snapshots disabled",
    );
    return;
  }

  if (snapshotCron) {
    console.log("[startup] Miner snapshot scheduler already initialized");
    return;
  }

  console.log(
    `[startup] Initializing miner snapshot scheduler (interval: ${SNAPSHOT_INTERVAL_MINUTES} minutes)`,
  );

  // Prime address map and snapshot table immediately
  console.time("[startup] initial-snapshot");
  void runSnapshotGeneration().finally(() => {
    console.timeEnd("[startup] initial-snapshot");
  });

  snapshotCron = new Cron(`*/${SNAPSHOT_INTERVAL_MINUTES} * * * *`, async () => {
    console.time("[scheduler] miner snapshot refresh");
    await runSnapshotGeneration();
    console.timeEnd("[scheduler] miner snapshot refresh");
  });
}

export function getCachedAddressMaps(): MinerAddressMaps | null {
  return cachedAddressMaps;
}

export type { MinerPowerSnapshot, MinerVizSnapshot };
