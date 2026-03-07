import { Cron } from "croner";
import { Database } from "bun:sqlite";
import { join } from "path";

import type { MinerPowerSnapshot } from "@/shared/miner-power";
import { getStacksDataDir } from "./env";
import { logger } from "./logger";
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

const snapshotLogger = logger.child({ component: "snapshot-job" });

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

function logDuration(event: string, startedAt: number, extra?: object) {
  snapshotLogger.info(
    {
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ...extra,
    },
    event,
  );
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
      snapshotLogger.warn("snapshots.no-block-commits");
      return;
    }

    const latestSnapshot = loadLatestSnapshot(dataDir);
    if (latestSnapshot?.bitcoinBlockHeight === start) {
      snapshotLogger.info({ bitcoinBlockHeight: start }, "snapshots.already-exists");
      return;
    }

    chainstateDb = openReadOnlyDatabase(chainstatePath);

    const addressMapStart = performance.now();
    updateAddressMaps(chainstateDb, sortitionPath);
    const maps = getAddressMaps();
    logDuration("snapshots.address-map.complete", addressMapStart);

    const lowerBoundViz = Math.max(0, start - MINER_VIZ_WINDOW);
    const lowerBoundPower = Math.max(0, start - MINER_POWER_WINDOW);

    const vizStart = performance.now();
    const minerViz = computeMinerVizSnapshot({
      sortitionDb,
      chainstateDb,
      lowerBound: lowerBoundViz,
      startBlock: start,
      generatedAt,
    });
    logDuration("snapshots.viz-generation.complete", vizStart);

    const powerStart = performance.now();
    const minerPower = computeMinerPowerSnapshot({
      chainstateDb,
      sortitionDb,
      lowerBound: lowerBoundPower,
      maps,
      bitcoinBlockHeight: start,
      sortitionId: minerViz.sortitionId,
      generatedAt,
    });
    logDuration("snapshots.power-generation.complete", powerStart);

    insertSnapshot(dataDir, {
      generatedAt,
      bitcoinBlockHeight: start,
      sortitionId: minerViz.sortitionId,
      minerPower,
      minerViz,
    });

    pruneSnapshots(dataDir);

    snapshotLogger.info(
      {
        bitcoinBlockHeight: start,
        sortitionId: minerViz.sortitionId ?? null,
        generatedAt,
      },
      "snapshots.stored",
    );
  } finally {
    sortitionDb?.close();
    chainstateDb?.close();
  }
}

async function runSnapshotGeneration() {
  if (isRunning) {
    snapshotLogger.warn("snapshots.previous-run-in-progress");
    return;
  }

  const dataDir = getStacksDataDir();
  if (!dataDir) {
    snapshotLogger.warn("snapshots.missing-data-dir");
    return;
  }

  isRunning = true;
  const maxRetries = 3;

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        generateSnapshot(dataDir);
        break;
      } catch (error) {
        snapshotLogger.error({ err: error, attempt, maxRetries }, "snapshots.attempt.failed");
        if (attempt < maxRetries) {
          const delay = 2000 * attempt;
          snapshotLogger.info({ delayMs: delay, nextAttempt: attempt + 1 }, "snapshots.retry.scheduled");
          await Bun.sleep(delay);
        } else {
          snapshotLogger.error({ attempt, maxRetries }, "snapshots.all-attempts-failed");
        }
      }
    }
  } finally {
    isRunning = false;
  }
}

export function initializeSnapshotScheduler() {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    snapshotLogger.warn("startup.snapshots.disabled.missing-data-dir");
    return;
  }

  if (snapshotCron) {
    snapshotLogger.info("startup.snapshot-scheduler.already-initialized");
    return;
  }

  snapshotLogger.info(
    { intervalMinutes: SNAPSHOT_INTERVAL_MINUTES },
    "startup.snapshot-scheduler.initializing",
  );

  const initialSnapshotStart = performance.now();
  void runSnapshotGeneration().finally(() => {
    logDuration("startup.initial-snapshot.complete", initialSnapshotStart);
  });

  snapshotCron = new Cron(`*/${SNAPSHOT_INTERVAL_MINUTES} * * * *`, async () => {
    const refreshStart = performance.now();
    await runSnapshotGeneration();
    logDuration("scheduler.snapshot-refresh.complete", refreshStart);
  });
}

export function getCachedAddressMaps(): MinerAddressMaps | null {
  return cachedAddressMaps;
}

export type { MinerPowerSnapshot, MinerVizSnapshot };
