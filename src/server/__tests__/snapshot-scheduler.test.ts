import { expect, test, beforeEach, afterEach, spyOn, mock } from "bun:test";
import {
  initializeSnapshotScheduler,
  stopSnapshotScheduler,
} from "@/server/snapshot-job";

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  stopSnapshotScheduler();
});

afterEach(() => {
  stopSnapshotScheduler();
  process.env = originalEnv;
});

test("initializeSnapshotScheduler does nothing when STACKS_DATA_DIR is missing", () => {
  delete process.env.STACKS_DATA_DIR;
  const cronSpy = spyOn(Bun, "cron");

  initializeSnapshotScheduler();

  expect(cronSpy).not.toHaveBeenCalled();
  cronSpy.mockRestore();
});

test("initializeSnapshotScheduler registers Bun.cron job and can be stopped", () => {
  process.env.STACKS_DATA_DIR = "/mock/dir";

  const stopMock = mock(() => ({} as Bun.CronJob));
  const cronSpy = spyOn(Bun, "cron").mockImplementation((schedule) => {
    return {
      cron: schedule,
      stop: stopMock,
      ref: () => ({} as Bun.CronJob),
      unref: () => ({} as Bun.CronJob),
    } as unknown as Bun.CronJob;
  });

  initializeSnapshotScheduler();

  expect(cronSpy).toHaveBeenCalledTimes(1);
  expect(cronSpy.mock.calls[0]?.[0]).toBe("*/1 * * * *");

  // Re-initialization should be idempotent
  initializeSnapshotScheduler();
  expect(cronSpy).toHaveBeenCalledTimes(1);

  // Stopping should call job.stop()
  stopSnapshotScheduler();
  expect(stopMock).toHaveBeenCalledTimes(1);

  // Calling stop again when already stopped should be safe
  stopSnapshotScheduler();
  expect(stopMock).toHaveBeenCalledTimes(1);

  cronSpy.mockRestore();
});
