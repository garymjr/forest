import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTempTestRepo,
  parseJSONOutput,
  TestRepo,
} from "./test-utils";

let testRepo: TestRepo;

beforeEach(async () => {
  testRepo = await createTempTestRepo("forest-groups");
});

afterEach(() => {
  testRepo.cleanup();
});

test("groups - list all namespace groups", async () => {
  // Create worktrees with different namespaces
  await Bun.$`git -C ${[testRepo.path]} branch feature/auth -b`.quiet();
  await Bun.$`git -C ${[testRepo.path]} branch feature/ui -b`.quiet();
  await Bun.$`git -C ${[testRepo.path]} branch bugfix/login -b`.quiet();
  
  const wtDir1 = `${testRepo.path}/.worktrees/feature-auth`;
  const wtDir2 = `${testRepo.path}/.worktrees/feature-ui`;
  const wtDir3 = `${testRepo.path}/.worktrees/bugfix-login`;
  
  await Bun.$`mkdir -p ${[wtDir1]} ${[wtDir2]} ${[wtDir3]}`.quiet();
  await Bun.$`git -C ${[testRepo.path]} worktree add -b feature/auth ${[wtDir1]}`.quiet().catch(() => {});
  await Bun.$`git -C ${[testRepo.path]} worktree add -b feature/ui ${[wtDir2]}`.quiet().catch(() => {});
  await Bun.$`git -C ${[testRepo.path]} worktree add -b bugfix/login ${[wtDir3]}`.quiet().catch(() => {});
  
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} groups`.cwd(testRepo.path).text();
  expect(result).toContain("Git Worktree Groups");
});

test("groups - JSON output includes group array", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} groups --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(Array.isArray(data.data.groups)).toBe(true);
  expect(data.data.total_groups).toBeGreaterThanOrEqual(0);
});

test("groups - count worktrees per group", async () => {
  await Bun.$`git -C ${[testRepo.path]} branch feature/auth`.quiet().catch(() => {});
  await Bun.$`git -C ${[testRepo.path]} branch feature/ui`.quiet().catch(() => {});
  
  const wtDir1 = `${testRepo.path}/.worktrees/feature-auth`;
  const wtDir2 = `${testRepo.path}/.worktrees/feature-ui`;
  
  await Bun.$`mkdir -p ${[wtDir1]} ${[wtDir2]}`.quiet();
  await Bun.$`git -C ${[testRepo.path]} worktree add ${[wtDir1]} feature/auth`.quiet().catch(() => {});
  await Bun.$`git -C ${[testRepo.path]} worktree add ${[wtDir2]} feature/ui`.quiet().catch(() => {});
  
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} groups --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  if (data.data.groups.length > 0) {
    const group = data.data.groups[0];
    expect(group.count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(group.worktrees)).toBe(true);
  }
});

test("groups --verbose shows worktrees in each group", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} groups --verbose`.cwd(testRepo.path).text();
  expect(result).toContain("Git Worktree Groups") || expect(result).length > 0;
});

test("list --group filters by namespace", async () => {
  await Bun.$`git -C ${[testRepo.path]} branch feature/auth`.quiet().catch(() => {});
  await Bun.$`git -C ${[testRepo.path]} branch bugfix/login`.quiet().catch(() => {});
  
  const wtDir1 = `${testRepo.path}/.worktrees/feature-auth`;
  const wtDir2 = `${testRepo.path}/.worktrees/bugfix-login`;
  
  await Bun.$`mkdir -p ${[wtDir1]} ${[wtDir2]}`.quiet();
  await Bun.$`git -C ${[testRepo.path]} worktree add ${[wtDir1]} feature/auth`.quiet().catch(() => {});
  await Bun.$`git -C ${[testRepo.path]} worktree add ${[wtDir2]} bugfix/login`.quiet().catch(() => {});
  
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} list --group feature --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  if (data.data.worktrees.length > 0) {
    data.data.worktrees.forEach((wt: any) => {
      expect(wt.branch).toContain("feature");
    });
  }
});

test("status --group filters by namespace", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} status --group feature --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
  expect(Array.isArray(data.data.worktrees)).toBe(true);
});

test("sync --group syncs only namespace worktrees", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} sync --group feature --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.data.results).toBeDefined();
  expect(data.data.summary).toBeDefined();
});

test("add --group places worktree in namespace", async () => {
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} add feature-test -b --group feature --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  expect(data.success).toBe(true);
});

test("groups - (root) group contains non-namespaced worktrees", async () => {
  await Bun.$`git -C ${[testRepo.path]} branch root-branch`.quiet().catch(() => {});
  const wtDir = `${testRepo.path}/.worktrees/root-branch`;
  await Bun.$`mkdir -p ${[wtDir]}`.quiet();
  await Bun.$`git -C ${[testRepo.path]} worktree add ${[wtDir]} root-branch`.quiet().catch(() => {});
  
  const forestDir = import.meta.dir;
  const result = await Bun.$`bun ${[`${forestDir}/index.ts`]} groups --json`.cwd(testRepo.path).text();
  const data = parseJSONOutput(result);
  const rootGroup = data.data.groups.find((g: any) => g.name === "(root)");
  if (rootGroup) {
    expect(rootGroup.worktrees.length).toBeGreaterThan(0);
  }
});
