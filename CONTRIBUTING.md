# Contributing to stx.pub

Thanks for your interest in improving stx.pub! This document outlines how to set up the project locally, propose changes, and keep the codebase healthy.

## Getting Started

1. **Install Bun**  
   Ensure Bun `>= 1.1` is installed. See [bun.sh](https://bun.sh/) for instructions.

2. **Clone and install**  
   ```bash
   bun install
   ```

3. **Configure data directories**  
   Set `STACKS_DATA_DIR` to the folder that contains:
   - `burnchain/sortition/marf.sqlite`
   - `chainstate/vm/index.sqlite`

   Bun reads environment variables from your shell or a `.env` file automatically.

4. **Run the dev server**  
   ```bash
   STACKS_DATA_DIR=/path/to/stacks bun --hot src/index.tsx
   ```

   The server and snapshot worker share logs in the same process; watch `[worker]`, `[snapshots]`, and `[scheduler]` prefixes for background jobs.

## Development Workflow

- Keep shared types under `src/shared/`; server-only logic sits in `src/server/`; React pages live in `src/pages/`.
- Use Bun tools (`bun test`, `bun build`) instead of node-based equivalents.
- Add or update tests when changing data transforms, snapshot logic, or helper utilities. `bun test` should stay green.
- Run `bun test` after your changes:
  ```bash
  bun test
  ```

## Commit Guidelines

- Write concise commit messages in the imperative mood (`Add miner power pruning`).
- Group related changes together; avoid large omnibus commits if the work can be split logically.
- If your change impacts the snapshot worker or API responses, note it in the commit body so reviewers know to pay extra attention.

## Pull Requests

- Describe the motivation and summarize the changes.
- Include screenshots or console output if the change affects user-facing UI or background jobs.
- Confirm that `bun test` passes and mention any manual verification steps.
- If the change touches deployment or environment configuration, call that out explicitly.

## Reporting Issues

When filing an issue, include:

- The command you were running (`bun --hot src/index.tsx`, `/api` endpoint hit, etc.)
- Any relevant logs (especially `STACKS_DATA_DIR` warnings or `[snapshots]` errors)
- Steps to reproduce, along with the dataset you used (if possible)

## Code of Conduct

Be respectful, patient, and collaborative. We’re here to make Stacks data easier to explore—let’s keep the energy positive.

## Questions?

Open an issue or reach out via the repository discussions. Happy hacking!
