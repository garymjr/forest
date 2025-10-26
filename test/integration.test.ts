import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTempTestRepo,
  makeWorktreeDirty,
  parseJSONOutput,
  TestRepo,
} from "./test-utils";

let testRepo: TestRepo;

beforeEach(async () => {
  testRepo = await createTempTestRepo("forest-integration");
});

afterEach(() => {
  testRepo.cleanup();
});

test("integration - full workflow: add, modify, status, remove", async () => {
  // Add a worktree
  const forestDir = import.meta.dir;
  const addResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-workflow -b`.cwd(testRepo.path).text();
  expect(addResult).toContain("Worktree created");

  // Get the path
  const pathResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} path feature-workflow`.cwd(testRepo.path).text();
  const wtPath = pathResult.trim();

  // Make it dirty
  await makeWorktreeDirty(wtPath, "test content");

  // Check status
  const statusResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --json`.cwd(testRepo.path).text();
  const statusData = parseJSONOutput(statusResult);
  const dirtyWt = statusData.data.worktrees.find((w: any) => w.path === wtPath);
  expect(dirtyWt?.dirty).toBe(true);

  // Remove with force
  const rmResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} remove feature-workflow --force`.cwd(testRepo.path).text();
  expect(rmResult).toContain("Worktree removed") || expect(rmResult).toContain("Removed");
});

test("integration - clone workflow: create source, clone, verify", async () => {
  // Create source worktree
  const forestDir = import.meta.dir;
  const sourceResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-source -b`.cwd(testRepo.path).text();
  expect(sourceResult).toContain("Worktree created");

  // Add content to source
  const sourcePathResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} path feature-source`.cwd(testRepo.path).text();
  const sourcePath = sourcePathResult.trim();
  await Bun.write(`${sourcePath}/test.txt`, "source content");
  await Bun.$`git -C ${[sourcePath]} add .`.quiet();
  await Bun.$`git -C ${[sourcePath]} commit -m "test commit"`.quiet().catch(() => {});

  // Clone to new worktree
  const cloneResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} clone feature-source feature-clone -b --json`.cwd(testRepo.path).text();
  const cloneData = parseJSONOutput(cloneResult);
  expect(cloneData.success).toBe(true);

  // List and verify both exist
  const listResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} list --json`.cwd(testRepo.path).text();
  const listData = parseJSONOutput(listResult);
  expect(listData.data.worktrees.length).toBeGreaterThanOrEqual(2);
});

test("integration - config persistence across operations", async () => {
  // Set custom directory
  const forestDir = import.meta.dir;
  const configResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory ~/.test-forest-custom`.cwd(testRepo.path).text();
  expect(configResult).toContain("updated") || expect(configResult).toContain("Config");

  // Verify it persists
  const getResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get directory`.cwd(testRepo.path).text();
  expect(getResult).toContain("test-forest-custom");

  // Reset
  const resetResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config reset`.cwd(testRepo.path).text();
  expect(resetResult).toContain("defaults");

  // Verify reset
  const getFinalResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get directory`.cwd(testRepo.path).text();
  expect(getFinalResult).toContain(".forest/worktrees");
});

test("integration - multi-worktree operations", async () => {
  // Create multiple worktrees
  const forestDir = import.meta.dir;
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-a -b`.cwd(testRepo.path).text();
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-b -b`.cwd(testRepo.path).text();
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add bugfix-c -b`.cwd(testRepo.path).text();

  // List all
  const listResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} list --json`.cwd(testRepo.path).text();
  const listData = parseJSONOutput(listResult);
  expect(listData.data.worktrees.length).toBeGreaterThanOrEqual(3);

  // Get status of all
  const statusResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --json`.cwd(testRepo.path).text();
  const statusData = parseJSONOutput(statusResult);
  expect(statusData.data.worktrees.length).toBeGreaterThanOrEqual(3);

  // Groups
  const groupsResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} groups --json`.cwd(testRepo.path).text();
  const groupsData = parseJSONOutput(groupsResult);
  expect(groupsData.data.groups.length).toBeGreaterThan(0);
});

test("integration - namespace-based workflow", async () => {
  // Create worktrees with namespaces
  const forestDir = import.meta.dir;
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature/auth -b`.cwd(testRepo.path).text();
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature/ui -b`.cwd(testRepo.path).text();
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add bugfix/login -b`.cwd(testRepo.path).text();

  // Filter by namespace
  const featureResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} list --group feature --json`.cwd(testRepo.path).text();
  const featureData = parseJSONOutput(featureResult);
  if (featureData.data.worktrees.length > 0) {
    featureData.data.worktrees.forEach((wt: any) => {
      expect(wt.branch).toContain("feature");
    });
  }

  // Get groups
  const groupsResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} groups --json`.cwd(testRepo.path).text();
  const groupsData = parseJSONOutput(groupsResult);
  expect(groupsData.data.groups.length).toBeGreaterThan(0);
});

test("integration - lock/unlock workflow", async () => {
  // Create worktree
  const forestDir = import.meta.dir;
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add feature-locktest -b`.cwd(testRepo.path).text();

  // Lock it
  const lockResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} lock feature-locktest --reason "WIP"`.cwd(testRepo.path).text();
  expect(lockResult).toContain("locked");

  // Check info
  const pathResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} path feature-locktest`.cwd(testRepo.path).text();
  const wtPath = pathResult.trim();
  const infoResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} info ${[wtPath]} --json`.cwd(testRepo.path).text();
  const infoData = parseJSONOutput(infoResult);
  expect(infoData.data.locked).toBe(true);

  // Unlock it
  const unlockResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} unlock feature-locktest`.cwd(testRepo.path).text();
  expect(unlockResult).toContain("unlocked");
});

test("integration - help command shows all commands", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} help`.cwd(testRepo.path).text();
  expect(result).toContain("Commands:");
  expect(result).toContain("add");
  expect(result).toContain("remove");
  expect(result).toContain("list");
  expect(result).toContain("clone");
  expect(result).toContain("sync");
});

test("integration - version command works", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} --version`.cwd(testRepo.path).text();
  expect(result).toContain("forest v");
});

test("integration - JSON output consistency", async () => {
  // Create a worktree
  const forestDir = import.meta.dir;
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} add consistency-test -b`.cwd(testRepo.path).text();

  // Get outputs from different commands
  const addJSON = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add consistency-1 -b --json`.cwd(testRepo.path).text();
  const addData = parseJSONOutput(addJSON);
  expect(addData.success).toBe(true);
  expect(addData.data).toBeDefined();

  const listJSON = await Bun.$`bun ${[`${forestDir}/../index.ts`]} list --json`.cwd(testRepo.path).text();
  const listData = parseJSONOutput(listJSON);
  expect(listData.success).toBe(true);
  expect(listData.data).toBeDefined();

  const statusJSON = await Bun.$`bun ${[`${forestDir}/../index.ts`]} status --json`.cwd(testRepo.path).text();
  const statusData = parseJSONOutput(statusJSON);
  expect(statusData.success).toBe(true);
  expect(statusData.data).toBeDefined();

  // All should follow same pattern
  expect(addData.hasOwnProperty("success")).toBe(true);
  expect(listData.hasOwnProperty("success")).toBe(true);
  expect(statusData.hasOwnProperty("success")).toBe(true);
});
