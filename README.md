# Stacks Hub (Bun + React + Chakra UI)

Stacks miner telemetry served by a Bun HTTP server with a snapshot worker that
hydrates cached SQLite tables every few minutes.

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
snapshot run every four minutes (first run happens immediately). Watch the
console for `[worker]`, `[snapshots]`, and `[scheduler]` logs to diagnose issues.

## Building / Production

```bash
bun build ./src/index.html --outdir=dist --sourcemap --target=browser --minify --define:process.env.NODE_ENV='\"production\"' --env='BUN_PUBLIC_*'
NODE_ENV=production STACKS_DATA_DIR=/path/to/stacks bun src/index.tsx
```

## Project Layout

See `docs/code-structure.md` for folder conventions and naming guidelines.
