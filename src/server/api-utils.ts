import { getStacksDataDir } from "./env";
import { loadLatestSnapshot, type MinerSnapshotRecord } from "./snapshot-store";

type DataDirHandler = (context: { dataDir: string }) => Response | Promise<Response>;
type SnapshotHandler = (params: {
  dataDir: string;
  snapshot: MinerSnapshotRecord;
}) => Response | Promise<Response>;

function respondMissingDataDir(): Response {
  console.warn("[api] STACKS_DATA_DIR not configured; failing request");
  return Response.json(
    { error: "STACKS_DATA_DIR is not configured" },
    { status: 500 },
  );
}

function respondMissingSnapshot(): Response {
  console.warn("[api] No miner snapshot available; returning 503");
  return Response.json({ error: "No miner snapshot available" }, { status: 503 });
}

export function withDataDir(handler: DataDirHandler) {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    return respondMissingDataDir();
  }
  return handler({ dataDir });
}

export function withLatestSnapshot(handler: SnapshotHandler) {
  return withDataDir(({ dataDir }) => {
    const snapshot = loadLatestSnapshot(dataDir);
    if (!snapshot) {
      return respondMissingSnapshot();
    }
    return handler({ dataDir, snapshot });
  });
}
