import { getStacksDataDir } from "./env";
import { logger } from "./logger";

let snapshotWorker: Worker | null = null;

export function maybeStartSnapshotWorker(): Worker | null {
  if (snapshotWorker) {
    logger.info("snapshot.worker.already-running");
    return snapshotWorker;
  }

  const dataDir = getStacksDataDir();
  logger.info({ dataDir: dataDir ?? null }, "startup.stacks-data-dir");

  if (!dataDir) {
    logger.warn("snapshot.worker.not-started.missing-data-dir");
    return null;
  }

  try {
    const workerUrl = new URL("./snapshot-worker.ts", import.meta.url).href;
    const worker = new Worker(workerUrl, {
      name: "miner-snapshot",
      type: "module",
    });
    worker.addEventListener("error", (event) => {
      logger.error({ err: event }, "snapshot.worker.error");
    });
    snapshotWorker = worker;
    return snapshotWorker;
  } catch (error) {
    logger.error({ err: error }, "snapshot.worker.spawn.failed");
    snapshotWorker = null;
    return null;
  }
}
