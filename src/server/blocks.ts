import { Database } from "bun:sqlite";
import { join } from "path";

import type { BlockSample, CostVector } from "@/shared/blocks";
import { CHAINSTATE_DB_RELATIVE } from "./paths";

interface BlockRow {
  block_size: number | null;
  cost: string | null;
  total_tenure_cost: string | null;
  tenure_changed: number | null;
  tenure_tx_fees: number | null;
  block_height: number | null;
  burn_header_height: number | null;
  timestamp: number | null;
}

function parseCostVector(raw: string | null): CostVector {
  if (!raw) {
    return {
      readLength: 0,
      readCount: 0,
      writeLength: 0,
      writeCount: 0,
      runtime: 0,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CostVector>;
    return {
      readLength: Number(parsed.readLength ?? parsed.read_length ?? 0),
      readCount: Number(parsed.readCount ?? parsed.read_count ?? 0),
      writeLength: Number(parsed.writeLength ?? parsed.write_length ?? 0),
      writeCount: Number(parsed.writeCount ?? parsed.write_count ?? 0),
      runtime: Number(parsed.runtime ?? 0),
    };
  } catch (error) {
    console.warn("[blocks] Failed to parse cost vector", error);
    return {
      readLength: 0,
      readCount: 0,
      writeLength: 0,
      writeCount: 0,
      runtime: 0,
    };
  }
}

export function fetchRecentBlocks(params: {
  dataDir: string;
  windowSize?: number;
}): BlockSample[] {
  const { dataDir, windowSize = 120 } = params;
  const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);
  const db = new Database(chainstatePath, { readonly: true });

  try {
    const maxRow = db
      .prepare<{ max_height: number | null }>(
        "SELECT MAX(burn_header_height) AS max_height FROM nakamoto_block_headers",
      )
      .get();

    const maxHeight = maxRow?.max_height ?? null;
    if (!maxHeight || Number.isNaN(maxHeight)) {
      return [];
    }

    const lowerBound = Math.max(0, maxHeight - windowSize);

    const stmt = db.prepare<BlockRow>(
      `SELECT
          block_size,
          cost,
          total_tenure_cost,
          tenure_changed,
          tenure_tx_fees,
          block_height,
          burn_header_height,
          timestamp
        FROM nakamoto_block_headers
        WHERE burn_header_height > ?
        ORDER BY block_height ASC`,
    );

    const rows = stmt.all(lowerBound);
    return rows.map<BlockSample>((row) => ({
      blockSize: Number(row.block_size ?? 0),
      cost: parseCostVector(row.cost),
      tenureCost: parseCostVector(row.total_tenure_cost),
      tenureChanged: (row.tenure_changed ?? 0) === 1,
      tenureTxFees: Number(row.tenure_tx_fees ?? 0),
      blockHeight: Number(row.block_height ?? 0),
      burnHeaderHeight: Number(row.burn_header_height ?? 0),
      timestamp: Number(row.timestamp ?? 0),
    }));
  } finally {
    db.close();
  }
}
