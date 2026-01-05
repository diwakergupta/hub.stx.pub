import { expect, test, mock, beforeEach, afterEach } from "bun:test";
import { withDataDir, withSnapshot } from "@/server/api-utils";
import * as snapshotStore from "@/server/snapshot-store";

// Mock snapshot store
mock.module("@/server/snapshot-store", () => ({
  loadLatestSnapshot: mock(),
  loadSnapshotByHeight: mock(),
}));

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

test("withDataDir returns 500 if STACKS_DATA_DIR is missing", async () => {
  delete process.env.STACKS_DATA_DIR;
  
  const response = await withDataDir(() => new Response("ok"));
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.error).toBe("STACKS_DATA_DIR is not configured");
});

test("withDataDir calls handler if STACKS_DATA_DIR is set", async () => {
  process.env.STACKS_DATA_DIR = "/tmp/test-data";
  
  const response = await withDataDir(({ dataDir }) => {
    expect(dataDir).toBe("/tmp/test-data");
    return new Response("ok");
  });
  
  expect(response.status).toBe(200);
});

test("withSnapshot returns 503 if no snapshot available", async () => {
  process.env.STACKS_DATA_DIR = "/tmp/test-data";
  (snapshotStore.loadLatestSnapshot as any).mockReturnValue(null);

  const req = new Request("http://localhost/");
  const response = await withSnapshot(req, () => new Response("ok"));
  
  expect(response.status).toBe(503);
  expect((await response.json()).error).toBe("No miner snapshot available");
});

test("withSnapshot loads latest snapshot by default", async () => {
  process.env.STACKS_DATA_DIR = "/tmp/test-data";
  const mockSnapshot = { generatedAt: "now" };
  (snapshotStore.loadLatestSnapshot as any).mockReturnValue(mockSnapshot);

  const req = new Request("http://localhost/");
  const response = await withSnapshot(req, ({ snapshot }) => {
    expect(snapshot).toBe(mockSnapshot);
    return new Response("ok");
  });

  expect(response.status).toBe(200);
  expect(snapshotStore.loadLatestSnapshot).toHaveBeenCalled();
});

test("withSnapshot loads snapshot by height if query param present", async () => {
  process.env.STACKS_DATA_DIR = "/tmp/test-data";
  const mockSnapshot = { generatedAt: "then" };
  (snapshotStore.loadSnapshotByHeight as any).mockReturnValue(mockSnapshot);

  const req = new Request("http://localhost/?height=100");
  const response = await withSnapshot(req, ({ snapshot }) => {
    expect(snapshot).toBe(mockSnapshot);
    return new Response("ok");
  });

  expect(response.status).toBe(200);
  expect(snapshotStore.loadSnapshotByHeight).toHaveBeenCalledWith("/tmp/test-data", 100);
});
