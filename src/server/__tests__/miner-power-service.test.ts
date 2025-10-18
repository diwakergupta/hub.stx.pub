import { expect, test } from "bun:test";

import { escapeSqliteString } from "@/server/miner-power-service";

test("escapeSqliteString doubles single quotes", () => {
  expect(escapeSqliteString("path/with'single")).toBe("path/with''single");
});

test("escapeSqliteString leaves clean strings untouched", () => {
  const value = "plain/path";
  expect(escapeSqliteString(value)).toBe(value);
});
