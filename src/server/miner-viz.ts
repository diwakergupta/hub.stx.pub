import { Database, type Statement } from "bun:sqlite";

import { CHAINSTATE_DB_RELATIVE, SORTITION_DB_RELATIVE } from "./paths";

export interface MinerVizSnapshot {
  generatedAt: string;
  bitcoinBlockHeight: number;
  sortitionId: string | null;
  d2Source: string;
}

export const MINER_VIZ_WINDOW = 20;

interface BlockCommitRow {
  burn_header_hash: string;
  txid: string;
  apparent_sender: string;
  sortition_id: string;
  vtxindex: number;
  block_height: number;
  burn_fee: number;
  parent_block_ptr: number;
  parent_vtxindex: number;
  memo: string | null;
}

interface SnapshotRow {
  winning_block_txid: string;
  canonical_stacks_tip_height: number;
  consensus_hash: string;
  sortition_id: string | null;
}

interface PaymentRow {
  block_hash: string | null;
  coinbase: number | null;
}

interface FeesRow {
  tenure_tx_fees: number | null;
}

interface BlockCommit {
  burnHeaderHash: string;
  txid: string;
  vtxindex: number;
  sender: string;
  burnBlockHeight: number;
  spend: number;
  sortitionId: string;
  parentBlockPtr: number;
  parentVtxindex: number;
  memo: string;
  parent: string;
  stacksHeight: number;
  blockHash: string;
  won: boolean;
  canonical: boolean;
  tip: boolean;
  coinbaseEarned: number;
  feesEarned: number;
  potentialTip: boolean;
  nextTip: boolean;
  key: string;
  parentKey: string;
}

interface BlockCommits {
  sortitionFeesMap: Map<string, number>;
  allCommits: Map<string, BlockCommit>;
  commitsByBlock: Map<number, BlockCommit[]>;
}

function makeHashKey(height: number, vtxindex: number): string {
  return `${height}:${vtxindex}`;
}

export function fetchCommitData(
  sortitionDb: Database,
  lowerBound: number,
  startBlock: number,
): BlockCommits {
  const sortitionFeesMap = new Map<string, number>();
  const allCommits = new Map<string, BlockCommit>();
  const commitsByBlock = new Map<number, BlockCommit[]>();
  const hashMap = new Map<string, string>();

  const stmt = sortitionDb.prepare<BlockCommitRow>(
    `SELECT
        burn_header_hash,
        txid,
        apparent_sender,
        sortition_id,
        vtxindex,
        block_height,
        burn_fee,
        parent_block_ptr,
        parent_vtxindex,
        memo
      FROM block_commits
      WHERE block_height BETWEEN ? AND ?
      ORDER BY block_height ASC`,
  );

  const rows = stmt.all(lowerBound, startBlock);
  for (const row of rows) {
    const commit: BlockCommit = {
      burnHeaderHash: row.burn_header_hash,
      txid: row.txid,
      vtxindex: row.vtxindex ?? 0,
      sender: row.apparent_sender ?? "",
      burnBlockHeight: row.block_height ?? 0,
      spend: Number(row.burn_fee) || 0,
      sortitionId: row.sortition_id ?? "",
      parentBlockPtr: row.parent_block_ptr ?? 0,
      parentVtxindex: row.parent_vtxindex ?? 0,
      memo: row.memo ?? "",
      parent: "",
      stacksHeight: 0,
      blockHash: "",
      won: false,
      canonical: false,
      tip: false,
      coinbaseEarned: 0,
      feesEarned: 0,
      potentialTip: false,
      nextTip: false,
      key: makeHashKey(row.block_height ?? 0, row.vtxindex ?? 0),
      parentKey: makeHashKey(
        row.parent_block_ptr ?? 0,
        row.parent_vtxindex ?? 0,
      ),
    };

    const parentTxid = hashMap.get(commit.parentKey);
    if (parentTxid) {
      commit.parent = parentTxid;
    }

    allCommits.set(commit.txid, commit);
    hashMap.set(commit.key, commit.txid);
  }

  // loop over all commits in allCommits
  for (const commit of allCommits.values()) {
    const bucket = commitsByBlock.get(commit.burnBlockHeight);
    if (bucket) {
      bucket.push(commit);
    } else {
      commitsByBlock.set(commit.burnBlockHeight, [commit]);
    }

    const totalSpend =
      (sortitionFeesMap.get(commit.sortitionId) ?? 0) + commit.spend;
    sortitionFeesMap.set(commit.sortitionId, totalSpend);
  }

  return {
    sortitionFeesMap,
    allCommits,
    commitsByBlock,
  };
}

function processWinningCommit(
  commit: BlockCommit,
  parentCommit: BlockCommit | undefined,
  stacksHeight: number,
  consensusHash: string,
  paymentStmt: Statement<PaymentRow>,
  feesStmt: Statement<FeesRow>,
) {
  commit.won = true;
  commit.potentialTip = true;
  commit.stacksHeight = stacksHeight;

  if (parentCommit) {
    parentCommit.potentialTip = false;
  }

  if (stacksHeight <= 0) {
    return;
  }

  const payment = paymentStmt.get(consensusHash);
  if (payment) {
    commit.blockHash = payment.block_hash ?? commit.blockHash;
    commit.coinbaseEarned = payment.coinbase ?? commit.coinbaseEarned;
  }

  const feesRow = feesStmt.get(commit.burnBlockHeight);
  if (feesRow?.tenure_tx_fees != null) {
    commit.feesEarned = feesRow.tenure_tx_fees;
  }
}

export function processWinningBlocks(
  sortitionDb: Database,
  chainstateDb: Database,
  lowerBound: number,
  startBlock: number,
  blockCommits: BlockCommits,
): SnapshotRow | undefined {
  const snapshotStmt = sortitionDb.prepare<SnapshotRow>(
    `SELECT winning_block_txid, canonical_stacks_tip_height, consensus_hash, sortition_id
      FROM snapshots
      WHERE block_height = ?`,
  );
  const paymentStmt = chainstateDb.prepare<PaymentRow>(
    "SELECT block_hash, coinbase FROM payments WHERE consensus_hash = ?",
  );
  const feesStmt = chainstateDb.prepare<FeesRow>(
    `SELECT tenure_tx_fees FROM nakamoto_block_headers
      WHERE burn_header_height = ?
      ORDER BY height_in_tenure DESC
      LIMIT 1`,
  );

  let latestSnapshot: SnapshotRow | undefined;

  for (let height = lowerBound; height <= startBlock; height += 1) {
    const commits = blockCommits.commitsByBlock.get(height);
    if (!commits || commits.length === 0) {
      continue;
    }

    const snapshot = snapshotStmt.get(height);
    if (!snapshot) {
      continue;
    }

    latestSnapshot = snapshot;

    for (const commit of commits) {
      commit.stacksHeight =
        snapshot.canonical_stacks_tip_height ?? commit.stacksHeight;
      const parentCommit = commit.parent
        ? blockCommits.allCommits.get(commit.parent)
        : undefined;
      if (commit.txid === snapshot.winning_block_txid) {
        processWinningCommit(
          commit,
          parentCommit,
          snapshot.canonical_stacks_tip_height,
          snapshot.consensus_hash,
          paymentStmt,
          feesStmt,
        );
      }
    }
  }

  return latestSnapshot;
}

export function processCanonicalTip(
  sortitionDb: Database,
  startBlock: number,
  commits: Map<string, BlockCommit>,
) {
  const canonicalStmt = sortitionDb.prepare<{ winning_block_txid: string }>(
    "SELECT winning_block_txid FROM snapshots WHERE block_height = ?",
  );
  const row = canonicalStmt.get(startBlock);
  if (!row?.winning_block_txid) {
    return;
  }

  let tipTxid = row.winning_block_txid;
  let isHead = true;
  while (tipTxid) {
    const commit = commits.get(tipTxid);
    if (!commit) {
      break;
    }
    if (isHead) {
      commit.tip = true;
      isHead = false;
    }
    commit.canonical = true;
    tipTxid = commit.parent;
  }
}

function normalizeSender(sender: string): string {
  return sender.replace(/"/g, "").slice(0, 8) || "unknown";
}

function stringToColor(input: string): string {
  const pastelColors = [
    "#E0BBE4",
    "#957DAD",
    "#D291BC",
    "#FEC8D8",
    "#FFDFD3",
    "#D9EEF5",
    "#B6E3F4",
    "#B5EAD7",
    "#C7F4F4",
    "#E8F3F8",
    "#F4F1BB",
    "#D4E09B",
    "#99C4C8",
    "#F2D0A9",
    "#E9D5DA",
    "#D8E2DC",
    "#FFE5D9",
    "#FFCAD4",
    "#F4ACB7",
    "#9D8189",
  ];

  const bytes = new TextEncoder().encode(input);
  if (bytes.length < 8) {
    return pastelColors[0];
  }
  let accumulator = 0n;
  for (let i = 0; i < 8; i += 1) {
    accumulator = (accumulator << 8n) | BigInt(bytes[i]);
  }
  const index = Number(accumulator % BigInt(pastelColors.length));
  return pastelColors[index];
}

function escapeD2String(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function buildNodeLabel(commit: BlockCommit): string {
  const memo = commit.memo ? `\nmemo: ${commit.memo}` : "";
  const parts = [
    `⛏️ ${normalizeSender(commit.sender)}`,
    `🔗 ${commit.stacksHeight}`,
    `💸 ${formatNumber(commit.spend / 1000)}K sats`,
  ];
  if (memo) {
    parts.push(memo.trimStart());
  }
  return escapeD2String(parts.join("\n"));
}

interface NodeAppearance {
  fill: string;
  classes: string[];
}

function makeNodeAppearance(commit: BlockCommit): NodeAppearance {
  const classes: string[] = ["CommitNode"];
  const shouldBeDashed = !commit.won && !commit.canonical;
  if (shouldBeDashed) {
    classes.push("CommitDashed");
  }
  if (commit.won) {
    classes.push("CommitWon");
  }
  if (commit.tip) {
    classes.push("CommitTip");
  }
  if (commit.nextTip) {
    classes.push("CommitNextTip");
  }

  return {
    classes,
    fill: stringToColor(commit.sender),
  };
}

interface EdgeAppearance {
  classes: string[];
}

function makeEdgeAppearance(
  commit: BlockCommit,
  parentCommit: BlockCommit,
  lastHeight: number,
): EdgeAppearance {
  const classes: string[] = ["CommitEdge"];
  if (lastHeight > 0 && parentCommit.burnBlockHeight !== lastHeight) {
    classes.push("CommitEdgeFork");
  }
  if (commit.canonical) {
    classes.push("CommitEdgeCanonical");
  }
  return { classes };
}

export const D2_CLASS_DEFINITIONS = `classes: {
CommitNode {
  style: {
    stroke: "#2D3748"
    stroke-width: 1
    font: mono
    font-size: 28
    bold: false
  }
}

CommitDashed {
  style: {
    stroke-dash: "3"
  }
}

CommitWon {
  style: {
    stroke: "#2B6CB0"
    stroke-width: 3
  }
}

CommitTip {
  style: {
    stroke-width: 4
  }
}

CommitNextTip {
  style: {
    stroke: "#38A169"
  }
}

CommitEdge {
  style: {
    stroke: "#4A5568"
    stroke-width: 1
  }
}

CommitEdgeFork {
  style: {
    stroke: "#E53E3E"
    stroke-width: 3
  }
}

CommitEdgeCanonical {
  style: {
    stroke: "#3182CE"
    stroke-width: 4
  }
}

BlockGroup {
  style: {
    fill: "#F7FAFC"
    stroke: "#CBD5E0"
  }
}
}`;

function formatClassList(classes: string[]): string {
  if (classes.length === 1) {
    return classes[0];
  }
  return `[${classes.join("; ")}]`;
}

export function applyD2ClassDefinitions(source: string): string {
  if (source.includes("classes")) {
    return source;
  }

  const normalized = source.replace(/\r\n/g, "\n");
  const [firstLine = "", ...rest] = normalized.split("\n");
  const classBlock = D2_CLASS_DEFINITIONS.trim();

  if (firstLine.startsWith("direction:")) {
    const body = rest.join("\n").trimStart();
    return `${firstLine}\n\n${classBlock}\n\n${body}`;
  }

  return `${classBlock}\n\n${normalized.trimStart()}`;
}

export function generateD2(
  lowerBound: number,
  startBlock: number,
  blockCommits: BlockCommits,
): string {
  const lines: string[] = ["direction: down", ""];
  const edgeLines: string[] = [];

  let lastHeight = 0;

  for (let height = lowerBound; height <= startBlock; height += 1) {
    const commits = blockCommits.commitsByBlock.get(height);
    if (!commits || commits.length === 0) {
      continue;
    }

    let sortitionSpend = 0;
    const nodeLines: string[] = [];

    for (const commit of commits) {
      if (sortitionSpend === 0) {
        sortitionSpend =
          blockCommits.sortitionFeesMap.get(commit.sortitionId) ?? 0;
      }

      const nodeAppearance = makeNodeAppearance(commit);
      const label = buildNodeLabel(commit);
      const nodeName = `commit_${commit.txid}`;
      const blockName = `block_${commit.burnBlockHeight}`;
      const link = commit.blockHash
        ? `https://explorer.hiro.so/block/0x${commit.blockHash}`
        : `https://mempool.space/tx/${commit.txid}`;

      nodeLines.push(`  ${nodeName}: {`);
      nodeLines.push(`    class: ${formatClassList(nodeAppearance.classes)}`);
      nodeLines.push(`    label: "${label}"`);
      nodeLines.push(`    link: "${link}"`);
      nodeLines.push(`    style: {`);
      nodeLines.push(`      fill: "${nodeAppearance.fill}"`);
      nodeLines.push(`    }`);
      nodeLines.push(`  }`);

      if (commit.parent) {
        const parentCommit = blockCommits.allCommits.get(commit.parent);
        if (parentCommit) {
          const edgeAppearance = makeEdgeAppearance(
            commit,
            parentCommit,
            lastHeight,
          );
          const source = `block_${parentCommit.burnBlockHeight}.commit_${parentCommit.txid}`;
          const target = `${blockName}.${nodeName}`;
          edgeLines.push(`${source} -> ${target}: {`);
          edgeLines.push(`  class: ${formatClassList(edgeAppearance.classes)}`);
          edgeLines.push(`}`);
        }
      }
    }

    const label = escapeD2String(
      `₿ ${height}\n💰 ${formatNumber(sortitionSpend / 1000)}K sats`,
    );

    lines.push(`block_${height}: {`);
    lines.push(`  class: BlockGroup`);
    lines.push(`  label: "${label}"`);
    lines.push(...nodeLines);
    lines.push(`}`);
    lines.push("");

    lastHeight = height;
  }

  return [...lines, ...edgeLines].join("\n");
}

export function computeMinerVizSnapshot(params: {
  sortitionDb: Database;
  chainstateDb: Database;
  lowerBound: number;
  startBlock: number;
  generatedAt?: string;
}): MinerVizSnapshot {
  const { sortitionDb, chainstateDb, lowerBound, startBlock, generatedAt } =
    params;

  const blockCommits = fetchCommitData(sortitionDb, lowerBound, startBlock);
  const latestSnapshot = processWinningBlocks(
    sortitionDb,
    chainstateDb,
    lowerBound,
    startBlock,
    blockCommits,
  );
  processCanonicalTip(sortitionDb, startBlock, blockCommits.allCommits);

  const d2Source = generateD2(lowerBound, startBlock, blockCommits);

  return {
    bitcoinBlockHeight: startBlock,
    generatedAt: generatedAt ?? new Date().toISOString(),
    sortitionId: latestSnapshot?.sortition_id ?? null,
    d2Source,
  };
}
