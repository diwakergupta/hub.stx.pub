import { expect, test } from "bun:test";
import { generateGraph } from "@/server/miner-viz";

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

  const commit3 = {
    burnHeaderHash: "hash3",
    txid: "tx3",
    vtxindex: 1,
    sender: "bc1qtest3",
    burnBlockHeight: 103, // skipped a block -> fork attempt
    spend: 40000,
    sortitionId: "sort3",
    parentBlockPtr: 100,
    parentVtxindex: 0,
    memo: "",
    parent: "tx1",
    stacksHeight: 11,
    blockHash: null,
    won: false,
    canonical: false,
    tip: false,
    coinbaseEarned: 0,
    feesEarned: 0,
    potentialTip: false,
    nextTip: false,
    key: "103:1",
    parentKey: "100:0",
  };

  const commits = {
    sortitionFeesMap: new Map([
      ["sort1", 50000],
      ["sort2", 60000],
      ["sort3", 40000],
    ]),
    allCommits: new Map([
      ["tx1", commit1],
      ["tx2", commit2],
      ["tx3", commit3],
    ]),
    commitsByBlock: new Map([
      [100, [commit1]],
      [101, [commit2]],
      [103, [commit3]],
    ]),
  };

  const graph = generateGraph(100, 103, commits);

  expect(graph.blocks.length).toBe(3);
  expect(graph.blocks[0].height).toBe(100);
  expect(graph.blocks[0].commits.length).toBe(1);
  expect(graph.blocks[0].commits[0].txid).toBe("tx1");
  expect(graph.blocks[0].commits[0].won).toBe(true);

  expect(graph.edges.length).toBe(2);
  const canonicalEdge = graph.edges.find((e) => e.targetTxid === "tx2");
  expect(canonicalEdge?.sourceTxid).toBe("tx1");
  expect(canonicalEdge?.canonical).toBe(true);
  expect(canonicalEdge?.isFork).toBe(false);

  const forkEdge = graph.edges.find((e) => e.targetTxid === "tx3");
  expect(forkEdge?.sourceTxid).toBe("tx1");
  expect(forkEdge?.canonical).toBe(false);
  expect(forkEdge?.isFork).toBe(true);
});
