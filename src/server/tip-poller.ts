import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join } from "path";

import type { StacksTipTelemetry } from "@/shared/stacks-tip";
import { getStacksDataDir, getStacksNodeRpcUrl } from "./env";
import { logger } from "./logger";
import { CHAINSTATE_DB_RELATIVE } from "./paths";

interface NakamotoTipRow {
  block_height: number;
  block_hash: string;
  timestamp: number;
  block_size: string | number;
  height_in_tenure: number;
  burn_header_height: number;
  tx_count: number;
}

interface StacksNodeV2Info {
  stacks_tip_height: number;
  stacks_tip: string;
  stacks_tip_consensus_hash: string;
  tenure_height: number;
  burn_block_height: number;
}

let cachedTip: StacksTipTelemetry | null = null;
let pollTimeoutId: Timer | null = null;
let isPolling = false;
let isStopped = false;

export function getCachedStacksTip(): StacksTipTelemetry | null {
  return cachedTip;
}

export function setCachedStacksTipForTest(tip: StacksTipTelemetry | null) {
  cachedTip = tip;
}

export async function fetchStacksNodeInfo(
  rpcUrl: string,
): Promise<StacksNodeV2Info | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${rpcUrl}/v2/info`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn(
        { status: res.status, statusText: res.statusText },
        "tip-poller.rpc-info.bad-status",
      );
      return null;
    }

    const data = (await res.json()) as StacksNodeV2Info;
    return data;
  } catch (error) {
    logger.debug({ err: error }, "tip-poller.rpc-info.failed");
    return null;
  }
}

export function queryBlockStatsFromDb(
  dataDir: string,
  consensusHash: string,
  blockHash: string,
): {
  timestamp: number;
  blockSize: number;
  txCount: number;
  heightInTenure: number;
  burnHeaderHeight: number;
} | null {
  const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);
  if (!existsSync(chainstatePath)) {
    return null;
  }

  let db: Database | null = null;

  try {
    db = new Database(chainstatePath, { readonly: true });
    db.exec("PRAGMA query_only = true");
    db.exec("PRAGMA temp_store = MEMORY");

    const stmt = db.prepare<NakamotoTipRow>(`
      SELECT 
        h.block_height, 
        h.block_hash, 
        h.timestamp, 
        h.block_size, 
        h.height_in_tenure, 
        h.burn_header_height, 
        count(t.id) as tx_count 
      FROM nakamoto_block_headers h 
      LEFT JOIN transactions t ON t.index_block_hash = h.index_block_hash 
      WHERE h.consensus_hash = ? AND h.block_hash = ? 
      GROUP BY h.block_hash
      LIMIT 1;
    `);

    const row = stmt.get(consensusHash, blockHash);
    if (!row) return null;

    return {
      timestamp: Number(row.timestamp ?? 0),
      blockSize: Number(row.block_size ?? 0),
      txCount: Number(row.tx_count ?? 0),
      heightInTenure: Number(row.height_in_tenure ?? 0),
      burnHeaderHeight: Number(row.burn_header_height ?? 0),
    };
  } catch (error) {
    logger.warn({ err: error }, "tip-poller.db-query.failed");
    return null;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore close error
      }
    }
  }
}

export async function checkTipUpdate(params?: {
  dataDir?: string;
  rpcUrl?: string;
  onTip?: (tip: StacksTipTelemetry) => void;
}): Promise<StacksTipTelemetry | null> {
  const dataDir = params?.dataDir ?? getStacksDataDir();
  const rpcUrl = params?.rpcUrl ?? getStacksNodeRpcUrl();

  const info = await fetchStacksNodeInfo(rpcUrl);
  if (!info || !info.stacks_tip || !info.stacks_tip_consensus_hash) {
    return cachedTip;
  }

  // If the tip hasn't changed, return cached
  if (cachedTip && cachedTip.blockHash === info.stacks_tip) {
    return cachedTip;
  }

  let dbStats: ReturnType<typeof queryBlockStatsFromDb> = null;
  if (dataDir) {
    const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);
    const dbExists = existsSync(chainstatePath);

    if (dbExists) {
      dbStats = queryBlockStatsFromDb(
        dataDir,
        info.stacks_tip_consensus_hash,
        info.stacks_tip,
      );

      // If block just arrived at RPC, wait 120ms and retry DB once
      if (!dbStats) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        dbStats = queryBlockStatsFromDb(
          dataDir,
          info.stacks_tip_consensus_hash,
          info.stacks_tip,
        );
      }
    }
  }

  const nowMs = Date.now();
  const blockTimeMs = (dbStats?.timestamp || 0) * 1000;
  // If cold-starting on a historical block that was mined >30s ago, preserve historical age
  const isHistoricalColdStart = !cachedTip && blockTimeMs > 0 && (nowMs - blockTimeMs > 30_000);
  const receivedAt = isHistoricalColdStart ? blockTimeMs : nowMs;

  const tipData: StacksTipTelemetry = {
    blockHeight: info.stacks_tip_height,
    blockHash: info.stacks_tip,
    consensusHash: info.stacks_tip_consensus_hash,
    timestamp: dbStats?.timestamp || Math.floor(nowMs / 1000),
    blockSize: dbStats?.blockSize || 0,
    txCount: dbStats?.txCount || 0,
    heightInTenure: dbStats?.heightInTenure || 0,
    burnBlockHeight: dbStats?.burnHeaderHeight || info.burn_block_height,
    tenureHeight: info.tenure_height,
    receivedAt,
  };

  cachedTip = tipData;
  if (params?.onTip) {
    params.onTip(tipData);
  }

  return tipData;
}

export function startTipPoller(options?: {
  dataDir?: string;
  rpcUrl?: string;
  intervalMs?: number;
  onTip?: (tip: StacksTipTelemetry) => void;
}) {
  const intervalMs = options?.intervalMs ?? 5000;
  isStopped = false;

  const runTick = async () => {
    if (isStopped || isPolling) return;
    isPolling = true;

    try {
      await checkTipUpdate(options);
    } catch (err) {
      logger.debug({ err }, "tip-poller.tick.error");
    } finally {
      isPolling = false;
      if (!isStopped) {
        pollTimeoutId = setTimeout(runTick, intervalMs);
      }
    }
  };

  // Run first check immediately
  void runTick();

  return {
    stop: stopTipPoller,
  };
}

export function stopTipPoller() {
  isStopped = true;
  if (pollTimeoutId) {
    clearTimeout(pollTimeoutId);
    pollTimeoutId = null;
  }
}
