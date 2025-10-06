# Implementation Plan

## Project Goals and Constraints
- Rebuild the legacy `codec`, `api`, and `web` projects as a single Bun-powered TypeScript application housed in this repository.
- Serve both API routes and the React + Chakra UI frontend from one `Bun.serve()` instance.
- Replace the ad-hoc Go transaction decoder with `@stacks/transactions` for parsing and inspecting Stacks transactions and Clarity values.
- Replace Graphviz diagrams with D2 diagrams rendered through `@terrastruct/d2`.
- Continue using SQLite for persistence, via Bun's built-in `bun:sqlite` driver.
- Preserve functional parity with the legacy system: scheduled data collection, miner power statistics, mempool analytics, transaction decoding endpoint, and the public dashboard views.

## TODO (Living List)
- [x] Establish Bun server entry that serves the home page route and static bundle.
- [x] Implement minimal data pipeline to read block commit data and serialize D2 source for the latest snapshot.
- [x] Expose D2 diagram source via API and render it client-side using @terrastruct/d2.
- [x] Build a basic React + Chakra UI home page that fetches the latest diagram and renders it via @terrastruct/d2 in the browser.
- [x] Wire the home page to call the new API endpoint and render loading/error states.
- [ ] Add instrumentation/tests necessary to validate the home page flow.

## Legacy System Summary
### `../codec` (Go library)
- Implements low-level binary decoders for Stacks transactions, Clarity values, and address formats (c32 conversion).
- Provides `Transaction.Decode` for parsing raw transaction bytes into structured Go types with nested payloads (token transfers, contract calls, etc.).
- Encodes address utilities (`ToStacks`) and Clarity decoding to support higher-level analytics in the API.

### `../api` (Go backend)
- Chi-based HTTP server exposing endpoints:
  - `GET /miners/viz` → latest diagram metadata and DOT string stored in `hub.sqlite`.
  - `GET /miners/power` → aggregated miner statistics for last 144 blocks.
  - `GET /mempool/stats` (unused by UI) and `GET /mempool/size` → mempool snapshots.
  - `GET /blocks` → recent block cost metrics.
  - `POST /tx/decode` → decodes hex transaction via `codec.Transaction`.
- Relies on a TOML config providing `DataDir` and optional `CMCKey`; `DataDir` hosts read-only SQLite dbs from a Stacks node (`burnchain/sortition/marf.sqlite`, `chainstate/vm/index.sqlite`, `chainstate/mempool.sqlite`) plus a writable/local `hub.sqlite` used for cached outputs.
- Background scheduler (`madflojo/tasks`) runs:
  - `dotsTask` every 2 minutes: reads sortition + chainstate DBs, constructs graph relationships, persists latest DOT graph to `hub.sqlite`.
  - `mempoolTask` every 2 minutes: scans node mempool table, decodes tx payloads via `codec`, builds histograms (fee/size/age) and counts of contract calls, stores JSON payload in `hub.sqlite`.
  - `cmcTask` every 15 minutes (optional): fetches STX price from CoinMarketCap and stores sats-per-STX in `hub.sqlite`.
  - `updateMinerAddressMapTask` every 30 minutes: joins chainstate + sortition DBs to map miner Stacks address → BTC address, cached in in-memory map.
  - `pruneTask` every 24 hours: removes cached rows older than 2 days and vacuums `hub.sqlite`.
- Reuses `codec` library to classify transactions (transfer vs contract call) and decode Clarity values when needed.

### `../web` (legacy frontend)
- Static HTML + Alpine.js + Bulma.
- Dashboard page fetches `/miners/viz` and `/miners/power`; uses `@hpcc-js/wasm` Graphviz to render DOT into SVG.
- Mempool page fetches `/mempool/popular` (legacy endpoint name) and `/mempool/size`; renders tables plus a Chart.js time-series chart.
- Hard-coded environment detection toggles between `http://localhost:8123` and production API domain.

## Target Architecture Overview
- **Runtime**: Single Bun process running TypeScript source (TSX for frontend). Use `Bun.serve()` for both API routes and static asset delivery, leveraging Bun's HTML imports bundler.
- **Directory structure (proposal)**:
  - `src/server/` → Bun server entry, route modules, request handlers.
  - `src/jobs/` → scheduled task implementations (diagram generation, mempool aggregation, STX price polling, pruning).
  - `src/data/` → data access layer wrapping `bun:sqlite` connections to external node databases and local cache DB; typed query helpers.
  - `src/diagrams/` → utilities to convert miner commit data into D2 definitions and helper functions/tests to validate them for client rendering.
  - `src/transactions/` → helpers built on `@stacks/transactions` for decoding and serializing tx payloads for API responses.
  - `src/frontend/` → React + Chakra UI components/pages, built with Bun bundler.
  - `src/shared/` → shared types/interfaces between server and frontend (e.g., API response DTOs).
  - `index.ts` → Bun entry orchestrating server + job scheduler + configuration loading.
  - `public/` → static assets (if needed), e.g., favicons, pre-rendered diagram images, etc.
- **Configuration**: JSON or TOML (or `.env` + `bun.env`) describing:
  - `DATA_DIR` path pointing at mounted Stacks node data directory.
  - Optional `CMC_API_KEY` for STX price.
  - Port, job intervals, feature toggles.
  - Path to writable cache DB (`hub.sqlite`).
- **Database connections**:
  - Use `bun:sqlite` prepared statements and connection pooling (Bun handles concurrency) for both read-only remote DBs and local cache DB. Ensure read-only connections to node DBs by opening with `mode=ro` query param.
  - Provide migration/bootstrap script to create cache tables (dots, mempool_stats, sats_per_stx) with updated schema to store D2 source text and metadata.
  - Preserve D2 strings only; clients will render diagrams on demand.
- **Job scheduling**: Implement scheduler (e.g., simple `setInterval` wrappers, or small scheduling utility that supports async jobs, logging, jitter, error handling). Persist job metadata to aid diagnostic logging.
- **D2 diagrams**:
  - Convert existing `generateGraph` logic to build an intermediate data model of block commits, then produce D2 syntax that replicates clusters, node styling, edges, and metadata (tips, canonical chain, spend).
  - Provide D2 source to clients and rely on browser-based `@terrastruct/d2` rendering at view time; persist only the source and metadata.
- **Frontend**:
  - React with Chakra UI components for layout, tables, charts.
  - Use React Query or lightweight fetch hooks for data retrieval from same origin (`/api/...`).
  - Provide two primary pages: Dashboard (miner power + diagram) and Mempool (stats, popular contracts, time-series chart). Consider React Router or server-driven HTML entries (two HTML files served via Bun routes) depending on bundling preference.
  - Replace Chart.js usage with Chakra-compatible charting (e.g., `react-chartjs-2`) or keep Chart.js if minimal overhead, bundling via ES module.
  - Ensure mobile-responsive layout using Chakra primitives.
- **API design**:
  - Mirror legacy endpoints for compatibility (`/api/miners/viz`, `/api/miners/power`, `/api/mempool/popular`, `/api/mempool/size`, `/api/blocks`, `/api/tx/decode`). Optionally introduce namespaced routes while keeping redirects.
  - Serve frontend under `/` with React root, plus `/mempool` route handled by frontend router.
- **Testing**:
  - Use `bun test` for unit/integration tests covering data access helpers, diagram generator, transaction decoder wrappers, and API handlers (with mocked SQLite).
  - Provide snapshot tests for D2 output to guard against regressions.

## Step-by-Step Implementation Plan
1. **Bootstrap & Dependencies**
   - Audit current `package.json`; add required dependencies: `@stacks/transactions`, `@terrastruct/d2`, `@chakra-ui/react`, `@emotion/react`, `@emotion/styled`, `framer-motion`, `sqlite`, charting libs, testing utilities.
   - Confirm Bun TypeScript config covers JSX/React; adjust `tsconfig.json` and `bunfig.toml` for JSX runtime.
   - Define environment variable schema (maybe `src/config.ts`) and load via Bun's `process.env`.

2. **Database Layer**
   - Implement `src/data/db.ts` to manage connections to:
     - External read-only DBs using absolute paths built from `DATA_DIR` + relative suffixes (`burnchain/sortition/marf.sqlite`, etc.).
     - Local cache DB with read-write connection, ensuring tables exist (migrations executed at startup).
   - Port SQL queries from Go into TypeScript using `bun:sqlite` prepared statements. Pay attention to column aliases, JSON fields, data conversions (Go's struct tags → TypeScript interfaces).
   - Create typed data mappers for Block commits, miner rewards, mempool txns, etc. Convert Go `sqlx` struct tags to manual binding logic.

3. **Stacks Transaction Utilities**
   - Implement helper functions using `@stacks/transactions` to:
     - Decode a hex transaction into an object similar to Go's `codec.Transaction` structure for API responses.
     - Extract payload type, contract call details, address conversions (Stacks principal to string) to replace `ToStacks()` and Clarity parsing.
     - Provide small wrappers for mempool classification (transfer vs contract call) and to compute display-ready values.
   - Validate parity against sample transactions from legacy tests (`codec/transaction_test.go`).

4. **Miner Address Mapping & Data Models**
   - Port `updateMinerAddressMapTask` query to TypeScript, caching map in-memory with concurrency-safe structure. Provide typed interface for miner data (address, BTC address, counts, fees, rewards, win rate).
   - Recreate `queryMinerPower` logic, ensuring integer math and float conversions (STX micro units → STX) remain correct.

5. **Diagram Pipeline Migration**
   - Translate the chain analysis workflow:
     - Implement functions for `fetchCommitData`, `processWinningBlocks`, `processCanonicalTip`, etc., producing a normalized graph representation.
     - Recreate logic to compute sortition spend, commit metadata, parent-child relationships.
   - Design a D2 template that emulates the old DOT styling (clusters per Bitcoin block, color-coded miners, annotated labels for spend/height). Note D2 uses different syntax (e.g., `group` for clusters). Document any styling differences acceptable.
   - Ensure D2 generation helpers produce clean source strings for client rendering; optionally validate syntax with `@terrastruct/d2` in tests but skip server-side SVG generation.
   - Update cache table schema to store `d2_source`, `bitcoin_block_height`, and timestamps (no SVG persistence).

6. **Mempool Analytics Pipeline**
   - Port mempool scan: query `chainstate/mempool.sqlite`, iterate rows, decode tx using `@stacks/transactions`, build histograms (choose JS histogram library or implement manual buckets replicating legacy behavior).
   - Recreate popular contract counts and categorize simple transfers.
   - Store aggregated JSON plus summary metrics in cache DB; include a trimmed list (max 25) as before.
   - Decide whether to pre-render histograms or compute on-demand; ensure API returns similar structure to avoid frontend rewrites.

7. **Additional Background Jobs**
   - Implement STX price polling (HTTP fetch with `fetch`), storing sats_per_stx.
   - Implement pruning job to delete cached rows older than retention window and vacuum DB. Ensure Bun's SQLite supports `VACUUM` outside transactions.
   - Provide startup bootstrap to run critical jobs once (diagram, miner map, mempool) before serving requests.
   - Add structured logging around job execution times and errors.

8. **API Layer**
   - Implement route handlers under `/api` prefix using Bun's router (or manual path matching) to serve data from cache DB and direct queries.
   - Ensure responses match legacy JSON shapes (field names and casing) or document any deliberate changes for frontend refactor.
   - Implement `POST /api/tx/decode` calling new transaction utilities, returning JSON comparable to Go version. Provide validation and error messages.
   - For `/api/miners/viz`, return metadata alongside D2 source; frontend handles rendering via `@terrastruct/d2`.
   - Add CORS configuration only if required (likely same-origin once frontend served by same Bun instance).

9. **Frontend Implementation**
   - Create `index.html` served by Bun with `<script type="module" src="./frontend/main.tsx">` entry.
   - Implement React app with Chakra UI theme provider.
   - Dashboard page: display miner power table (with BTC/STX links), render diagram client-side using `@terrastruct/d2` from D2 source, show diagram metadata.
   - Mempool page: fetch aggregated stats, render table of popular contracts (linked to explorer), chart mempool size using Chart.js or alternative (wrap with Chakra cards).
   - Implement navigation header, responsive layout, and share components for data loading states/errors.
   - Configure fetch base URL relative to same origin (no hard-coded production domain).

10. **Testing & Validation**
    - Port sample transactions from Go tests to TypeScript tests to validate `@stacks/transactions` decoding outputs.
    - Add unit tests for SQL query functions using in-memory SQLite fixtures or temporary DBs.
    - Snapshot test D2 diagram generation for representative datasets to detect structural regressions.
    - Integration tests hitting `/api/...` routes with mocked DB connections.
    - Frontend component tests (optional) for key views using testing library and Chakra's providers.

11. **Operational Considerations**
    - Document environment setup, including dependency on live Stacks node databases (read-only) and required file layout under `DATA_DIR`.
    - Provide scripts (e.g., `bun run dev`, `bun run jobs`) for development workflows.
    - Define logging strategy and consider exposing simple health endpoint.
    - Plan deployment instructions (systemd, Docker, etc.) once code is ready.

## Additional Context & Open Questions
- Confirm access pattern to Stacks node databases; ensure Bun process has read permissions and handles long-running reads without locking issues.
- Validate `@terrastruct/d2` compatibility with Bun + browser-based rendering pipeline; confirm bundler can deliver required assets for client-side rendering.
- Decide whether to maintain `hub.sqlite` schema backwards compatibility or introduce new schema with migration script. Document mapping for downstream consumers (if any).
- Determine whether to keep `/blocks` endpoint and corresponding frontend view (currently unused) or phase it out.
- Consider caching layer or rate limiting for expensive endpoints if traffic grows.
- Evaluate whether to introduce typed API contracts (e.g., zod schemas) for runtime validation.

## Ready-To-Start Checklist
- [ ] Finalize dependency list and confirm packages install under Bun without Node polyfills.
- [ ] Draft configuration file format and default `.env.example`.
- [ ] Sketch D2 diagram styling conventions to match legacy appearance.
- [ ] Identify fixtures/sample data for testing (transactions, mempool rows, block commits).
- [ ] Decide on job scheduling utility (custom vs third-party) compatible with Bun.
- [ ] Align on frontend routing approach (single-page app vs multi-entry HTML).

