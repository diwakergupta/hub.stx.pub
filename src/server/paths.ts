import { join } from "path";

export const SORTITION_DB_RELATIVE = "burnchain/sortition/marf.sqlite";
export const CHAINSTATE_DB_RELATIVE = "chainstate/vm/index.sqlite";
export const HUB_DB_RELATIVE = "hub.sqlite";

export function getHubDbFilename(): string {
  return process.env.HUB_DB_FILENAME?.trim() || HUB_DB_RELATIVE;
}

export function getHubDbPath(dataDir: string): string {
  const customPath = process.env.HUB_DB_PATH?.trim();
  if (customPath) return customPath;
  return join(dataDir, getHubDbFilename());
}
