#!/usr/bin/env bun

const VERSION = "0.3.0";

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

interface Config {
  directory: string;
}

const CONFIG_DIR = `${Bun.env.HOME}/.config/forest`;
const CONFIG_FILE = `${CONFIG_DIR}/config.json`;
const DEFAULT_WORKTREE_DIR = `${Bun.env.HOME}/.forest/worktrees`;

function getConfig(): Config {
  try {
    // Try to read the file synchronously by spawning cat
    const result = Bun.spawnSync(["cat", CONFIG_FILE]);
    const stdout: string = result.stdout instanceof Buffer ? result.stdout.toString() : (result.stdout as unknown as string) || "";
    if (stdout) {
      return JSON.parse(stdout);
    }
  } catch (error) {
    // Return default if config doesn't exist or is invalid
  }
  return { directory: DEFAULT_WORKTREE_DIR };
}

async function saveConfig(config: Config): Promise<void> {
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function ensureConfigDir(): Promise<void> {
  const dir = Bun.file(CONFIG_DIR);
  if (!dir.exists()) {
    await Bun.$`mkdir -p ${[CONFIG_DIR]}`.quiet();
  }
}

async function getRepoName(): Promise<string> {
  try {
    const remoteUrl = await Bun.$`git remote get-url origin`.quiet().text();
    let name = remoteUrl.trim();
    
    // Handle SSH URLs: git@github.com:user/repo.git
    if (name.includes("@")) {
      name = name.split("/").pop() || "repo";
    } else {
      // Handle HTTPS URLs: https://github.com/user/repo.git
      name = name.split("/").pop() || "repo";
    }
    
    // Remove .git suffix
    name = name.replace(/\.git$/, "");
    return name || "repo";
  } catch (error) {
    return "repo";
  }
}

function sanitizeBranchName(branch: string): string {
  // Replace slashes and other invalid filesystem chars with dashes
  return branch.replace(/[\/\\:*?"<>|]/g, "-").replace(/^-+|-+$/g, "");
}

async function getWorktreePath(branchOrPath: string): Promise<string> {
  // If it looks like a path (contains /), use it as-is
  if (branchOrPath.includes("/")) {
    return branchOrPath;
  }
  
  // Otherwise, generate path from central directory
  const config = getConfig();
  const repoName = await getRepoName();
  const sanitized = sanitizeBranchName(branchOrPath);
  return `${config.directory}/${repoName}/${sanitized}`;
}

function parsePathToBranch(path: string): string {
  // Extract branch name from path like ~/.forest/worktrees/repo/branch-name
  const parts = path.split("/");
  return parts[parts.length - 1] || "branch";
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
  let [first, second] = args;

  // Determine if first arg is a path or branch name
  let path: string;
  let branch: string;

  if (!first) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required arguments",
        suggestion: "Usage: forest add <branch> [--path <path>] or forest add <path> <branch>",
      },
    };
  }

  // If first arg contains "/" treat as explicit path
  if (first.includes("/")) {
    if (!second) {
      return {
        success: false,
        error: {
          code: "INVALID_ARGS",
          message: "Branch name required when using explicit path",
          suggestion: "Usage: forest add <path> <branch>",
        },
      };
    }
    path = first;
    branch = second;
  } else {
    // Otherwise treat as branch name, generate path from central directory
    branch = first;
    path = await getWorktreePath(first);
    
    // If second arg provided, use it as explicit branch name instead
    if (second) {
      branch = second;
      path = await getWorktreePath(second);
    }
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
    // Ensure parent directory exists
    const parentDir = path.split("/").slice(0, -1).join("/");
    if (parentDir) {
      await Bun.$`mkdir -p ${[parentDir]}`.quiet();
    }

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
  const [branchOrPath] = args;

  if (!branchOrPath) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required argument",
        suggestion: "Usage: forest remove <branch|path>",
      },
    };
  }

  // Try to resolve branch name to path if it's not an explicit path
  let path = branchOrPath;
  if (!branchOrPath.includes("/")) {
    path = await getWorktreePath(branchOrPath);
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

async function cmdConfig(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const [action, key, ...valueParts] = args;
  const value = valueParts.join(" ");

  if (!action || !key) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required arguments",
        suggestion: "Usage: forest config [get|set|reset] [key] [value]",
      },
    };
  }

  try {
    await ensureConfigDir();
    const config = getConfig();

    if (action === "get") {
      const configValue = (config as Record<string, any>)[key];
      const result = { success: true, data: { key, value: configValue } };
      if (!flags.json) {
        console.log(`${key}=${configValue}`);
      }
      return result;
    } else if (action === "set") {
      if (!value) {
        return {
          success: false,
          error: {
            code: "INVALID_ARGS",
            message: "Value required for set operation",
            suggestion: "Usage: forest config set <key> <value>",
          },
        };
      }
      (config as Record<string, any>)[key] = value;
      await saveConfig(config);
      const result = { success: true, data: { key, value } };
      if (!flags.json) {
        console.log(`✓ Config updated: ${key}=${value}`);
      }
      return result;
    } else if (action === "reset") {
      const defaultConfig: Config = { directory: DEFAULT_WORKTREE_DIR };
      await saveConfig(defaultConfig);
      const result = { success: true, data: { message: "Config reset to defaults" } };
      if (!flags.json) {
        console.log("✓ Config reset to defaults");
      }
      return result;
    } else {
      return {
        success: false,
        error: {
          code: "INVALID_ACTION",
          message: `Unknown config action: ${action}`,
          suggestion: "Valid actions: get, set, reset",
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: "CONFIG_ERROR",
        message: "Failed to manage config",
        suggestion: "Check that config directory is writable",
      },
    };
  }
}

async function cmdPath(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const [branchOrPath] = args;

  if (!branchOrPath) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required argument",
        suggestion: "Usage: forest path <branch|path>",
      },
    };
  }

  try {
    let path = branchOrPath;
    if (!branchOrPath.includes("/")) {
      path = await getWorktreePath(branchOrPath);
    }

    const result = { success: true, data: { path } };
    if (!flags.json) {
      console.log(path);
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "PATH_ERROR",
        message: "Failed to resolve worktree path",
        suggestion: "Check that you are in a git repository",
      },
    };
  }
}

async function cmdLock(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const [branchOrPath] = args;

  if (!branchOrPath) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required argument",
        suggestion: "Usage: forest lock <branch|path>",
      },
    };
  }

  try {
    let path = branchOrPath;
    if (!branchOrPath.includes("/")) {
      path = await getWorktreePath(branchOrPath);
    }

    const reason = (flags.reason as string) || "";
    if (reason) {
      await Bun.$`git worktree lock ${[path]} --reason ${[reason]}`.quiet();
    } else {
      await Bun.$`git worktree lock ${[path]}`.quiet();
    }

    const result = {
      success: true,
      data: { message: `Worktree locked: ${path}`, path },
    };

    if (!flags.json) {
      console.log(`✓ Worktree locked: ${path}${reason ? ` (${reason})` : ""}`);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "LOCK_ERROR",
        message: `Failed to lock worktree`,
        suggestion: "Check that the worktree exists",
      },
    };
  }
}

async function cmdUnlock(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const [branchOrPath] = args;

  if (!branchOrPath) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required argument",
        suggestion: "Usage: forest unlock <branch|path>",
      },
    };
  }

  try {
    let path = branchOrPath;
    if (!branchOrPath.includes("/")) {
      path = await getWorktreePath(branchOrPath);
    }

    const force = flags.force;
    if (force) {
      await Bun.$`git worktree unlock ${[path]} --force`.quiet();
    } else {
      await Bun.$`git worktree unlock ${[path]}`.quiet();
    }

    const result = {
      success: true,
      data: { message: `Worktree unlocked: ${path}`, path },
    };

    if (!flags.json) {
      console.log(`✓ Worktree unlocked: ${path}`);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "UNLOCK_ERROR",
        message: `Failed to unlock worktree`,
        suggestion: "Check that the worktree exists and is locked",
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
  add <branch>      Create a new worktree (or add <path> <branch> for explicit path)
  remove <branch>   Remove a worktree (or remove <path> for explicit path)
  prune             Prune stale worktrees
  info <path>       Show worktree details
  path <branch>     Get path to worktree (useful in scripts)
  switch <branch>   Alias for 'path'
  config            Manage configuration
  lock <branch>     Lock a worktree
  unlock <branch>   Unlock a worktree
  help [command]    Show help

Options:
  --json            Output as JSON (works with all commands)
  --dry-run         Show what would be done without doing it
  --version         Show version
  --help, -h        Show this help

Examples:
  forest add feature-x              # Creates at ~/.forest/worktrees/repo/feature-x/
  forest add feature-x main         # Create worktree on 'main' branch
  forest add ./custom/path feature  # Create at explicit path
  forest remove feature-x
  forest path feature-x              # Get path for shell integration
  cd $(forest path feature-x)
  forest config set directory ~/.my-worktrees
  forest lock feature-x --reason "WIP: debugging"
  forest list --json

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

      add: `forest add <branch> [<branch-name>] [--json]

Create a new worktree in the central directory or at an explicit path.

Arguments:
  <branch>          Branch name (auto-generates path in central directory)
  <branch-name>     Optional: different branch name to checkout

Legacy usage: forest add <path> <branch>
  If first argument contains "/" or is an existing path, treats as explicit path.

Options:
  --json    Output as JSON`,

      remove: `forest remove <branch|path> [--json]

Remove a worktree by branch name or explicit path.

Arguments:
  <branch|path>     Branch name or path to the worktree to remove

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

      path: `forest path <branch|path> [--json]

Get the filesystem path for a worktree. Useful for shell integration.

Arguments:
  <branch|path>     Branch name or path to the worktree

Options:
  --json    Output as JSON

Examples:
  forest path feature-x
  cd $(forest path feature-x)`,

      switch: `forest switch <branch|path> [--json]

Alias for 'path' command. Get the filesystem path for a worktree.`,

      config: `forest config <action> <key> [value] [--json]

Manage forest configuration.

Actions:
  get <key>         Get configuration value
  set <key> <value> Set configuration value
  reset             Reset configuration to defaults

Options:
  --json    Output as JSON

Examples:
  forest config set directory ~/.my-worktrees
  forest config get directory
  forest config reset`,

      lock: `forest lock <branch|path> [--reason <reason>] [--json]

Lock a worktree to prevent accidental removal.

Arguments:
  <branch|path>     Branch name or path to the worktree

Options:
  --reason <reason>  Optional reason for locking
  --json             Output as JSON`,

      unlock: `forest unlock <branch|path> [--force] [--json]

Unlock a worktree.

Arguments:
  <branch|path>     Branch name or path to the worktree

Options:
  --force    Force unlock even if locked with a reason
  --json     Output as JSON`,
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
      case "config":
        result = await cmdConfig(parsed.args, parsed.flags);
        break;
      case "path":
        result = await cmdPath(parsed.args, parsed.flags);
        break;
      case "switch":
        result = await cmdPath(parsed.args, parsed.flags);
        break;
      case "lock":
        result = await cmdLock(parsed.args, parsed.flags);
        break;
      case "unlock":
        result = await cmdUnlock(parsed.args, parsed.flags);
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
