import { Database, type Statement } from "bun:sqlite";
import { join } from "path";

import { getStacksDataDir } from "./env";

export interface MinerVizSnapshot {
  bitcoinBlockHeight: number;
  generatedAt: string;
  d2Source: string;
  isSample: boolean;
  description: string;
}

const BLOCK_WINDOW = 20;
const SORTITION_DB_RELATIVE = "burnchain/sortition/marf.sqlite";
const CHAINSTATE_DB_RELATIVE = "chainstate/vm/index.sqlite";
const HUB_DB_RELATIVE = "hub.sqlite";

const SAMPLE_D2 = `direction: right

block_sample_1: {
  label: "Bitcoin Block 808900"
  shape: container
  commit_alpha: {
    label: "⛏️ Miner Alpha\n🔗 123\n💸 420K sats\nmemo: sample"
    style: {
      fill: "#E0BBE4"
      stroke: "#2B6CB0"
      stroke-width: 3
    }
  }
  commit_beta: {
    label: "⛏️ Miner Beta\n🔗 122\n💸 210K sats\nmemo: sample"
    style: {
      fill: "#B6E3F4"
      stroke: "#2D3748"
      stroke-width: 1.5
      stroke-dash: "6 4"
    }
  }
}

block_sample_2: {
  label: "Bitcoin Block 808901"
  shape: container
  commit_gamma: {
    label: "⛏️ Miner Gamma\n🔗 124\n💸 380K sats\nmemo: sample"
    style: {
      fill: "#F4ACB7"
      stroke: "#2B6CB0"
      stroke-width: 3
    }
  }
}

block_sample_1.commit_beta -> block_sample_2.commit_gamma: {
  style: {
    stroke: "#E53E3E"
    stroke-width: 3
  }
}

block_sample_1.commit_alpha -> block_sample_2.commit_gamma: {
  style: {
    stroke: "#3182CE"
    stroke-width: 4
  }
}
`;

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

function sampleSnapshot(): MinerVizSnapshot {
  return {
    bitcoinBlockHeight: 808_901,
    generatedAt: new Date().toISOString(),
    d2Source: SAMPLE_D2,
    isSample: true,
    description:
      "Sample visualization showing two consecutive Bitcoin blocks and their associated Stacks miner commits.",
  };
}

function ensureReadOnlyDatabase(path: string): Database {
  return new Database(path, {
    readonly: true,
    strict: true,
  });
}

function ensureHubDatabase(path: string): Database {
  const db = new Database(path, {
    create: true,
    readwrite: true,
  });
  db.exec(`CREATE TABLE IF NOT EXISTS dots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    bitcoin_block_height INTEGER,
    dot TEXT NOT NULL
  )`);
  return db;
}

function getBlockRange(
  db: Database,
  numBlocks: number,
): { start: number; lowerBound: number } {
  const stmt = db.prepare<{ maxHeight: number | null }>(
    "SELECT MAX(block_height) as maxHeight FROM block_commits",
  );
  const row = stmt.get();
  const start = row?.maxHeight ?? 0;
  return { start, lowerBound: start - numBlocks };
}

function makeHashKey(height: number, vtxindex: number): string {
  return `${height}:${vtxindex}`;
}

function fetchCommitData(
  db: Database,
  lowerBound: number,
  startBlock: number,
): BlockCommits {
  const sortitionFeesMap = new Map<string, number>();
  const allCommits = new Map<string, BlockCommit>();
  const commitsByBlock = new Map<number, BlockCommit[]>();
  const hashMap = new Map<string, string>();

  const stmt = db.prepare<BlockCommitRow>(
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
      spend: row.burn_fee ?? 0,
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

function processWinningBlocks(
  sortitionDb: Database,
  chainstateDb: Database,
  lowerBound: number,
  startBlock: number,
  blockCommits: BlockCommits,
) {
  const snapshotStmt = sortitionDb.prepare<SnapshotRow>(
    `SELECT winning_block_txid, canonical_stacks_tip_height, consensus_hash
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

  for (let height = lowerBound; height <= startBlock; height += 1) {
    const commits = blockCommits.commitsByBlock.get(height);
    if (!commits || commits.length === 0) {
      continue;
    }

    const snapshot = snapshotStmt.get(height);
    if (!snapshot) {
      continue;
    }

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
}

function processCanonicalTip(
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

interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDash?: string;
}

function makeNodeStyle(commit: BlockCommit): NodeStyle {
  const style: NodeStyle = {
    fill: stringToColor(commit.sender),
    stroke: "#2D3748",
    strokeWidth: 1,
  };

  if (commit.won) {
    style.stroke = "#2B6CB0";
    style.strokeWidth = 2;
  }

  if (commit.tip) {
    style.strokeWidth = Math.max(style.strokeWidth, 4);
  }

  if (commit.canonical) {
    style.strokeDash = undefined;
  }

  if (commit.nextTip) {
    style.stroke = "#38A169";
  }

  return style;
}

interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDash?: string;
}

function makeEdgeStyle(
  commit: BlockCommit,
  parentCommit: BlockCommit,
  lastHeight: number,
): EdgeStyle {
  const style: EdgeStyle = {
    stroke: "#4A5568",
    strokeWidth: 1,
    strokeDash: undefined,
  };

  if (lastHeight > 0 && parentCommit.burnBlockHeight !== lastHeight) {
    style.stroke = "#E53E3E";
    style.strokeWidth = 3;
  }

  if (commit.canonical) {
    style.stroke = "#3182CE";
    style.strokeWidth = 4;
    style.strokeDash = undefined;
  }

  return style;
}

function generateD2(
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

      const nodeStyle = makeNodeStyle(commit);
      const label = buildNodeLabel(commit);
      const nodeName = `commit_${commit.txid}`;
      const blockName = `block_${commit.burnBlockHeight}`;
      const link = commit.blockHash
        ? `https://explorer.hiro.so/block/0x${commit.blockHash}`
        : `https://mempool.space/tx/${commit.txid}`;

      nodeLines.push(`  ${nodeName}: {`);
      nodeLines.push(`    label: "${label}"`);
      nodeLines.push(`    link: "${link}"`);
      nodeLines.push(`    style: {`);
      nodeLines.push(`      fill: "${nodeStyle.fill}"`);
      nodeLines.push(`      stroke: "${nodeStyle.stroke}"`);
      nodeLines.push(`      stroke-width: ${nodeStyle.strokeWidth}`);
      if (nodeStyle.strokeDash) {
        nodeLines.push(`      stroke-dash: "${nodeStyle.strokeDash}"`);
      }
      nodeLines.push(`    }`);
      nodeLines.push(`  }`);

      if (commit.parent) {
        const parentCommit = blockCommits.allCommits.get(commit.parent);
        if (parentCommit) {
          const edgeStyle = makeEdgeStyle(commit, parentCommit, lastHeight);
          const source = `block_${parentCommit.burnBlockHeight}.commit_${parentCommit.txid}`;
          const target = `${blockName}.${nodeName}`;
          edgeLines.push(`${source} -> ${target}: {`);
          edgeLines.push(`  style: {`);
          edgeLines.push(`    stroke: "${edgeStyle.stroke}"`);
          edgeLines.push(`    stroke-width: ${edgeStyle.strokeWidth}`);
          if (edgeStyle.strokeDash) {
            edgeLines.push(`    stroke-dash: "${edgeStyle.strokeDash}"`);
          }
          edgeLines.push(`  }`);
          edgeLines.push(`}`);
        }
      }
    }

    const label = escapeD2String(
      `Bitcoin Block ${height}\n💰 ${formatNumber(sortitionSpend / 1000)}K sats`,
    );

    lines.push(`block_${height}: {`);
    lines.push(`  label: "${label}"`);
    lines.push(`  style: {`);
    lines.push(`    fill: "#F7FAFC"`);
    lines.push(`    stroke: "#CBD5E0"`);
    lines.push(`  }`);
    lines.push(...nodeLines);
    lines.push(`}`);
    lines.push("");

    lastHeight = height;
  }

  return [...lines, ...edgeLines].join("\n");
}

function createSnapshot(
  d2: string,
  bitcoinBlockHeight: number,
  isSample: boolean,
): MinerVizSnapshot {
  return {
    bitcoinBlockHeight,
    generatedAt: new Date().toISOString(),
    d2Source: d2,
    isSample,
    description: `Stacks miner commits across the last ${BLOCK_WINDOW} Bitcoin blocks (computed via Bun).`,
  };
}

export function runMinerVizTask(): MinerVizSnapshot {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    return sampleSnapshot();
  }

  const sortitionPath = join(dataDir, SORTITION_DB_RELATIVE);
  const chainstatePath = join(dataDir, CHAINSTATE_DB_RELATIVE);
  const hubPath = join(dataDir, HUB_DB_RELATIVE);

  let sortitionDb: Database | undefined;
  let chainstateDb: Database | undefined;
  let hubDb: Database | undefined;

  try {
    sortitionDb = ensureReadOnlyDatabase(sortitionPath);
    chainstateDb = ensureReadOnlyDatabase(chainstatePath);

    sortitionDb.exec("PRAGMA query_only = true");
    chainstateDb.exec("PRAGMA query_only = true");

    const { start, lowerBound } = getBlockRange(sortitionDb, BLOCK_WINDOW);
    if (start === 0) {
      return sampleSnapshot();
    }

    const blockCommits = fetchCommitData(sortitionDb, lowerBound, start);
    processWinningBlocks(
      sortitionDb,
      chainstateDb,
      lowerBound,
      start,
      blockCommits,
    );
    processCanonicalTip(sortitionDb, start, blockCommits.allCommits);

    const d2 = generateD2(lowerBound, start, blockCommits);
    console.log(d2);
    const snapshot = createSnapshot(d2, start, false);

    hubDb = ensureHubDatabase(hubPath);
    const insertStmt = hubDb.prepare(
      "INSERT INTO dots (bitcoin_block_height, dot) VALUES (?, ?)",
    );
    insertStmt.run(start, d2);

    return snapshot;
  } catch (error) {
    console.warn(
      "Failed to generate miner visualization; serving sample data",
      error,
    );
    return sampleSnapshot();
  } finally {
    sortitionDb?.close();
    chainstateDb?.close();
    hubDb?.close();
  }
}

export function getLatestMinerViz(): MinerVizSnapshot {
  const dataDir = getStacksDataDir();
  if (!dataDir) {
    return sampleSnapshot();
  }

  const hubPath = join(dataDir, HUB_DB_RELATIVE);
  let hubDb: Database | undefined;

  try {
    hubDb = new Database(hubPath, {
      readonly: true,
      strict: true,
    });
    hubDb.exec("PRAGMA query_only = true");

    const row = hubDb
      .prepare<{
        generatedAt: string;
        bitcoinBlockHeight: number;
        dot: string;
      }>(
        `SELECT timestamp AS generatedAt, bitcoin_block_height AS bitcoinBlockHeight, dot
         FROM dots
         ORDER BY timestamp DESC
         LIMIT 1`,
      )
      .get();

    if (row && row.dot) {
      return {
        bitcoinBlockHeight: row.bitcoinBlockHeight ?? 0,
        generatedAt: row.generatedAt ?? new Date().toISOString(),
        d2Source: row.dot,
        isSample: false,
        description: `Stacks miner commits across the last ${BLOCK_WINDOW} Bitcoin blocks (cached snapshot).`,
      };
    }

    return runMinerVizTask();
  } catch (error) {
    console.warn(
      "Unable to load cached miner visualization; regenerating",
      error,
    );
    return runMinerVizTask();
  } finally {
    hubDb?.close();
  }
}
