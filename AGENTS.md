This project uses the following tech stack:
- Bun (runtime, package manager, bundler, test runner)
- React (frontend library)
- Chakra UI (component library)
- sqlite for backend storage. Use bun's built-in sqlite driver for interactive with sqlite
- D2 for diagrams. Style attributes are documented at https://d2lang.com/tour/style/

- Miner power stats and D2 graph snapshots are generated in a dedicated Bun worker (`src/server/snapshot-worker.ts`) every 2 minutes using Croner. The worker writes rows into `miner_snapshots` inside `STACKS_DATA_DIR/hub.sqlite` via helpers in `src/server/snapshot-job.ts` and `src/server/snapshot-store.ts`.
- API routes simply return the latest cached snapshot; if the table is empty the handlers respond with 503. Remember to set `STACKS_DATA_DIR` before running `bun --hot src/index.tsx` so the worker can start.
- The D2 SVG on the frontend is rendered in `DiagramView` with the `panzoom` npm package (see `src/App.tsx`); controls often need to re-initialize when the SVG changes.
- Miner power calculations depend on the global address maps populated inside the worker. When touching that logic, make sure to convert SQLite values to numbers (`Number(row)`), otherwise string concatenation bugs reappear.

If you start a fresh session, double-check:
- `STACKS_DATA_DIR` points at real sortition + chainstate DBs before running any commands.
- The worker’s console logs (prefixed `[worker]`, `[snapshots]`, `[scheduler]`) are visible in the main process – they are helpful for diagnosing snapshot lag.
- `miner_snapshots` schema lives in `snapshot-store.ts`; add migrations there if you need extra fields.

## Chakra UI

Use the Chakra MCP server, if available.
LLM docs available at https://chakra-ui.com/llms.txt

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
