#!/usr/bin/env bun

const VERSION = "0.2.0";

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  locked: boolean;
  prunable: boolean;
}

interface CommandResult {
  success: boolean;
  data?: any;
  error?: { code: string; message: string; suggestion?: string };
}

interface ParsedArgs {
  command?: string;
  args: string[];
  flags: Record<string, boolean | string>;
}

function validatePath(path: string): { valid: boolean; error?: string } {
  if (!path || path.trim().length === 0) {
    return { valid: false, error: "Path cannot be empty" };
  }
  if (path.length > 4096) {
    return { valid: false, error: "Path exceeds maximum length (4096 chars)" };
  }
  if (path.includes("\0")) {
    return { valid: false, error: "Path contains null bytes" };
  }
  return { valid: true };
}

function validateBranch(branch: string): { valid: boolean; error?: string } {
  if (!branch || branch.trim().length === 0) {
    return { valid: false, error: "Branch name cannot be empty" };
  }
  if (branch.length > 256) {
    return { valid: false, error: "Branch name exceeds maximum length (256 chars)" };
  }
  if (branch.includes("\0") || branch.includes("\n")) {
    return { valid: false, error: "Branch contains invalid characters" };
  }
  return { valid: true };
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const flags: Record<string, boolean | string> = {};
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const eqIndex = key.indexOf("=");
      if (eqIndex > -1) {
        flags[key.slice(0, eqIndex)] = key.slice(eqIndex + 1);
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      flags[key] = true;
    } else {
      positionalArgs.push(arg);
    }
  }

  return {
    command: positionalArgs[0],
    args: positionalArgs.slice(1),
    flags,
  };
}

async function getWorktrees(): Promise<Worktree[]> {
  try {
    const output = await Bun.$`git worktree list --porcelain`.quiet().text();
    const lines = output.trim().split("\n").filter(Boolean);

    const worktrees: Worktree[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line || !line.startsWith("worktree")) {
        i++;
        continue;
      }

      const parts = line.split(/\s+/);
      const path = parts[1] || "";

      let branch = "";
      let commit = "";
      let locked = false;
      let prunable = false;

      // Parse remaining parts of worktree line
      for (let j = 2; j < parts.length; j++) {
        const part = parts[j];
        if (!part) continue;
        
        if (part.startsWith("branch")) {
          const branchRef = part.replace(/^branch\s/, "");
          branch = branchRef.replace(/^.*\//, "");
        } else if (part === "detached") {
          branch = "detached";
        } else if (part === "locked") {
          locked = true;
        } else if (part === "prunable") {
          prunable = true;
        } else if (/^[a-f0-9]{7,}$/.test(part)) {
          commit = part.slice(0, 7);
        }
      }

      // Look for commit on next line if not found on worktree line
      if (!commit && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.startsWith("detached")) {
          const match = nextLine.match(/([a-f0-9]{7,})/);
          if (match?.[1]) {
            commit = match[1].slice(0, 7);
          }
          i++;
        }
      }

      worktrees.push({ path, branch, commit, locked, prunable });
      i++;
    }

    return worktrees;
  } catch (error) {
    return [];
  }
}

async function cmdList(flags: Record<string, boolean | string>): Promise<CommandResult> {
  try {
    const worktrees = await getWorktrees();
    const json = flags.json;

    if (json) {
      return {
        success: true,
        data: { worktrees },
      };
    }

    if (worktrees.length === 0) {
      console.log("No worktrees found.");
      return { success: true, data: { worktrees: [] } };
    }

    console.log("Git Worktrees:");
    console.log("─".repeat(60));
    for (const wt of worktrees) {
      const status = [];
      if (wt.locked) status.push("locked");
      if (wt.prunable) status.push("prunable");
      const statusStr = status.length > 0 ? ` [${status.join(", ")}]` : "";
      console.log(`${wt.path}`);
      console.log(`  Branch: ${wt.branch} (${wt.commit})${statusStr}`);
    }

    return { success: true, data: { worktrees } };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "LIST_ERROR",
        message: "Failed to list worktrees",
        suggestion: "Ensure you are in a git repository",
      },
    };
  }
}

async function cmdAdd(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const [path, branch] = args;

  if (!path || !branch) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required arguments",
        suggestion: "Usage: forest add <path> <branch>",
      },
    };
  }

  const pathValidation = validatePath(path);
  if (!pathValidation.valid) {
    return {
      success: false,
      error: {
        code: "INVALID_PATH",
        message: pathValidation.error || "Invalid path",
        suggestion: "Check that the path is valid and safe",
      },
    };
  }

  const branchValidation = validateBranch(branch);
  if (!branchValidation.valid) {
    return {
      success: false,
      error: {
        code: "INVALID_BRANCH",
        message: branchValidation.error || "Invalid branch name",
        suggestion: "Check that the branch name is valid",
      },
    };
  }

  try {
    await Bun.$`git worktree add ${[path]} ${[branch]}`.quiet();

    const result = {
      success: true,
      data: { message: `Worktree created: ${path} → ${branch}`, path, branch },
    };

    if (!flags.json) {
      console.log(`✓ Worktree created: ${path} → ${branch}`);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "ADD_ERROR",
        message: `Failed to create worktree at ${path}`,
        suggestion: "Check that the path is valid and the branch exists",
      },
    };
  }
}

async function cmdRemove(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const [path] = args;

  if (!path) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required argument",
        suggestion: "Usage: forest remove <path>",
      },
    };
  }

  const pathValidation = validatePath(path);
  if (!pathValidation.valid) {
    return {
      success: false,
      error: {
        code: "INVALID_PATH",
        message: pathValidation.error || "Invalid path",
        suggestion: "Check that the path is valid and safe",
      },
    };
  }

  try {
    await Bun.$`git worktree remove ${[path]}`.quiet();

    const result = {
      success: true,
      data: { message: `Worktree removed: ${path}`, path },
    };

    if (!flags.json) {
      console.log(`✓ Worktree removed: ${path}`);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "REMOVE_ERROR",
        message: `Failed to remove worktree at ${path}`,
        suggestion: "Check that the path exists and is not the main worktree",
      },
    };
  }
}

async function cmdPrune(flags: Record<string, boolean | string>): Promise<CommandResult> {
  try {
    const dryRun = flags["dry-run"];
    const cmd = dryRun ? `git worktree prune --dry-run` : `git worktree prune`;
    const result = await Bun.$`${cmd}`.quiet().text();

    const pruned = result
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim());

    const response = {
      success: true,
      data: { message: `Pruned ${pruned.length} worktree(s)`, count: pruned.length, dry_run: !!dryRun },
    };

    if (!flags.json) {
      console.log(`✓ Pruned ${pruned.length} worktree(s)${dryRun ? " (dry run)" : ""}`);
      if (pruned.length > 0) {
        console.log("Removed:");
        pruned.forEach((p) => console.log(`  - ${p}`));
      }
    }

    return response;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "PRUNE_ERROR",
        message: "Failed to prune worktrees",
        suggestion: "Ensure you are in a git repository",
      },
    };
  }
}

async function cmdInfo(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const [path] = args;

  if (!path) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required argument",
        suggestion: "Usage: forest info <path>",
      },
    };
  }

  try {
    const worktrees = await getWorktrees();
    const worktree = worktrees.find((w) => w.path === path);

    if (!worktree) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Worktree not found: ${path}`,
          suggestion: "Use 'forest list' to see available worktrees",
        },
      };
    }

    const result = { success: true, data: worktree };

    if (!flags.json) {
      console.log(`Worktree: ${worktree.path}`);
      console.log(`  Branch: ${worktree.branch}`);
      console.log(`  Commit: ${worktree.commit}`);
      console.log(`  Locked: ${worktree.locked}`);
      console.log(`  Prunable: ${worktree.prunable}`);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "INFO_ERROR",
        message: "Failed to get worktree info",
        suggestion: "Ensure you are in a git repository",
      },
    };
  }
}

function showHelp(command?: string): void {
  if (!command) {
    console.log(`forest v${VERSION} - Git worktree manager

Usage: forest <command> [options]

Commands:
  list              List all worktrees
  add <path> <branch>
                    Create a new worktree
  remove <path>     Remove a worktree
  prune             Prune stale worktrees
  info <path>       Show worktree details
  help [command]    Show help

Options:
  --json            Output as JSON (works with all commands)
  --dry-run         Show what would be done without doing it
  --verbose, -v     Show verbose output
  --version         Show version
  --help, -h        Show this help

Examples:
  forest list --json
  forest add ./feature-x feat/new-feature
  forest remove ./old-worktree
  forest prune --dry-run
  forest info ./my-worktree --json

For AI agents: All commands support --json flag for structured output.
Exit codes: 0=success, 1=error, 2=validation error
`);
  } else {
    const help: Record<string, string> = {
      list: `forest list [--json]

List all git worktrees in the current repository.

Options:
  --json    Output as JSON

JSON output includes array of worktrees with path, branch, commit, locked, prunable.`,

      add: `forest add <path> <branch> [--json]

Create a new worktree at the specified path on the given branch.

Arguments:
  <path>    Directory path for the new worktree
  <branch>  Branch to checkout (can be remote)

Options:
  --json    Output as JSON`,

      remove: `forest remove <path> [--json]

Remove a worktree at the specified path.

Arguments:
  <path>    Path to the worktree to remove

Options:
  --json    Output as JSON`,

      prune: `forest prune [--dry-run] [--json]

Remove worktree information for deleted directories.

Options:
  --dry-run    Show what would be pruned without pruning
  --json       Output as JSON`,

      info: `forest info <path> [--json]

Show detailed information about a specific worktree.

Arguments:
  <path>    Path to the worktree

Options:
  --json    Output as JSON`,
    };

    console.log(help[command] || `Unknown command: ${command}`);
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs();

  if (parsed.flags.version) {
    console.log(`forest v${VERSION}`);
    process.exit(0);
  }

  if (parsed.flags.help || parsed.flags.h) {
    showHelp(parsed.command);
    process.exit(0);
  }

  const isJsonOutput = !!parsed.flags.json;

  let result: CommandResult | undefined;

  try {
    switch (parsed.command) {
      case "list":
        result = await cmdList(parsed.flags);
        break;
      case "add":
        result = await cmdAdd(parsed.args, parsed.flags);
        break;
      case "remove":
        result = await cmdRemove(parsed.args, parsed.flags);
        break;
      case "prune":
        result = await cmdPrune(parsed.flags);
        break;
      case "info":
        result = await cmdInfo(parsed.args, parsed.flags);
        break;
      case "help":
        showHelp(parsed.args[0]);
        process.exit(0);
        break;
      case undefined:
        showHelp();
        process.exit(0);
        break;
      default:
        if (isJsonOutput) {
          console.log(JSON.stringify({ success: false, error: { code: "UNKNOWN_COMMAND", message: `Unknown command: ${parsed.command}` } }));
        } else {
          console.log(`Unknown command: ${parsed.command}`);
          showHelp();
        }
        process.exit(2);
    }
  } catch (error) {
    const errorResult: CommandResult = {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", suggestion: "Check your git repository and try again" },
    };
    result = errorResult;
  }

  if (result) {
    if (isJsonOutput) {
      console.log(JSON.stringify(result));
    }
    process.exit(result.success ? 0 : 1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
