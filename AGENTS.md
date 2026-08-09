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

- **Worker (`snapshot-worker.ts`)**: Checks for a new canonical snapshot every minute. It reads from the raw Stacks DBs (`chainstate`, `sortition`) and aggregates data into a "Hub DB" (`hub.sqlite`). Expensive aggregation stays in this background worker; miner API requests serve cached Hub DB data.
- **Jobs (`snapshot-job.ts`)**: Contains the core logic for generating snapshots. Includes retry logic for resilience.
- **Services**:
    - `canonical-sortitions.ts`: Selects the PoX-valid canonical tip and walks `parent_sortition_id` ancestry. Reuse it instead of selecting snapshots by height alone.
    - `miner-power-service.ts`: Aggregates approximately one week (1,008 canonical Bitcoin blocks) of miner win rates, BTC spend, STX earnings, and no-sortition coverage.
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
- **Canonical Data**: `snapshots` and Nakamoto header tables can contain forks. Start from the PoX-valid canonical tip (`ORDER BY block_height DESC, burn_header_hash ASC`) and walk ancestry; never assume `MAX(block_height)` or an unqualified height lookup is canonical.
- **Miner Windows**: Miner shares use successful sortitions as their denominator. Time coverage uses 1,008 canonical Bitcoin blocks, and `sortition = 0` blocks are reported separately rather than represented as a miner.
- **Address Mapping Cache**: Refresh BTC-to-STX mappings when the canonical winning sortition ID changes. Reuse cached mappings for no-sortition blocks so page loads and background refreshes remain inexpensive.
- **Snapshot Compatibility**: Increment `MINER_POWER_FORMAT_VERSION` when changing persisted miner-power JSON semantics. Page requests must continue serving `hub.sqlite`; do not move raw Stacks queries into miner request handlers.
- **SQLite Types**: ALWAYS cast SQLite `BIGINT` or `numeric` columns to JavaScript `Number()` when reading, or `BigInt()` if precision is critical (though `Number` is usually sufficient for display).
- **Graphviz**: We use `digraph` with `rankdir=TB`. Nodes are styled based on miner address hashes.
- **Testing**: Use `bun test`. Integration tests (`src/server/__tests__`) often create temporary SQLite databases to verify logic.

## Common Tasks

- **Adding a new metric**:
    1. Update the schema in `src/server/snapshot-store.ts`.
    2. Update aggregation logic in `src/server/miner-power-service.ts`.
    3. Update the frontend type definitions (`src/shared/miner-power.ts`) and UI components.
- **Debugging Snapshot Lag**: Check the console logs for `[snapshots]` or `[worker]` errors. Ensure `STACKS_DATA_DIR` is accessible.
  - `snapshots.waiting-for-chainstate` means the canonical winner is known but its miner payment has not reached `index.sqlite` yet.
