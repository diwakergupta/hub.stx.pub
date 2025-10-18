import { expect, test } from "bun:test";

import { parseCostVector } from "@/server/blocks-service";

test("parseCostVector handles null cost payload", () => {
  const result = parseCostVector(null);
  expect(result).toEqual({
    readLength: 0,
    readCount: 0,
    writeLength: 0,
    writeCount: 0,
    runtime: 0,
  });
});

test("parseCostVector supports legacy snake_cased keys", () => {
  const raw = JSON.stringify({
    read_length: 10,
    read_count: "5",
    write_length: 12,
    write_count: "3",
    runtime: "42",
  });
  const result = parseCostVector(raw);
  expect(result).toEqual({
    readLength: 10,
    readCount: 5,
    writeLength: 12,
    writeCount: 3,
    runtime: 42,
  });
});

test("parseCostVector falls back on bad JSON", () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  const result = parseCostVector("{not valid json");
  console.warn = originalWarn;
  expect(result).toEqual({
    readLength: 0,
    readCount: 0,
    writeLength: 0,
    writeCount: 0,
    runtime: 0,
  });
});
