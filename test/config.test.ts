import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTempTestRepo,
  parseJSONOutput,
  resetForestConfig,
  stripAnsiCodes,
  type TestRepo,
} from "./test-utils";
import { rmSync } from "fs";
import { join } from "path";

let testRepo: TestRepo;
let originalConfigHome: string | undefined;

beforeEach(async () => {
  testRepo = await createTempTestRepo("forest-config");
  originalConfigHome = Bun.env.HOME;
});

afterEach(async () => {
  testRepo.cleanup();
  if (originalConfigHome) {
    process.env.HOME = originalConfigHome;
  }
  await resetForestConfig();
});

test("config - get default directory", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get directory`.cwd(testRepo.path).text();
  const cleaned = stripAnsiCodes(result);
  expect(cleaned).toContain(".forest/worktrees");
});

test("config - set custom directory", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory ~/.custom-forest --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.value).toContain(".custom-forest");
});

test("config - get returns set value", async () => {
  // Set a value first
  const forestDir = import.meta.dir;
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory ~/.my-worktrees-test`.cwd(testRepo.path).text();
  
  // Get the value back
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get directory --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.value).toContain(".my-worktrees-test");
});

test("config - reset to defaults", async () => {
  // Set a custom value
  const forestDir = import.meta.dir;
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory ~/.custom-forest`.cwd(testRepo.path).text();
  
  // Reset to defaults
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config reset --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  
  // Verify default is back
  const getResult = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get directory --json`.cwd(testRepo.path).text();
  const getData = parseJSONOutput(getResult);
  expect(getData.data.value).toContain(".forest/worktrees");
});

test("config - reject unknown config key", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get unknown-key`.cwd(testRepo.path).text().catch(e => e.stdout?.toString() || "");
  const cleaned = stripAnsiCodes(result);
  expect(cleaned.includes("Unknown") || cleaned.includes("error")).toBe(true);
});

test("config - set requires value", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory`.cwd(testRepo.path).text().catch(e => e.stdout?.toString() || "");
  const cleaned = stripAnsiCodes(result);
  expect(cleaned.includes("required") || cleaned.includes("error")).toBe(true);
});

test("config - reject invalid set action", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config invalid directory value`.cwd(testRepo.path).text().catch(e => e.stdout?.toString() || "");
  const cleaned = stripAnsiCodes(result);
  expect(cleaned.includes("Unknown") || cleaned.includes("Invalid")).toBe(true);
});

test("config - JSON output includes key and value", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get directory --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.key).toBe("directory");
  expect(data.data.value).toBeDefined();
});

test("config - supports tilde expansion", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory ~/forest-test --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.value).toContain("forest-test");
  expect(data.data.value).not.toContain("~");
});

test("config - empty path rejected", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory ""`.cwd(testRepo.path).text().catch(e => e.stdout?.toString() || "");
  const cleaned = stripAnsiCodes(result);
  expect(cleaned.includes("error") || cleaned.includes("required") || cleaned.includes("cannot be empty")).toBe(true);
});

test("config - validate on load from disk", async () => {
  // Set a value
  const forestDir = import.meta.dir;
  await Bun.$`bun ${[`${forestDir}/../index.ts`]} config set directory ~/.valid-forest --json`.cwd(testRepo.path).text();
  
  // Verify it persists by getting it again
  const result = await Bun.$`bun ${[`${forestDir}/../index.ts`]} config get directory --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(data.data.value).toContain(".valid-forest");
});
