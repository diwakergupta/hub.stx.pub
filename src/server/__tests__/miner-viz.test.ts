import { expect, test } from "bun:test";

import { applyD2ClassDefinitions, D2_CLASS_DEFINITIONS } from "@/server/miner-viz";

test("applyD2ClassDefinitions injects class block when missing", () => {
  const source = "direction: down\n\nnode: {}\n";
  const result = applyD2ClassDefinitions(source);
  expect(result).toContain(D2_CLASS_DEFINITIONS.trim());
  expect(result.startsWith("direction: down")).toBeTrue();
});

test("applyD2ClassDefinitions leaves source untouched when classes exist", () => {
  const existing = `direction: down

classes: {
  Foo {}
}
node: {}
`;
  const result = applyD2ClassDefinitions(existing);
  expect(result).toBe(existing);
});
