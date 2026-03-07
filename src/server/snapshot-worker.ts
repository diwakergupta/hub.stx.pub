import { getStacksDataDir } from "./env";
import { logger } from "./logger";
import { initializeSnapshotScheduler } from "./snapshot-job";

const dataDir = getStacksDataDir();
logger.info({ dataDir: dataDir ?? null }, "snapshot.worker.starting");

initializeSnapshotScheduler();
