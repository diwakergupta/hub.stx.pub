# Context for AI Agents

This file provides high-level context and architectural guidelines for AI agents working on this codebase.

## Project Overview

**stx.pub** is a Stacks miner telemetry explorer. It visualizes block commits, sortition data, and miner power distribution using data from a local Stacks node.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (Package manager, bundler, test runner, sqlite driver)
- **Frontend**: React 19, Chakra UI v3
- **Backend**: Bun.serve(), bun:sqlite
- **Visualization**: Graphviz (via `@viz-js/viz`) for block commit graphs, Recharts for charts
- **Data**: SQLite (consuming `marf.sqlite` and `index.sqlite` from a Stacks node)

## Architecture

### Backend (`src/server/`)

- **Worker (`snapshot-worker.ts`)**: Runs on a cron schedule (every 2 minutes). It reads from the raw Stacks DBs (`chainstate`, `sortition`) and aggregates data into a "Hub DB" (`hub.sqlite`).
- **Jobs (`snapshot-job.ts`)**: Contains the core logic for generating snapshots. Includes retry logic for resilience.
- **Services**:
    - `miner-power-service.ts`: Aggregates miner win rates, BTC spend, and STX earnings.
    - `miner-viz.ts`: Generates Graphviz DOT source for block commit visualizations.
    - `blocks-service.ts`: Fetches recent block data for the blocks page.
- **API**: Simple HTTP handlers in `src/index.tsx` that serve the latest cached snapshot from `hub.sqlite`.

### Frontend (`src/pages/`, `src/components/`)

- **Routing**: Simple client-side routing in `App.tsx`.
- **Visualizations**:
    - `DiagramView`: Renders the DOT graph using `@viz-js/viz` and `panzoom`.
    - `MinerPowerView`: Displays miner stats in a sortable table.
    - `BlocksPage`: Shows recent block stats and tenure costs.

## Key Conventions

- **Data Directory**: `STACKS_DATA_DIR` must point to a directory containing valid `chainstate/` and `burnchain/` subdirectories.
- **SQLite Types**: ALWAYS cast SQLite `BIGINT` or `numeric` columns to JavaScript `Number()` when reading, or `BigInt()` if precision is critical (though `Number` is usually sufficient for display).
- **Graphviz**: We use `digraph` with `rankdir=TB`. Nodes are styled based on miner address hashes.
- **Testing**: Use `bun test`. Integration tests (`src/server/__tests__`) often create temporary SQLite databases to verify logic.

## Common Tasks

- **Adding a new metric**:
    1. Update the schema in `src/server/snapshot-store.ts`.
    2. Update aggregation logic in `src/server/miner-power-service.ts`.
    3. Update the frontend type definitions (`src/shared/miner-power.ts`) and UI components.
- **Debugging Snapshot Lag**: Check the console logs for `[snapshots]` or `[worker]` errors. Ensure `STACKS_DATA_DIR` is accessible.
