import { test, expect } from "bun:test";

test("forest version command", async () => {
  const result = await Bun.$`bun ./index.ts --version`.text();
  expect(result.trim()).toBe("forest v0.1.0");
});

test("forest help command", async () => {
  const result = await Bun.$`bun ./index.ts --help`.text();
  expect(result).toContain("forest v");
  expect(result).toContain("Usage:");
});

test("forest with invalid command exits with error code", async () => {
  const result = await Bun.$`bun ./index.ts invalid-command`.catch((e) => e);
  expect(result.exitCode).toBe(2);
});
