import { getStacksDataDir } from "./env";
import {
  loadLatestSnapshot,
  loadSnapshotByHeight,
  type MinerSnapshotRecord,
} from "./snapshot-store";

type DataDirHandler = (context: {
  dataDir: string;
}) => Response | Promise<Response>;
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
  return Response.json(
    { error: "No miner snapshot available" },
    { status: 503 },
  );
}

export function withDataDir(handler: DataDirHandler) {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    return respondMissingDataDir();
  }
  return handler({ dataDir });
}

export function withSnapshot(req: Request, handler: SnapshotHandler) {
  return withDataDir(({ dataDir }) => {
    const url = new URL(req.url);
    const heightStr = url.searchParams.get("height");
    let snapshot: MinerSnapshotRecord | null = null;

    if (heightStr) {
      const height = parseInt(heightStr, 10);
      if (!isNaN(height)) {
        snapshot = loadSnapshotByHeight(dataDir, height);
      }
    } else {
      snapshot = loadLatestSnapshot(dataDir);
    }

    if (!snapshot) {
      return respondMissingSnapshot();
    }
    return handler({ dataDir, snapshot });
  });
}
