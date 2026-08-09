import { Database } from "bun:sqlite";
import { join } from "path";

import type { BlockSample, CostVector } from "@/shared/blocks";
import { logger } from "./logger";
import { CHAINSTATE_DB_RELATIVE, SORTITION_DB_RELATIVE } from "./paths";

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

export function parseCostVector(raw: string | null): CostVector {
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
    logger.warn({ err: error }, "blocks.cost-vector.parse-failed");
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
  const sortitionPath = join(dataDir, SORTITION_DB_RELATIVE);
  const db = new Database(chainstatePath, { readonly: true });

  try {
    db.exec(
      `ATTACH DATABASE '${sortitionPath.replaceAll("'", "''")}' AS sortition`,
    );
    const maxRow = db
      .prepare<{ max_height: number | null }>(
        `SELECT block_height AS max_height
         FROM sortition.snapshots
         WHERE pox_valid = 1
         ORDER BY block_height DESC, burn_header_hash ASC
         LIMIT 1`,
      )
      .get();

    const maxHeight = maxRow?.max_height ?? null;
    if (!maxHeight || Number.isNaN(maxHeight)) {
      return [];
    }

    const lowerBound = Math.max(0, maxHeight - windowSize);

    const stmt = db.prepare<BlockRow>(
      `WITH RECURSIVE canonical_headers AS (
         SELECT headers.*
         FROM nakamoto_block_headers AS headers
         JOIN (
           SELECT canonical_stacks_tip_hash, canonical_stacks_tip_consensus_hash
           FROM sortition.snapshots
           WHERE pox_valid = 1
           ORDER BY block_height DESC, burn_header_hash ASC
           LIMIT 1
         ) AS tip
           ON headers.block_hash = tip.canonical_stacks_tip_hash
          AND headers.consensus_hash = tip.canonical_stacks_tip_consensus_hash
         UNION ALL
         SELECT parent.*
         FROM nakamoto_block_headers AS parent
         JOIN canonical_headers AS child
           ON parent.index_block_hash = child.parent_block_id
         WHERE parent.burn_header_height > ?
       )
       SELECT
          block_size,
          cost,
          total_tenure_cost,
          tenure_changed,
          tenure_tx_fees,
          block_height,
          burn_header_height,
          timestamp
        FROM canonical_headers
        WHERE burn_header_height > ?
        ORDER BY block_height ASC`,
    );

    const rows = stmt.all(lowerBound, lowerBound);
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
