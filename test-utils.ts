import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface TestRepo {
  path: string;
  cleanup: () => void;
}

export async function createTempTestRepo(name = "test-repo"): Promise<TestRepo> {
  const tempDir = mkdtempSync(join(tmpdir(), name));
  
  try {
    await Bun.$`git init ${[tempDir]}`.quiet();
    await Bun.$`git -C ${[tempDir]} config user.email "test@example.com"`.quiet();
    await Bun.$`git -C ${[tempDir]} config user.name "Test User"`.quiet();
    
    // Create initial commit
    await Bun.$`touch ${[join(tempDir, "README.md")]}`.quiet();
    await Bun.$`git -C ${[tempDir]} add .`.quiet();
    await Bun.$`git -C ${[tempDir]} commit -m "Initial commit"`.quiet();
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }

  return {
    path: tempDir,
    cleanup: () => {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    },
  };
}

export async function createTestWorktree(
  repoPath: string,
  branchName: string,
  newBranch = false
): Promise<string> {
  const worktreeDir = join(repoPath, ".worktrees", branchName);
  
  try {
    if (newBranch) {
      await Bun.$`git -C ${[repoPath]} worktree add -b ${[branchName]} ${[worktreeDir]}`.quiet();
    } else {
      // Create branch first if needed
      try {
        await Bun.$`git -C ${[repoPath]} branch ${[branchName]}`.quiet();
      } catch {
        // Branch might already exist
      }
      await Bun.$`git -C ${[repoPath]} worktree add ${[worktreeDir]} ${[branchName]}`.quiet();
    }
  } catch (error) {
    throw new Error(`Failed to create test worktree: ${error}`);
  }

  return worktreeDir;
}

export async function makeWorktreeDirty(worktreePath: string, fileContent = "modified"): Promise<void> {
  const testFile = join(worktreePath, "test-file.txt");
  await Bun.write(testFile, fileContent);
}

export async function makeWorktreeWithConflict(worktreePath: string): Promise<void> {
  const conflictFile = join(worktreePath, "conflict.txt");
  await Bun.write(conflictFile, "<<<<<<< HEAD\nlocal change\n=======\nremote change\n>>>>>>> branch");
  
  // Stage the file to mark as conflicted in git's perspective
  try {
    await Bun.$`git -C ${[worktreePath]} add ${[conflictFile]}`.quiet();
  } catch {
    // Ignore errors
  }
}

export async function assertWorktreeExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    const output = await Bun.$`git -C ${[repoPath]} worktree list`.quiet().text();
    return output.includes(branchName);
  } catch {
    return false;
  }
}

export async function getWorktreePath(repoPath: string, branchName: string): Promise<string | null> {
  try {
    const output = await Bun.$`git -C ${[repoPath]} worktree list --porcelain`.quiet().text();
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes(branchName)) {
        const parts = line.split(/\s+/);
        return parts[1] || null;
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export async function parseJSONOutput(output: string): Promise<any> {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to parse JSON output: ${output}`);
  }
}

export async function runForestCommand(
  args: string[],
  options: { cwd?: string; json?: boolean } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const forestPath = `${import.meta.dir}/index.ts`;
  const cmd = ["bun", forestPath, ...args];
  if (options.json) {
    cmd.push("--json");
  }

  try {
    const result = await Bun.$`${cmd}`.cwd(options.cwd || process.cwd()).text();
    return {
      stdout: result,
      stderr: "",
      exitCode: 0,
    };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || "",
      exitCode: error.exitCode || 1,
    };
  }
}
