import { getStacksDataDir } from "./env";
import { initializeSnapshotScheduler } from "./snapshot-job";

const dataDir = getStacksDataDir();
console.log(
  `[worker] Miner snapshot worker starting${
    dataDir ? ` with STACKS_DATA_DIR=${dataDir}` : " (no STACKS_DATA_DIR configured)"
  }`,
);

initializeSnapshotScheduler();
