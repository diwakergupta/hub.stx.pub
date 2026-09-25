import { serve } from "bun";

import index from "./index.html";
import { fetchRecentBlocks } from "./server/blocks-service";
import { withDataDir, withSnapshot } from "./server/api-utils";
import { logger } from "./server/logger";
import { withRequestLogging } from "./server/request-logger";
import { maybeStartSnapshotWorker } from "./server/worker-manager";
import { getCachedStacksTip, startTipPoller } from "./server/tip-poller";

const port = parseInt(process.env.PORT || "4020", 10);
const hostname = process.env.HOST || "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";


const server = serve({
  port,
  hostname,
  routes: {
    "/": index,
    "/blocks": index,
    "/utilities": index,

    "/api/miners/power": withRequestLogging("/api/miners/power", (req) =>
      withSnapshot(req, ({ snapshot }) => Response.json(snapshot.minerPower)),
    ),

    "/api/miners/viz": withRequestLogging("/api/miners/viz", (req) =>
      withSnapshot(req, ({ snapshot }) => {
        return Response.json({
          ...snapshot.minerViz,
          description: "Stacks miner commits across recent Bitcoin blocks.",
        });
      }),
    ),

    "/api/blocks": withRequestLogging("/api/blocks", () =>
      withDataDir(({ dataDir }) => {
        const blocks = fetchRecentBlocks({ dataDir, windowSize: 20 });
        return Response.json({ blocks });
      }),
    ),

    "/api/stacks/tip": withRequestLogging("/api/stacks/tip", () => {
      const tip = getCachedStacksTip();
      return Response.json({ tip });
    }),

    "/api/ws": (req, srv) => {
      if (srv.upgrade(req)) {
        return; // successfully upgraded
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    },
  },

  websocket: {
    open(ws) {
      ws.subscribe("telemetry");
      logger.info("websocket.client.connected");
      const tip = getCachedStacksTip();
      if (tip) {
        ws.send(JSON.stringify({ type: "stacks_tip", data: tip }));
      }
    },
    message(ws, msg) {
      if (msg === "ping") {
        ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
      }
    },
    close(ws) {
      logger.info("websocket.client.disconnected");
    },
  },

  development: !isProduction && {
    hmr: true,
    console: true,
  },
});

maybeStartSnapshotWorker((event) => {
  if (event && event.type) {
    logger.info({ event }, "broadcasting.telemetry.event");
    server.publish("telemetry", JSON.stringify(event));
  }
});

startTipPoller({
  onTip: (tip) => {
    logger.info({ height: tip.blockHeight, hash: tip.blockHash }, "stacks.tip.updated");
    server.publish("telemetry", JSON.stringify({ type: "stacks_tip", data: tip }));
  },
});

logger.info(
  {
    url: server.url.toString(),
    port,
    hostname,
    db: process.env.HUB_DB_FILENAME || "hub.sqlite",
  },
  "server.start",
);
