# Code Structure

Guidelines for navigating and extending the project.

## Directories

- `src/server/` – Bun server entry point, API handlers, and data access.
- `src/shared/` – Types and utilities shared across server and client.
- `src/pages/` – Route-level React pages (each page owns its hooks/components).
- `src/components/ui/` – Reusable Chakra-powered primitives (provider, toaster, tooltip).
- `public/` – Static assets served verbatim (currently unused).

## Naming

- Prefer kebab-case for multi-word filenames (`miner-power-service.ts`).
- Mirror shared types with `*-types.ts` to avoid clashing with implementation files.
- Co-locate hooks/components with the page or feature that owns them.

## Data Flow

1. Snapshot worker writes miner data into `miner_snapshots` (see `src/server/snapshot-job.ts`).
2. API routes read cached data from `src/server/snapshot-store.ts`.
3. Frontend pages fetch via `/api/*` endpoints and render Chakra components.

Keep shared logic pure and unit-testable; reserve database access for server modules.
