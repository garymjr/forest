import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTempTestRepo,
  createTestWorktree,
  assertWorktreeExists,
  getWorktreePath,
  parseJSONOutput,
  resetForestConfig,
  stripAnsiCodes,
  type TestRepo,
} from "./test-utils";

let testRepo: TestRepo;

beforeEach(async () => {
  testRepo = await createTempTestRepo("forest-wt-ops");
});

afterEach(async () => {
  testRepo.cleanup();
  await resetForestConfig();
});

test("add - create worktree with -b flag", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-x -b`.cwd(testRepo.path).text();
  expect(result).toContain("Worktree created");
  expect(await assertWorktreeExists(testRepo.path, "feature-x")).toBe(true);
});

test("add - create worktree with --new-branch", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add bugfix-y --new-branch`.cwd(testRepo.path).text();
  expect(result).toContain("Worktree created");
  expect(await assertWorktreeExists(testRepo.path, "bugfix-y")).toBe(true);
});

test("add - create worktree with --from flag", async () => {
  // Create a base branch first
  await Bun.$`git -C ${[testRepo.path]} branch staging`.quiet();
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-staging -b --from staging`.cwd(testRepo.path).text();
  expect(result).toContain("Worktree created");
  expect(await assertWorktreeExists(testRepo.path, "feature-staging")).toBe(true);
});

test("add - create with explicit path and branch", async () => {
  const worktreeDir = `${testRepo.path}/.worktrees/my-feature`;
  await Bun.$`mkdir -p ${[worktreeDir.substring(0, worktreeDir.lastIndexOf("/"))]}`.quiet();
  
  // First create the branch
  await Bun.$`git -C ${[testRepo.path]} branch my-feature`.quiet();
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add ${[worktreeDir]} my-feature`.cwd(testRepo.path).text();
  expect(result).toContain("Worktree created");
});

test("add - reject empty branch name", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add ""`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("error") || result.stdout.includes("Missing")).toBe(true);
});

test("add - JSON output includes metadata", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-json -b --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.branch).toBe("feature-json");
  expect(data.data.new_branch).toBe(true);
});

test("remove - delete existing worktree", async () => {
  await createTestWorktree(testRepo.path, "feature-remove", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} remove feature-remove`.cwd(testRepo.path).text();
  expect(result).toContain("Worktree removed");
  expect(await assertWorktreeExists(testRepo.path, "feature-remove")).toBe(false);
});

test("remove - reject dirty worktree without --force", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-dirty", true);
  await Bun.write(`${wtPath}/test.txt`, "changes");
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} remove feature-dirty`.cwd(testRepo.path).text().catch(e => e.stdout?.toString() || "");
  const cleaned = stripAnsiCodes(result);
  expect(cleaned.includes("uncommitted changes") || cleaned.includes("error")).toBe(true);
});

test("remove - force remove dirty worktree", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-force", true);
  await Bun.write(`${wtPath}/test.txt`, "changes");
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} remove feature-force --force`.cwd(testRepo.path).text();
  expect(result.includes("Worktree removed") || result.includes("Removed")).toBe(true);
});

test("remove - JSON output includes path", async () => {
  await createTestWorktree(testRepo.path, "feature-rm-json", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} remove feature-rm-json --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.path).toBeDefined();
});

test("list - show all worktrees", async () => {
  await createTestWorktree(testRepo.path, "feature-1", true);
  await createTestWorktree(testRepo.path, "feature-2", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} list`.cwd(testRepo.path).text();
  expect(result).toContain("feature-1");
  expect(result).toContain("feature-2");
});

test("list - JSON output includes array", async () => {
  await createTestWorktree(testRepo.path, "feature-list-json", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} list --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(Array.isArray(data.data.worktrees)).toBe(true);
  expect(data.data.worktrees.length).toBeGreaterThan(0);
});

test("clone - create detached worktree from another", async () => {
  const source = await createTestWorktree(testRepo.path, "feature-source", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} clone feature-source feature-clone`.cwd(testRepo.path).text();
  expect(result.includes("cloned") || result.includes("Worktree")).toBe(true);
});

test("clone - create with -b flag creates new branch", async () => {
  const source = await createTestWorktree(testRepo.path, "feature-source-b", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} clone feature-source-b feature-clone-b -b`.cwd(testRepo.path).text();
  expect(result.includes("cloned") || result.includes("new branch")).toBe(true);
});

test("clone - JSON output includes source commit", async () => {
  await createTestWorktree(testRepo.path, "feature-clone-src", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} clone feature-clone-src feature-clone-dst --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.source_commit).toBeDefined();
  expect(data.data.path).toBeDefined();
});

test("prune - remove stale worktrees", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-prune", true);
  // Remove the directory to make it prunable
  await Bun.$`rm -rf ${[wtPath]}`.quiet();
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} prune`.cwd(testRepo.path).text();
  expect(result.includes("Pruned") || result.includes("prune")).toBe(true);
});

test("prune --dry-run shows what would be pruned", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} prune --dry-run`.cwd(testRepo.path).text();
  expect(result.includes("dry run") || result.includes("Pruned")).toBe(true);
});

test("lock - lock a worktree", async () => {
  await createTestWorktree(testRepo.path, "feature-lock", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} lock feature-lock`.cwd(testRepo.path).text();
  expect(result).toContain("locked");
});

test("lock - with reason", async () => {
  await createTestWorktree(testRepo.path, "feature-lock-reason", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} lock feature-lock-reason --reason "WIP: testing"`.cwd(testRepo.path).text();
  expect(result).toContain("locked");
});

test("unlock - unlock a worktree", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-unlock", true);
  await Bun.$`git -C ${[testRepo.path]} worktree lock ${[wtPath]}`.quiet();
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} unlock feature-unlock`.cwd(testRepo.path).text();
  expect(result).toContain("unlocked");
});

test("info - show worktree details", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-info", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} info ${[wtPath]}`.cwd(testRepo.path).text();
  expect(result).toContain("feature-info");
});

test("info - JSON output includes all fields", async () => {
  const wtPath = await createTestWorktree(testRepo.path, "feature-info-json", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} info ${[wtPath]} --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.path).toBeDefined();
  expect(data.data.branch).toBeDefined();
  expect(data.data.commit).toBeDefined();
});

test("path - resolve branch to worktree path", async () => {
  await createTestWorktree(testRepo.path, "feature-path", true);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} path feature-path`.cwd(testRepo.path).text();
  expect(result.includes(".worktrees") || result.includes("feature-path")).toBe(true);
});
