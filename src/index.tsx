import { serve } from "bun";
import { getMinerPowerSnapshot } from "./server/miner-power";
import { getLatestMinerViz } from "./server/miner-viz";
import index from "./index.html";

const isProduction = process.env.NODE_ENV === "production";
const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
};

const server = serve({
  routes: {
    "/": index,

    "/api/miners/power": () => {
      const snapshot = getMinerPowerSnapshot();
      return Response.json(snapshot);
    },

    "/api/miners/viz": () => {
      const viz = getLatestMinerViz();
      return Response.json(viz);
    },
  },

  development: !isProduction && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
