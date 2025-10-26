#!/usr/bin/env bun

const VERSION = "0.6.0";

// Color utilities with NO_COLOR support
function getColors() {
  const noColor = Bun.env.NO_COLOR || process.argv.includes("--no-color");
  if (noColor) {
    return {
      green: "",
      red: "",
      yellow: "",
      cyan: "",
      gray: "",
      dim: "",
      reset: "",
      success: (text: string) => text,
      error: (text: string) => text,
      warning: (text: string) => text,
      info: (text: string) => text,
    };
  }
  return {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    dim: "\x1b[2m",
    reset: "\x1b[0m",
    success: (text: string) => `\x1b[32m${text}\x1b[0m`,
    error: (text: string) => `\x1b[31m${text}\x1b[0m`,
    warning: (text: string) => `\x1b[33m${text}\x1b[0m`,
    info: (text: string) => `\x1b[36m${text}\x1b[0m`,
  };
}

// Spinner for progress indication
class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;
  private message = "";
  private intervalId?: Timer;
  private isTTY = process.stdout.isTTY ?? false;

  start(message: string) {
    if (!this.isTTY || process.argv.includes("--no-progress")) return;
    this.message = message;
    this.frameIndex = 0;
    this.intervalId = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.frameIndex % this.frames.length]} ${this.message}`);
      this.frameIndex++;
    }, 80);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      process.stdout.write("\r");
    }
  }
}

const spinner = new Spinner();

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  locked: boolean;
  prunable: boolean;
}

interface WorktreeStatus extends Worktree {
  dirty: boolean;
  ahead: number;
  behind: number;
  conflicts: boolean;
  hasUpstream: boolean;
  stagedFiles: number;
  unstagedFiles: number;
  untrackedFiles: number;
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
const SHELL_SHARE_DIR = `${Bun.env.HOME}/.local/share/forest`;
const COMPLETION_DIR = `${Bun.env.HOME}/.local/share/bash-completion/completions`;
const ZSH_COMPLETION_DIR = `${Bun.env.HOME}/.local/share/zsh/site-functions`;
const FISH_COMPLETION_DIR = `${Bun.env.HOME}/.config/fish/completions`;
const SENSITIVE_PATHS = ["/", "/etc", "/usr", "/var", "/sys", "/proc", "/boot", "/dev", "/lib", "/sbin", "/bin"];

function isValidConfigPath(path: string): { valid: boolean; error?: string } {
  if (!path || path.trim().length === 0) {
    return { valid: false, error: "Path cannot be empty" };
  }
  if (path.length > 4096) {
    return { valid: false, error: "Path exceeds maximum length" };
  }
  if (path.includes("..")) {
    return { valid: false, error: "Path traversal (..) not allowed" };
  }
  if (path.includes("\0")) {
    return { valid: false, error: "Path contains null bytes" };
  }
  
  // Check if path is a sensitive system directory
  const normalizedPath = path.startsWith("~") ? `${Bun.env.HOME}${path.slice(1)}` : path;
  for (const sensitive of SENSITIVE_PATHS) {
    if (normalizedPath === sensitive || normalizedPath.startsWith(`${sensitive}/`)) {
      return { valid: false, error: "Cannot use system or sensitive directories" };
    }
  }
  
  return { valid: true };
}

function validateConfig(obj: unknown): { valid: boolean; error?: string; config?: Config } {
  if (!obj || typeof obj !== "object") {
    return { valid: false, error: "Config must be an object" };
  }
  
  const config = obj as Record<string, unknown>;
  if (typeof config.directory !== "string") {
    return { valid: false, error: "Config directory must be a string" };
  }
  
  const pathValidation = isValidConfigPath(config.directory);
  if (!pathValidation.valid) {
    return { valid: false, error: pathValidation.error };
  }
  
  return { valid: true, config: { directory: config.directory } };
}

function getConfig(): Config {
  try {
    const result = Bun.spawnSync(["cat", CONFIG_FILE]);
    const stdout: string = result.stdout instanceof Buffer ? result.stdout.toString() : (result.stdout as unknown as string) || "";
    if (stdout) {
      const parsed = JSON.parse(stdout);
      const validation = validateConfig(parsed);
      if (validation.valid && validation.config) {
        return validation.config;
      }
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
  try {
    await Bun.$`mkdir -p ${[CONFIG_DIR]}`.quiet();
  } catch (error) {
    // Ignore errors, directory might already exist
  }
}

async function getLastCommitMessage(path: string): Promise<string> {
  try {
    const message = await Bun.$`git -C ${[path]} log -1 --pretty=%s`.quiet().text();
    return message.trim();
  } catch (error) {
    return "";
  }
}

async function getRepoName(): Promise<string> {
  try {
    const remoteUrl = await Bun.$`git remote get-url origin`.quiet().text();
    let name = remoteUrl.trim();
    
    // Handle SSH URLs: git@github.com:user/repo.git
    if (name.includes("@")) {
      name = name.split("/").pop() || "";
    } else {
      // Handle HTTPS URLs: https://github.com/user/repo.git
      name = name.split("/").pop() || "";
    }
    
    // Remove .git suffix
    name = name.replace(/\.git$/, "").trim();
    if (name) return name;
  } catch (error) {
    // Fall through to use directory name
  }
  
  // Fallback: use git working directory name
  try {
    const dirResult = await Bun.$`git rev-parse --show-toplevel`.quiet().text();
    const topLevel = dirResult.trim();
    const dirName = topLevel.split("/").pop() || "repo";
    return dirName;
  } catch (error) {
    return "repo";
  }
}

function sanitizeBranchName(branch: string): string {
  // Replace slashes and other invalid filesystem chars with dashes
  const sanitized = branch.replace(/[\/\\:*?"<>|]/g, "-").replace(/^-+|-+$/g, "");
  // Ensure result is not empty after sanitization
  return sanitized || "branch";
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

async function resolveWorktreePath(branchOrPath: string): Promise<string> {
  if (!branchOrPath.includes("/")) {
    return await getWorktreePath(branchOrPath);
  }
  return branchOrPath;
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
  
  // Flags that accept space-separated values
  const valueFlags = new Set(["shell", "reason", "from"]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const eqIndex = key.indexOf("=");
      if (eqIndex > -1) {
        flags[key.slice(0, eqIndex)] = key.slice(eqIndex + 1);
      } else if (valueFlags.has(key) && i + 1 < args.length && !args[i + 1]?.startsWith("-")) {
        flags[key] = args[++i] ?? "";
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      // Handle -b as alias for new-branch
      if (key === "b") {
        flags["new-branch"] = true;
      } else {
        flags[key] = true;
      }
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

async function getWorktreeStatus(worktree: Worktree): Promise<WorktreeStatus> {
  const status: WorktreeStatus = {
    ...worktree,
    dirty: false,
    ahead: 0,
    behind: 0,
    conflicts: false,
    hasUpstream: false,
    stagedFiles: 0,
    unstagedFiles: 0,
    untrackedFiles: 0,
  };

  try {
    // Get git status
    const statusOutput = await Bun.$`git -C ${[worktree.path]} status --porcelain`.quiet().text();
    const statusLines = statusOutput.trim().split("\n").filter(Boolean);

    if (statusLines.length > 0) {
      status.dirty = true;
      for (const line of statusLines) {
        const stageStatus = line[0];
        const workStatus = line[1];
        
        if (stageStatus !== " " && stageStatus !== "?") {
          status.stagedFiles++;
        }
        if (workStatus !== " " && workStatus !== "?") {
          status.unstagedFiles++;
        }
        if (stageStatus === "?" && workStatus === "?") {
          status.untrackedFiles++;
        }
        if (stageStatus === "U" || workStatus === "U" || stageStatus === "D" || workStatus === "D") {
          status.conflicts = true;
        }
      }
    }

    // Check for upstream and ahead/behind
    try {
      const upstreamCheck = await Bun.$`git -C ${[worktree.path]} rev-parse --abbrev-ref @{upstream}`.quiet().text();
      if (upstreamCheck.trim()) {
        status.hasUpstream = true;
        
        try {
          const aheadBehind = await Bun.$`git -C ${[worktree.path]} rev-list --left-right --count @{upstream}...HEAD`.quiet().text();
          const parts = aheadBehind.trim().split("\t");
          status.behind = parseInt(parts[0] || "0") || 0;
          status.ahead = parseInt(parts[1] || "0") || 0;
        } catch (error) {
          // Ignore errors from rev-list
        }
      }
    } catch (error) {
      // No upstream configured
    }
  } catch (error) {
    // Silently fail - worktree might not exist or git command failed
  }

  return status;
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

    const colors = getColors();
    console.log("Git Worktrees:");
    console.log("─".repeat(80));

    spinner.start("Fetching worktree information...");
    
    for (const wt of worktrees) {
      spinner.stop();
      
      const status = await getWorktreeStatus(wt);
      const lastMsg = await getLastCommitMessage(wt.path);
      
      // Determine icon and color based on status
      let icon = colors.success("✓");
      if (status.conflicts) {
        icon = colors.error("✗");
      } else if (status.dirty) {
        icon = colors.warning("⚠");
      }

      // Build status flags
      const flags = [];
      if (wt.locked) flags.push(colors.warning("[locked]"));
      if (wt.prunable) flags.push(colors.error("[prunable]"));
      const flagStr = flags.length > 0 ? ` ${flags.join(" ")}` : "";

      console.log(`${icon} ${colors.cyan(wt.path)}${flagStr}`);
      console.log(`  ${colors.dim("Branch:")} ${wt.branch} ${colors.gray(`(${wt.commit})`)}${status.ahead > 0 || status.behind > 0 ? ` ${colors.yellow(`↑${status.ahead} ↓${status.behind}`)}` : ""}`);
      
      if (lastMsg) {
        console.log(`  ${colors.dim("Commit:")} ${lastMsg.substring(0, 60)}${lastMsg.length > 60 ? "..." : ""}`);
      }

      if (status.dirty || status.conflicts) {
        let dirtyStr = "";
        if (status.conflicts) {
          dirtyStr = colors.error(`CONFLICTS (${status.stagedFiles + status.unstagedFiles} files)`);
        } else {
          const parts = [];
          if (status.stagedFiles > 0) parts.push(`${status.stagedFiles} staged`);
          if (status.unstagedFiles > 0) parts.push(`${status.unstagedFiles} unstaged`);
          if (status.untrackedFiles > 0) parts.push(`${status.untrackedFiles} untracked`);
          dirtyStr = colors.warning(`dirty (${parts.join(", ")})`);
        }
        console.log(`  ${colors.dim("Status:")} ${dirtyStr}`);
      } else {
        console.log(`  ${colors.dim("Status:")} ${colors.success("clean")}`);
      }
    }

    console.log("─".repeat(80));
    return { success: true, data: { worktrees } };
  } catch (error) {
    spinner.stop();
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
  const newBranch = flags["new-branch"];
  const branchFrom = (flags.from as string) || "";

  if (!first) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required arguments",
        suggestion: "Usage: forest add <branch> [-b|--new-branch] [--from <base-branch>] or forest add <path> <branch>",
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
    
    // If second arg provided, use it as explicit branch name instead (don't recalculate path)
    if (second) {
      branch = second;
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
    const colors = getColors();
    spinner.start(`Creating worktree at ${path}...`);

    // Ensure parent directory exists
    const parentDir = path.split("/").slice(0, -1).join("/");
    if (parentDir) {
      await Bun.$`mkdir -p ${[parentDir]}`.quiet();
    }

    // If creating a new branch
    if (newBranch) {
      const baseRef = branchFrom || "HEAD";
      await Bun.$`git worktree add -b ${[branch]} ${[path]} ${[baseRef]}`.quiet();
    } else {
      await Bun.$`git worktree add ${[path]} ${[branch]}`.quiet();
    }

    spinner.stop();

    const result = {
      success: true,
      data: { message: `Worktree created: ${path} → ${branch}`, path, branch, new_branch: !!newBranch },
    };

    if (!flags.json) {
      console.log(colors.success(`✓ Worktree created: ${path} → ${branch}${newBranch ? " (new branch)" : ""}`));
    }

    return result;
  } catch (error) {
    spinner.stop();
    return {
      success: false,
      error: {
        code: "ADD_ERROR",
        message: `Failed to create worktree at ${path}`,
        suggestion: `Check that the path is valid and the branch exists${newBranch ? ", or use --from to specify a base branch" : ""}`,
      },
    };
  }
}

async function cmdClone(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  let [source, newBranch] = args;

  if (!source || !newBranch) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing required arguments",
        suggestion: "Usage: forest clone <source-branch|path> <new-branch> [-b|--new-branch]",
      },
    };
  }

  const newBranchFlag = flags["new-branch"];
  const targetPath = newBranch.includes("/") ? newBranch : await getWorktreePath(newBranch);

  const pathValidation = validatePath(targetPath);
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

  const branchValidation = validateBranch(newBranch);
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
    const colors = getColors();
    const sourcePath = await resolveWorktreePath(source);
    
    spinner.start(`Cloning worktree from ${sourcePath}...`);

    // Get the current commit of the source worktree
    const sourceCommit = await Bun.$`git -C ${[sourcePath]} rev-parse HEAD`.quiet().text();
    if (!sourceCommit.trim()) {
      spinner.stop();
      return {
        success: false,
        error: {
          code: "CLONE_ERROR",
          message: `Failed to get commit from source worktree at ${sourcePath}`,
          suggestion: "Check that the source worktree exists and is a valid git repository",
        },
      };
    }

    // Ensure parent directory exists
    const parentDir = targetPath.split("/").slice(0, -1).join("/");
    if (parentDir) {
      await Bun.$`mkdir -p ${[parentDir]}`.quiet();
    }

    // Create worktree at the source commit
    if (newBranchFlag) {
      // Create new branch from source commit
      const cleanBranch = newBranch.includes("/") ? newBranch.split("/").pop() || "branch" : newBranch;
      await Bun.$`git worktree add -b ${[cleanBranch]} ${[targetPath]} ${[sourceCommit.trim()]}`.quiet();
    } else {
      // Create detached HEAD at source commit
      await Bun.$`git worktree add ${[targetPath]} ${[sourceCommit.trim()]}`.quiet();
    }

    spinner.stop();

    const result = {
      success: true,
      data: { 
        message: `Worktree cloned: ${targetPath} → ${sourceCommit.trim().slice(0, 7)}${newBranchFlag ? ` (new branch: ${newBranch})` : " (detached)"}`, 
        path: targetPath, 
        branch: newBranchFlag ? newBranch : "detached",
        source_commit: sourceCommit.trim().slice(0, 7),
        source_path: sourcePath,
      },
    };

    if (!flags.json) {
      console.log(colors.success(`✓ Worktree cloned: ${targetPath}${newBranchFlag ? ` → ${newBranch} (from ${sourceCommit.trim().slice(0, 7)})` : ` (detached at ${sourceCommit.trim().slice(0, 7)})`}`));
    }

    return result;
  } catch (error) {
    spinner.stop();
    return {
      success: false,
      error: {
        code: "CLONE_ERROR",
        message: `Failed to clone worktree from ${source}`,
        suggestion: "Check that the source worktree exists and the destination path is valid",
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
        suggestion: "Usage: forest remove <branch|path> [--force]",
      },
    };
  }

  const path = await resolveWorktreePath(branchOrPath);

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
    const colors = getColors();
    const force = flags.force;

    // Check if worktree has uncommitted changes
    if (!force) {
      try {
        const worktrees = await getWorktrees();
        const worktree = worktrees.find((w) => w.path === path);
        if (worktree) {
          const status = await getWorktreeStatus(worktree);
          if (status.dirty) {
            return {
              success: false,
              error: {
                code: "DIRTY_WORKTREE",
                message: "Cannot remove worktree with uncommitted changes",
                suggestion: `Use ${colors.cyan("--force")} to remove anyway, or commit/stash changes first`,
              },
            };
          }
        }
      } catch (error) {
        // If we can't check status, continue with removal
      }
    }

    await Bun.$`git worktree remove ${[path]}${force ? " --force" : ""}`.quiet();

    const result = {
      success: true,
      data: { message: `Worktree removed: ${path}`, path },
    };

    if (!flags.json) {
      if (force) {
        console.log(colors.warning(`⚠ Removed worktree with uncommitted changes: ${path}`));
      } else {
        console.log(colors.success(`✓ Worktree removed: ${path}`));
      }
    }

    return result;
  } catch (error) {
    const colors = getColors();
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
    const colors = getColors();
    const dryRun = flags["dry-run"];
    spinner.start("Pruning worktrees...");

    const cmd = dryRun ? `git worktree prune --dry-run` : `git worktree prune`;
    const result = await Bun.$`${cmd}`.quiet().text();

    spinner.stop();

    const pruned = result
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim());

    const response = {
      success: true,
      data: { message: `Pruned ${pruned.length} worktree(s)`, count: pruned.length, dry_run: !!dryRun },
    };

    if (!flags.json) {
      console.log(colors.success(`✓ Pruned ${pruned.length} worktree(s)${dryRun ? " (dry run)" : ""}`));
      if (pruned.length > 0) {
        console.log("Removed:");
        pruned.forEach((p) => console.log(`  - ${p}`));
      }
    }

    return response;
  } catch (error) {
    spinner.stop();
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

async function cmdSync(flags: Record<string, boolean | string>): Promise<CommandResult> {
  try {
    const colors = getColors();
    const worktrees = await getWorktrees();
    const force = flags.force;
    const all = flags.all;
    
    const results = {
      synced: [] as string[],
      skipped: [] as { path: string; reason: string }[],
      failed: [] as { path: string; error: string }[],
    };

    for (let i = 0; i < worktrees.length; i++) {
      const wt = worktrees[i];
      spinner.start(`Syncing (${i + 1}/${worktrees.length}): ${wt.path.split("/").pop() || wt.path}...`);
      
      try {
        // Get status of the worktree
        const status = await getWorktreeStatus(wt);

        // Check if worktree is clean or force is enabled
        if (status.dirty && !force) {
          results.skipped.push({
            path: wt.path,
            reason: `has uncommitted changes (${status.stagedFiles + status.unstagedFiles} files)`,
          });
          continue;
        }

        // Check if it has upstream
        if (!status.hasUpstream) {
          results.skipped.push({
            path: wt.path,
            reason: "no upstream configured",
          });
          continue;
        }

        // If dirty and force, stash changes first
        if (status.dirty && force) {
          try {
            await Bun.$`git -C ${[wt.path]} stash`.quiet();
          } catch (error) {
            results.failed.push({
              path: wt.path,
              error: "failed to stash changes",
            });
            continue;
          }
        }

        // Pull the changes
        try {
          await Bun.$`git -C ${[wt.path]} pull`.quiet();
          results.synced.push(wt.path);
        } catch (error) {
          results.failed.push({
            path: wt.path,
            error: "pull failed",
          });
        }
      } catch (error) {
        results.failed.push({
          path: wt.path,
          error: "unexpected error",
        });
      }
    }

    spinner.stop();

    const response = {
      success: results.failed.length === 0,
      data: { results, summary: {
        total: worktrees.length,
        synced: results.synced.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
      }},
    };

    if (!flags.json) {
      console.log("Git Worktrees Sync:");
      console.log("─".repeat(80));
      
      if (results.synced.length > 0) {
        console.log(colors.success(`✓ Synced ${results.synced.length} worktree(s):`));
        results.synced.forEach((p) => console.log(`  - ${p}`));
      }

      if (results.skipped.length > 0) {
        console.log(colors.warning(`⊘ Skipped ${results.skipped.length} worktree(s):`));
        results.skipped.forEach((item) => console.log(`  - ${item.path} (${colors.dim(item.reason)})`));
      }

      if (results.failed.length > 0) {
        console.log(colors.error(`✗ Failed ${results.failed.length} worktree(s):`));
        results.failed.forEach((item) => console.log(`  - ${item.path} (${colors.dim(item.error)})`));
      }

      if (results.synced.length === 0 && results.failed.length === 0) {
        console.log("No worktrees to sync.");
      }
      
      console.log("─".repeat(80));
      console.log(colors.info(`Summary: ${results.synced.length} synced, ${results.skipped.length} skipped, ${results.failed.length} failed`));
    }

    return response;
  } catch (error) {
    spinner.stop();
    return {
      success: false,
      error: {
        code: "SYNC_ERROR",
        message: "Failed to sync worktrees",
        suggestion: "Ensure you are in a git repository",
      },
    };
  }
}

async function cmdStatus(flags: Record<string, boolean | string>): Promise<CommandResult> {
  try {
    const colors = getColors();
    const worktrees = await getWorktrees();
    const all = flags.all;
    
    spinner.start("Fetching worktree status...");
    const statuses = await Promise.all(worktrees.map((wt) => getWorktreeStatus(wt)));
    spinner.stop();
    
    const summary = {
      total: statuses.length,
      clean: statuses.filter((s) => !s.dirty && !s.conflicts).length,
      dirty: statuses.filter((s) => s.dirty && !s.conflicts).length,
      conflicts: statuses.filter((s) => s.conflicts).length,
      locked: statuses.filter((s) => s.locked).length,
    };

    const response = {
      success: true,
      data: { worktrees: statuses, summary },
    };

    if (!flags.json) {
      console.log("Git Worktrees Status:");
      console.log("─".repeat(80));
      
      for (const status of statuses) {
        let icon = colors.success("✓");
        if (status.conflicts) {
          icon = colors.error("✗");
        } else if (status.dirty) {
          icon = colors.warning("⚠");
        }
        
        const lockStr = status.locked ? ` ${colors.warning("[LOCKED]")}` : "";
        console.log(`${icon} ${colors.cyan(status.path)}${lockStr}`);
        console.log(`  ${colors.dim("Branch:")} ${status.branch} ${colors.gray(`(${status.commit})`)} `);
        
        const trackingStr = [];
        if (status.hasUpstream) {
          if (status.behind > 0) trackingStr.push(colors.warning(`↓${status.behind}`));
          if (status.ahead > 0) trackingStr.push(colors.info(`↑${status.ahead}`));
          if (trackingStr.length === 0) trackingStr.push(colors.success("✓ up-to-date"));
        } else {
          trackingStr.push(colors.error("✗ no upstream"));
        }
        
        if (status.dirty || status.conflicts) {
          let statusStr = "";
          if (status.conflicts) {
            statusStr = colors.error(`CONFLICTS (${status.stagedFiles + status.unstagedFiles} files)`);
          } else {
            const parts = [];
            if (status.stagedFiles > 0) parts.push(colors.info(`${status.stagedFiles} staged`));
            if (status.unstagedFiles > 0) parts.push(colors.warning(`${status.unstagedFiles} unstaged`));
            if (status.untrackedFiles > 0) parts.push(colors.dim(`${status.untrackedFiles} untracked`));
            statusStr = colors.warning(`DIRTY (${parts.join(", ")})`);
          }
          console.log(`  ${colors.dim("Status:")} ${trackingStr.join(" ")} | ${statusStr}`);
        } else if (all) {
          console.log(`  ${colors.dim("Status:")} ${trackingStr.join(" ")} | ${colors.success("clean")}`);
        }
      }
      
      console.log("─".repeat(80));
      console.log(
        colors.info(`Summary: ${summary.total} worktrees (${colors.success(summary.clean + " clean")}, ${colors.warning(summary.dirty + " dirty")}, ${colors.error(summary.conflicts + " conflicts")}${summary.locked > 0 ? `, ${colors.warning(summary.locked + " locked")}` : ""})`)
      );
    }

    return response;
  } catch (error) {
    spinner.stop();
    return {
      success: false,
      error: {
        code: "STATUS_ERROR",
        message: "Failed to get worktree status",
        suggestion: "Ensure you are in a git repository",
      },
    };
  }
}

const ALLOWED_CONFIG_KEYS = ["directory"];

async function cmdConfig(args: string[], flags: Record<string, boolean | string>): Promise<CommandResult> {
  const colors = getColors();
  const [action, key, ...valueParts] = args;
  const value = valueParts.join(" ");

  if (!action) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing action argument",
        suggestion: "Usage: forest config [get|set|reset] [key] [value]",
      },
    };
  }

  if (action === "reset") {
    try {
      await ensureConfigDir();
      const defaultConfig: Config = { directory: DEFAULT_WORKTREE_DIR };
      await saveConfig(defaultConfig);
      const result = { success: true, data: { message: "Config reset to defaults" } };
      if (!flags.json) {
        console.log(colors.success("✓ Config reset to defaults"));
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CONFIG_ERROR",
          message: "Failed to reset config",
          suggestion: "Check that config directory is writable",
        },
      };
    }
  }

  if (!key) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "Missing key argument",
        suggestion: "Usage: forest config [get|set] <key> [value]",
      },
    };
  }

  if (!ALLOWED_CONFIG_KEYS.includes(key)) {
    return {
      success: false,
      error: {
        code: "INVALID_KEY",
        message: `Unknown config key: ${key}`,
        suggestion: `Allowed keys: ${ALLOWED_CONFIG_KEYS.join(", ")}`,
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
        console.log(`${colors.dim(key + "=")}${configValue}`);
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

      // Validate path for directory key
      if (key === "directory") {
        const pathValidation = isValidConfigPath(value);
        if (!pathValidation.valid) {
          return {
            success: false,
            error: {
              code: "INVALID_VALUE",
              message: pathValidation.error || "Invalid directory path",
              suggestion: "Use a valid user directory path (avoid system directories)",
            },
          };
        }
      }

      (config as Record<string, any>)[key] = value;
      await saveConfig(config);
      const result = { success: true, data: { key, value } };
      if (!flags.json) {
        console.log(colors.success(`✓ Config updated: ${key}=${value}`));
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
    const path = await resolveWorktreePath(branchOrPath);
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
  const colors = getColors();
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
    const path = await resolveWorktreePath(branchOrPath);
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
      console.log(colors.success(`✓ Worktree locked: ${path}${reason ? ` ${colors.dim(`(${reason})`)}` : ""}`));
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
  const colors = getColors();
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
    const path = await resolveWorktreePath(branchOrPath);
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
      console.log(colors.success(`✓ Worktree unlocked: ${path}`));
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
  const colors = getColors();
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
      console.log(`${colors.dim("Worktree:")} ${colors.cyan(worktree.path)}`);
      console.log(`  ${colors.dim("Branch:")} ${worktree.branch}`);
      console.log(`  ${colors.dim("Commit:")} ${colors.yellow(worktree.commit)}`);
      console.log(`  ${colors.dim("Locked:")} ${worktree.locked ? colors.warning("yes") : "no"}`);
      console.log(`  ${colors.dim("Prunable:")} ${worktree.prunable ? colors.warning("yes") : "no"}`);
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

function detectShell(): string {
  const shell = Bun.env.SHELL || "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("fish")) return "fish";
  return "bash";
}

async function copyCompletionFiles(targetShell: string): Promise<{ files: string[] }> {
  const files: string[] = [];
  const sourceDir = import.meta.dir;

  try {
    if (targetShell === "bash" || targetShell === "all") {
      const bashSource = `${sourceDir}/completions/forest.bash`;
      const bashDest = `${COMPLETION_DIR}/forest`;
      await Bun.$`mkdir -p ${[COMPLETION_DIR]}`.quiet();
      await Bun.$`cp ${[bashSource]} ${[bashDest]}`.quiet();
      files.push(bashDest);
    }

    if (targetShell === "zsh" || targetShell === "all") {
      const zshSource = `${sourceDir}/completions/forest.zsh`;
      const zshDest = `${ZSH_COMPLETION_DIR}/_forest`;
      await Bun.$`mkdir -p ${[ZSH_COMPLETION_DIR]}`.quiet();
      await Bun.$`cp ${[zshSource]} ${[zshDest]}`.quiet();
      files.push(zshDest);
    }

    if (targetShell === "fish" || targetShell === "all") {
      const fishSource = `${sourceDir}/completions/forest.fish`;
      const fishDest = `${FISH_COMPLETION_DIR}/forest.fish`;
      await Bun.$`mkdir -p ${[FISH_COMPLETION_DIR]}`.quiet();
      await Bun.$`cp ${[fishSource]} ${[fishDest]}`.quiet();
      files.push(fishDest);
    }
  } catch (error) {
    throw new Error("Failed to copy completion files");
  }

  return { files };
}

async function copyFunctionsFile(): Promise<string> {
  const sourceDir = import.meta.dir;
  const functionsSource = `${sourceDir}/functions.sh`;
  const functionsDest = `${SHELL_SHARE_DIR}/functions.sh`;

  try {
    await Bun.$`mkdir -p ${[SHELL_SHARE_DIR]}`.quiet();
    await Bun.$`cp ${[functionsSource]} ${[functionsDest]}`.quiet();
    return functionsDest;
  } catch (error) {
    throw new Error("Failed to copy functions file");
  }
}

async function cmdSetup(flags: Record<string, boolean | string>): Promise<CommandResult> {
  let targetShell = (flags.shell as string) || detectShell();

  const validShells = ["bash", "zsh", "fish", "all"];
  if (!validShells.includes(targetShell)) {
    return {
      success: false,
      error: {
        code: "INVALID_SHELL",
        message: `Invalid shell: ${targetShell}`,
        suggestion: `Valid shells: ${validShells.join(", ")}`,
      },
    };
  }

  try {
    const completionResult = await copyCompletionFiles(targetShell);
    const functionsPath = await copyFunctionsFile();

    const profileHint = targetShell === "bash" ? "~/.bashrc" : targetShell === "zsh" ? "~/.zshrc" : "~/.config/fish/config.fish";
    const sourceCmd = targetShell === "fish" ? `source ${functionsPath}` : `source ${functionsPath}`;

    const result = {
      success: true,
      data: {
        message: "Shell integration installed successfully",
        shell: targetShell,
        completions: completionResult.files,
        functions: functionsPath,
        setup_instructions: `Add to your ${profileHint}:\n\n  ${sourceCmd}`,
      },
    };

    if (!flags.json) {
      const colors = getColors();
      console.log(colors.success("✓ Shell integration installed successfully!\n"));
      console.log("Completions installed:");
      completionResult.files.forEach((f) => console.log(`  - ${colors.cyan(f)}`));
      console.log(`\nHelper functions installed: ${colors.cyan(functionsPath)}\n`);

      console.log("Helper functions available:");
      console.log(`  ${colors.info("fcd <branch>")}       - Change to worktree directory`);
      console.log(`  ${colors.info("fadd <branch>")}      - Create worktree and cd into it`);
      console.log(`  ${colors.info("fls")}                - List all worktrees`);
      console.log(`  ${colors.info("frm")}                - Remove current worktree and return to main repo`);
      console.log(`  ${colors.info("fsync")}              - Sync all worktrees with upstream\n`);

      console.log(`To enable these, add to your ${colors.dim(profileHint)}:\n`);
      console.log(`  ${colors.yellow(`source ${functionsPath}`)}\n`);

      if (targetShell === "bash") {
        console.log(`Then restart your shell or run: ${colors.dim("source ~/.bashrc")}`);
      } else if (targetShell === "zsh") {
        console.log(`Then restart your shell or run: ${colors.dim("source ~/.zshrc")}`);
      } else if (targetShell === "fish") {
        console.log(`Then restart your shell or run: ${colors.dim("source ~/.config/fish/config.fish")}`);
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "SETUP_ERROR",
        message: "Failed to setup shell integration",
        suggestion: "Check that completion files exist and target directories are writable",
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
  clone <src> <dst> Create a worktree from another worktree's current commit state
  remove <branch>   Remove a worktree (or remove <path> for explicit path)
  prune             Prune stale worktrees
  sync              Pull updates across all worktrees
  info <path>       Show worktree details
  status            Show comprehensive status of all worktrees
  path <branch>     Get path to worktree (useful in scripts)
  switch <branch>   Alias for 'path'
  config            Manage configuration
  lock <branch>     Lock a worktree
  unlock <branch>   Unlock a worktree
  setup             Setup shell integration (completions, functions)
  help [command]    Show help

Options:
  --json            Output as JSON (works with all commands)
  --all             Show status for all worktrees including clean ones
  --dry-run         Show what would be done without doing it
  --version         Show version
  --help, -h        Show this help

Examples:
  forest add feature-x              # Creates at ~/.forest/worktrees/repo/feature-x/
  forest add feature-x -b           # Create new branch and worktree
  forest add feature-x -b --from main  # Create branch from 'main'
  forest add feature-x main         # Create worktree on existing 'main' branch
  forest add ./custom/path feature  # Create at explicit path
  forest clone feature-x feature-y -b  # Clone feature-x's commit to new branch feature-y
  forest remove feature-x
  forest status                     # Show status of all worktrees
  forest sync                       # Pull updates on all clean worktrees
  forest sync --force               # Pull even if worktrees have changes (stashes first)
  forest path feature-x              # Get path for shell integration
  cd $(forest path feature-x)
  forest config set directory ~/.my-worktrees
  forest lock feature-x --reason "WIP: debugging"
  forest list --json
  forest setup                      # Install shell completions

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

      add: `forest add <branch> [-b|--new-branch] [--from <base-branch>] [--json]

Create a new worktree in the central directory or at an explicit path.

Arguments:
  <branch>          Branch name (auto-generates path in central directory)

Options:
  -b, --new-branch  Create a new branch instead of checking out existing
  --from <branch>   Base branch for new branch (defaults to HEAD)
  --json            Output as JSON

Legacy usage: forest add <path> <branch>
  If first argument contains "/" or is an existing path, treats as explicit path.

Examples:
  forest add feature-x                    # Checkout existing branch
  forest add feature-x -b                 # Create new branch from HEAD
  forest add feature-x -b --from main     # Create new branch from main`,

      clone: `forest clone <source-branch|path> <new-branch> [-b|--new-branch] [--json]

Create a new worktree from another worktree's current commit state.

Arguments:
  <source-branch|path>  Source branch name or path to the worktree to clone from
  <new-branch>          New branch name or path for the new worktree

Options:
  -b, --new-branch      Create a new branch at the source commit (default: detached HEAD)
  --json                Output as JSON

Examples:
  forest clone feature-x feature-y          # Clone feature-x's commit to detached HEAD
  forest clone feature-x feature-y -b       # Clone feature-x's commit as new branch
  forest clone feature-x ./custom/path -b   # Clone to explicit path with new branch`,

      remove: `forest remove <branch|path> [--force] [--json]

Remove a worktree by branch name or explicit path.

Arguments:
  <branch|path>     Branch name or path to the worktree to remove

Options:
  --force   Remove worktree even if it has uncommitted changes
  --json    Output as JSON

Examples:
  forest remove feature-x           # Remove a worktree
  forest remove feature-x --force   # Remove worktree with uncommitted changes`,

      prune: `forest prune [--dry-run] [--json]

Remove worktree information for deleted directories.

Options:
  --dry-run    Show what would be pruned without pruning
  --json       Output as JSON`,

      sync: `forest sync [--force] [--json]

Pull updates from upstream on all worktrees.

Status indicators:
  ✓ Synced   - Successfully pulled updates
  ⊘ Skipped  - Worktree not synced (dirty or no upstream)
  ✗ Failed   - Sync failed with error

Options:
  --force    Pull even if worktree has uncommitted changes (stashes first)
  --json     Output as JSON

Examples:
  forest sync              # Sync clean worktrees only
  forest sync --force      # Sync all worktrees, stashing changes if needed
  forest sync --json       # Get structured JSON output`,

      info: `forest info <path> [--json]

Show detailed information about a specific worktree.

Arguments:
  <path>    Path to the worktree

Options:
  --json    Output as JSON`,

      status: `forest status [--all] [--json]

Show comprehensive git status for all worktrees, including:
  - Dirty/clean state (uncommitted changes)
  - Ahead/behind tracking (relative to upstream)
  - Untracked files
  - Merge conflicts

Status indicators:
  ✓ Clean worktree (no changes)
  ⚠ Dirty worktree (has uncommitted changes)
  ✗ Conflicts (merge conflicts present)
  [LOCKED] Worktree is locked

Tracking indicators:
  ↓N  Behind N commits from upstream
  ↑N  Ahead N commits from upstream
  ✗   No upstream configured

Options:
  --all    Show full status for all worktrees including clean ones
  --json   Output as JSON

Examples:
  forest status              # Show summary with problem worktrees
  forest status --all        # Show all worktrees with status
  forest status --json       # Get structured JSON output`,

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

      setup: `forest setup [--shell bash|zsh|fish|all] [--json]

Setup shell integration including completions and helper functions.

Shell helper functions available:
  fcd <branch>       - Change to worktree directory
  fadd <branch>      - Create worktree and cd into it
  fls                - List all worktrees
  frm                - Remove current worktree and return to main repo
  fsync [--force]    - Sync all worktrees with upstream

Options:
  --shell <shell>    Target shell (bash, zsh, fish, all; default: detect current)
  --json             Output as JSON

Examples:
  forest setup              # Auto-detect shell and setup
  forest setup --shell zsh  # Setup for zsh only
  forest setup --shell all  # Setup for all supported shells`,
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
      case "clone":
        result = await cmdClone(parsed.args, parsed.flags);
        break;
      case "remove":
        result = await cmdRemove(parsed.args, parsed.flags);
        break;
      case "prune":
        result = await cmdPrune(parsed.flags);
        break;
      case "sync":
        result = await cmdSync(parsed.flags);
        break;
      case "info":
        result = await cmdInfo(parsed.args, parsed.flags);
        break;
      case "status":
        result = await cmdStatus(parsed.flags);
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
      case "setup":
        result = await cmdSetup(parsed.flags);
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
