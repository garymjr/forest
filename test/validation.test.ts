import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTempTestRepo,
  parseJSONOutput,
  resetForestConfig,
  stripAnsiCodes,
  type TestRepo,
} from "./test-utils";

let testRepo: TestRepo;

beforeEach(async () => {
  testRepo = await createTempTestRepo("forest-validation");
});

afterEach(async () => {
  testRepo.cleanup();
  await resetForestConfig();
});

test("validation - reject path with null bytes", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add "feature\0test" -b`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("error")).toBe(true);
});

test("validation - reject branch with newlines", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add "feature\ntest" -b`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("error")).toBe(true);
});

test("validation - reject empty branch name", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add "" -b`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("error")).toBe(true);
});

test("validation - reject branch exceeding max length", async () => {
  const longBranch = "a".repeat(300);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add ${[longBranch]} -b`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("exceeds")).toBe(true);
});

test("validation - reject path exceeding max length", async () => {
  const longPath = "/" + "a".repeat(5000);
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add ${[longPath]} feature-branch`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("exceeds")).toBe(true);
});

test("validation - reject path with path traversal", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add "/tmp/../../../etc/passwd" feature-branch`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("traversal")).toBe(true);
});

test("validation - protect system directories (root)", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add "/" feature-branch`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("sensitive")).toBe(true);
});

test("validation - protect system directories (/etc)", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add "/etc/passwd" feature-branch`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode !== 0 || result.stdout.includes("sensitive")).toBe(true);
});

test("validation - allow valid user paths", async () => {
  const forestDir = import.meta.dir;
  const worktreeDir = `${testRepo.path}/.worktrees/feature-valid`;
  await Bun.$`mkdir -p ${[worktreeDir.substring(0, worktreeDir.lastIndexOf("/"))]}`.quiet();
  await Bun.$`git -C ${[testRepo.path]} branch feature-valid`.quiet();
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add ${[worktreeDir]} feature-valid --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
});

test("validation - config rejects invalid directory", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory "/etc/shadow"`.cwd(testRepo.path).text().catch(e => e.stdout?.toString() || "");
  const cleaned = stripAnsiCodes(result);
  expect(cleaned.includes("error") || cleaned.includes("sensitive")).toBe(true);
});

test("validation - config rejects path traversal", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory "~/foo/../../etc"`.cwd(testRepo.path).text().catch(e => e.stdout?.toString() || "");
  const cleaned = stripAnsiCodes(result);
  expect(cleaned.includes("traversal") || cleaned.includes("error")).toBe(true);
});

test("validation - config accepts valid home directory path", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory "~/.my-forest" --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
});

test("validation - invalid command exits with code 2", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} invalid-command`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode).toBe(2);
});

test("validation - missing required arguments", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} add`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode === 2 || result.stdout.includes("Missing")).toBe(true);
});

test("validation - remove non-existent worktree", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} remove non-existent-wt`.cwd(testRepo.path).catch((e) => e);
  expect(result.exitCode).not.toBe(0);
});
