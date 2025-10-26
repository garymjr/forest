import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTempTestRepo,
  createTestWorktree,
  makeWorktreeDirty,
  parseJSONOutput,
  resetForestConfig,
  type TestRepo,
} from "./test-utils";

let testRepo: TestRepo;

beforeEach(async () => {
  testRepo = await createTempTestRepo("forest-status-sync");
});

afterEach(async () => {
  testRepo.cleanup();
  await resetForestConfig();
});

test("status - show all clean worktrees", async () => {
  await createTestWorktree(testRepo.path, "feature-clean-1", true);
  await createTestWorktree(testRepo.path, "feature-clean-2", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status`.cwd(testRepo.path).text();
  expect(result).toContain("Git Worktrees Status");
  expect(result).toContain("feature-clean-1");
});

test("status - JSON output includes all statuses", async () => {
  await createTestWorktree(testRepo.path, "feature-status-json", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(Array.isArray(data.data.worktrees)).toBe(true);
  expect(data.data.summary).toBeDefined();
  expect(data.data.summary.total).toBeGreaterThan(0);
});

test("status - identify dirty worktrees", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-dirty", true);
  await makeWorktreeDirty(wtPath);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status`.cwd(testRepo.path).text();
  expect(result.includes("dirty") || result.includes("⚠")).toBe(true);
});

test("status - summary includes counts", async () => {
  await createTestWorktree(testRepo.path, "feature-s1", true);
  await createTestWorktree(testRepo.path, "feature-s2", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.data.summary.total).toBe(2);
  expect(data.data.summary.clean).toBeGreaterThanOrEqual(0);
  expect(data.data.summary.dirty).toBeGreaterThanOrEqual(0);
});

test("status - show status for single worktree", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-single", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.data.worktrees.length).toBeGreaterThan(0);
  const wt = data.data.worktrees[0];
  expect(wt.path).toBeDefined();
  expect(wt.branch).toBeDefined();
  expect(wt.dirty).toBeDefined();
});

test("sync - syncs clean worktrees", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-sync", true);
  // Set up upstream
  await Bun.$`git -C ${[wtPath]} branch -u HEAD@{upstream}`.quiet().catch(() => {});
  
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} sync`.cwd(testRepo.path).text();
  expect(result.includes("Sync") || result.includes("Synced") || result.includes("skipped")).toBe(true);
});

test("sync - JSON output includes results", async () => {
  await createTestWorktree(testRepo.path, "feature-sync-json", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} sync --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.data.results).toBeDefined();
  expect(Array.isArray(data.data.results.synced)).toBe(true);
  expect(Array.isArray(data.data.results.skipped)).toBe(true);
});

test("sync - skips dirty worktrees without --force", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-sync-dirty", true);
  await makeWorktreeDirty(wtPath);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} sync --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.data.results.skipped.length).toBeGreaterThan(0);
});

test("sync - force syncs dirty worktrees", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-sync-force", true);
  await makeWorktreeDirty(wtPath);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} sync --force`.cwd(testRepo.path).text();
  expect(result.includes("Sync") || result.includes("Synced") || result.includes("stash")).toBe(true);
});

test("sync - summary includes total counts", async () => {
  await createTestWorktree(testRepo.path, "feature-sync-summary-1", true);
  await createTestWorktree(testRepo.path, "feature-sync-summary-2", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} sync --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.data.summary.total).toBeGreaterThan(0);
  expect(data.data.summary.synced).toBeGreaterThanOrEqual(0);
  expect(data.data.summary.skipped).toBeGreaterThanOrEqual(0);
});

test("status --all shows all worktrees", async () => {
  await createTestWorktree(testRepo.path, "feature-status-all-1", true);
  await createTestWorktree(testRepo.path, "feature-status-all-2", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --all`.cwd(testRepo.path).text();
  expect(result).toContain("feature-status-all-1");
  expect(result).toContain("feature-status-all-2");
});

test("status - identifies locked worktrees", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-locked", true);
  await Bun.$`git -C ${[testRepo.path]} worktree lock ${[wtPath]}`.quiet();
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  const lockedWt = data.data.worktrees.find((w: any) => w.locked);
  expect(lockedWt).toBeDefined();
});
