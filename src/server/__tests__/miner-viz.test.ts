import { expect, test } from "bun:test";
import { generateDot } from "@/server/miner-viz";

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
