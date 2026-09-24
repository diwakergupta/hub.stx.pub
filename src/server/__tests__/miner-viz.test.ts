import { expect, test } from "bun:test";
import { generateDot, generateGraph, parseDotToGraph } from "@/server/miner-viz";

test("generateDot produces valid DOT structure", () => {
  const emptyCommits = {
    sortitionFeesMap: new Map(),
    allCommits: new Map(),
    commitsByBlock: new Map(),
  };

  const dot = generateDot(100, 110, emptyCommits);

  expect(dot).toContain("digraph G {");
  expect(dot).toContain("graph [rankdir=TB, fontname=monospace];");
  expect(dot).toContain("}");
});

test("generateGraph produces structured blocks and edges", () => {
  const commit1 = {
    burnHeaderHash: "hash1",
    txid: "tx1",
    vtxindex: 0,
    sender: "bc1qtest1",
    burnBlockHeight: 100,
    spend: 50000,
    sortitionId: "sort1",
    parentBlockPtr: 0,
    parentVtxindex: 0,
    memo: "memo1",
    parent: "",
    stacksHeight: 10,
    blockHash: "blockhash1",
    won: true,
    canonical: true,
    tip: true,
    coinbaseEarned: 1000,
    feesEarned: 50,
    potentialTip: true,
    nextTip: false,
    key: "100:0",
    parentKey: "0:0",
  };

  const commit2 = {
    burnHeaderHash: "hash2",
    txid: "tx2",
    vtxindex: 0,
    sender: "bc1qtest2",
    burnBlockHeight: 101,
    spend: 60000,
    sortitionId: "sort2",
    parentBlockPtr: 100,
    parentVtxindex: 0,
    memo: "",
    parent: "tx1",
    stacksHeight: 11,
    blockHash: "blockhash2",
    won: true,
    canonical: true,
    tip: true,
    coinbaseEarned: 1000,
    feesEarned: 60,
    potentialTip: true,
    nextTip: false,
    key: "101:0",
    parentKey: "100:0",
  };

  const commits = {
    sortitionFeesMap: new Map([
      ["sort1", 50000],
      ["sort2", 60000],
    ]),
    allCommits: new Map([
      ["tx1", commit1],
      ["tx2", commit2],
    ]),
    commitsByBlock: new Map([
      [100, [commit1]],
      [101, [commit2]],
    ]),
  };

  const graph = generateGraph(100, 101, commits);

  expect(graph.blocks.length).toBe(2);
  expect(graph.blocks[0].height).toBe(100);
  expect(graph.blocks[0].commits.length).toBe(1);
  expect(graph.blocks[0].commits[0].txid).toBe("tx1");
  expect(graph.blocks[0].commits[0].won).toBe(true);

  expect(graph.edges.length).toBe(1);
  expect(graph.edges[0].sourceTxid).toBe("tx1");
  expect(graph.edges[0].targetTxid).toBe("tx2");
  expect(graph.edges[0].canonical).toBe(true);
});

test("parseDotToGraph parses DOT into structured graph", () => {
  const sampleDot = `digraph G {
  subgraph cluster_block_885000 {
    label="₿ 885000\\l💰 120K sats\\l";
    "abcd1234abcd1234" [label="⛏️ bc1qtest\\l🔗 9000\\l💸 120K sats\\l", URL="https://explorer.hiro.so/block/0xdeadbeef", fillcolor="#fff", color="#2B6CB0", style="filled,rounded", penwidth=3];
  }
  subgraph cluster_block_885001 {
    label="₿ 885001\\l💰 150K sats\\l";
    "efaa5678efaa5678" [label="⛏️ bc1qtest2\\l🔗 9001\\l💸 150K sats\\l", URL="https://mempool.space/tx/efaa", fillcolor="#fff", color="#3182CE", style="filled,rounded", penwidth=4];
  }
  "abcd1234abcd1234" -> "efaa5678efaa5678" [color="#3182CE", penwidth=3];
}`;

  const graph = parseDotToGraph(sampleDot);
  expect(graph.blocks.length).toBe(2);
  expect(graph.blocks[0].height).toBe(885000);
  expect(graph.blocks[0].commits[0].txid).toBe("abcd1234abcd1234");
  expect(graph.blocks[0].commits[0].won).toBe(true);
  expect(graph.blocks[0].commits[0].blockHash).toBe("deadbeef");

  expect(graph.edges.length).toBe(1);
  expect(graph.edges[0].sourceTxid).toBe("abcd1234abcd1234");
  expect(graph.edges[0].targetTxid).toBe("efaa5678efaa5678");
  expect(graph.edges[0].canonical).toBe(true);
});
