import { serve } from "bun";

import index from "./index.html";
import { getStacksDataDir } from "./server/env";
import { loadLatestSnapshot } from "./server/snapshot-store";

const configuredDataDir = getStacksDataDir();
let snapshotWorker: Worker | null = null;
console.log(
  `[startup] STACKS_DATA_DIR ${configuredDataDir ? `→ ${configuredDataDir}` : "not configured"}`,
);

if (configuredDataDir) {
  try {
    const workerUrl = new URL("./server/snapshot-worker.ts", import.meta.url)
      .href;
    snapshotWorker = new Worker(workerUrl, {
      name: "miner-snapshot",
      type: "module",
    });
    snapshotWorker.addEventListener("error", (event) => {
      console.error("[worker] Miner snapshot worker error", event);
    });
  } catch (error) {
    console.error("[startup] Failed to spawn miner snapshot worker", error);
  }
} else {
  console.warn(
    "[startup] Miner snapshot worker not started (missing STACKS_DATA_DIR)",
  );
}

const isProduction = process.env.NODE_ENV === "production";
const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
};

const server = serve({
  routes: {
    "/": index,

    "/api/miners/power": () => {
      const dataDir = getStacksDataDir();
      if (!dataDir) {
        console.warn("[api] STACKS_DATA_DIR not configured; failing request");
        return Response.json(
          { error: "STACKS_DATA_DIR is not configured" },
          { status: 500 },
        );
      }

      const snapshot = loadLatestSnapshot(dataDir);
      if (!snapshot) {
        console.warn("[api] No miner snapshot available; returning 503");
        return Response.json(
          { error: "No miner snapshot available" },
          { status: 503 },
        );
      }
      return Response.json(snapshot.minerPower);
    },

    "/api/miners/viz": () => {
      const dataDir = getStacksDataDir();
      if (!dataDir) {
        console.warn("[api] STACKS_DATA_DIR not configured; failing request");
        return Response.json(
          { error: "STACKS_DATA_DIR is not configured" },
          { status: 500 },
        );
      }

      const snapshot = loadLatestSnapshot(dataDir);
      if (!snapshot) {
        console.warn("[api] No miner snapshot available; returning 503");
        return Response.json(
          { error: "No miner snapshot available" },
          { status: 503 },
        );
      }
      return Response.json({
        ...snapshot.minerViz,
        description: "Stacks miner commits across recent Bitcoin blocks.",
      });
    },
  },

  development: !isProduction && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
