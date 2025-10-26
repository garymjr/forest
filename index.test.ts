import { test, expect } from "bun:test";

test("forest version command", async () => {
  const result = await Bun.$`bun ./index.ts --version`.text();
  expect(result.trim()).toBe("forest v0.4.0");
});

test("forest help command", async () => {
  const result = await Bun.$`bun ./index.ts --help`.text();
  expect(result).toContain("forest v");
  expect(result).toContain("Usage:");
  expect(result).toContain("path");
  expect(result).toContain("config");
  expect(result).toContain("status");
});

test("forest with invalid command exits with error code", async () => {
  const result = await Bun.$`bun ./index.ts invalid-command`.catch((e) => e);
  expect(result.exitCode).toBe(2);
});

test("forest config help", async () => {
  const result = await Bun.$`bun ./index.ts help config`.text();
  expect(result).toContain("config");
  expect(result).toContain("get");
  expect(result).toContain("set");
});

test("forest path help", async () => {
  const result = await Bun.$`bun ./index.ts help path`.text();
  expect(result).toContain("path");
  expect(result).toContain("shell");
});

test("forest status help", async () => {
  const result = await Bun.$`bun ./index.ts help status`.text();
  expect(result).toContain("status");
  expect(result).toContain("Dirty");
  expect(result).toContain("conflicts");
});
