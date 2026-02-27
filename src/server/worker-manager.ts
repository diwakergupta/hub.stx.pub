import { getStacksDataDir } from "./env";

let snapshotWorker: Worker | null = null;

export function maybeStartSnapshotWorker(): Worker | null {
  if (snapshotWorker) {
    console.log("[startup] Miner snapshot worker already running");
    return snapshotWorker;
  }

  const dataDir = getStacksDataDir();
  console.log(
    `[startup] STACKS_DATA_DIR ${
      dataDir ? `→ ${dataDir}` : "not configured"
    }`,
  );

  if (!dataDir) {
    console.warn(
      "[startup] Miner snapshot worker not started (missing STACKS_DATA_DIR)",
    );
    return null;
  }

  try {
    const workerUrl = new URL("./snapshot-worker.ts", import.meta.url).href;
    const worker = new Worker(workerUrl, {
      name: "miner-snapshot",
      type: "module",
    });
    worker.addEventListener("error", (event) => {
      console.error("[worker] Miner snapshot worker error", event);
    });
    snapshotWorker = worker;
    return snapshotWorker;
  } catch (error) {
    console.error("[startup] Failed to spawn miner snapshot worker", error);
    snapshotWorker = null;
    return null;
  }
}
