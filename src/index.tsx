import { serve } from "bun";

import index from "./index.html";
import { fetchRecentBlocks } from "./server/blocks-service";
import { withDataDir, withLatestSnapshot } from "./server/api-utils";
import { maybeStartSnapshotWorker } from "./server/worker-manager";

maybeStartSnapshotWorker();

const isProduction = process.env.NODE_ENV === "production";
const server = serve({
  routes: {
    "/": index,
    "/blocks": index,

    "/api/miners/power": () =>
      withLatestSnapshot(({ snapshot }) => Response.json(snapshot.minerPower)),

    "/api/miners/viz": () =>
      withLatestSnapshot(({ snapshot }) => {
        return Response.json({
          ...snapshot.minerViz,
          description: "Stacks miner commits across recent Bitcoin blocks.",
        });
      }),

    "/api/blocks": () =>
      withDataDir(({ dataDir }) => {
        const blocks = fetchRecentBlocks({ dataDir, windowSize: 20 });
        return Response.json({ blocks });
      }),
  },

  development: !isProduction && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
