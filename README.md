# Stacks Hub (Bun + React + Chakra UI)

Stacks miner telemetry served by a Bun HTTP server with a snapshot worker that
hydrates a cached Hub SQLite database in the background.

## Prerequisites

- [Bun](https://bun.sh/) `>= 1.1`
- SQLite databases from a running Stacks node
  (`STACKS_DATA_DIR/burnchain/sortition/marf.sqlite`,
  `STACKS_DATA_DIR/chainstate/vm/index.sqlite`)

## Setup

```bash
bun install
```

Create a `.env` (or export in your shell) with `STACKS_DATA_DIR` pointing at the
directory that contains the chainstate and sortition SQLite files. Bun loads env
variables automatically.

## Development

```bash
STACKS_DATA_DIR=/path/to/stacks bun --hot src/index.tsx
```

The main process starts the HTTP server and spawns a worker that schedules a
snapshot check every minute (the first run happens immediately). Expensive
Stacks-node queries stay in this worker; miner page requests read the cached
`hub.sqlite` snapshot and do not trigger aggregation queries. Watch the
console for `[worker]`, `[snapshots]`, and `[scheduler]` logs to diagnose issues.

## Miner Power Window

Miner power covers the latest 1,008 canonical Bitcoin blocks, approximately
one week. Win rates use only successful sortitions in that period, while the UI
reports Bitcoin blocks without a sortition separately. Canonical ancestry is
derived from the PoX-valid sortition tip, so fork data is excluded from miner
power, winner classification, and recent-block statistics.

The worker caches Bitcoin-to-Stacks miner mappings. It rebuilds the map when
the canonical winning sortition changes and reuses it for no-sortition blocks.
Snapshots are finalized only after the latest winning miner payment is visible
in chainstate, which avoids caching partially synchronized rewards.

## Building / Production

```bash
bun build ./src/index.html --outdir=dist --sourcemap --target=browser --minify --define:process.env.NODE_ENV='\"production\"' --env='BUN_PUBLIC_*'
NODE_ENV=production STACKS_DATA_DIR=/path/to/stacks bun src/index.tsx
```

## Project Layout

See `docs/code-structure.md` for folder conventions and naming guidelines.
