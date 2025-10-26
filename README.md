# forest

> A powerful git worktree manager that simplifies working with multiple branches simultaneously

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## What is Forest?

Forest is a command-line tool that simplifies managing multiple [git worktrees](https://git-scm.com/docs/git-worktree). Instead of manually juggling paths and remembering where each branch lives, forest automates worktree creation, organization, and status monitoring.

**Key Features:**

- 🌳 **Centralized management** - Organize all worktrees in one configurable directory
- 📦 **Namespace support** - Automatically organize worktrees by group (feature/, bugfix/, etc.)
- 📊 **Unified status** - See the status of all worktrees at once
- 🔄 **Batch operations** - Sync, lock, or check status across multiple worktrees
- 🐚 **Shell integration** - Helper functions for faster navigation
- 📜 **JSON output** - All commands support JSON for scripting and automation

**Use Cases:**

- Work on multiple features in parallel without context switching
- Keep pull requests in separate worktrees for easy testing
- Organize worktrees by team/project namespace
- Batch sync all worktrees with upstream
- Prevent accidental commits to the wrong branch

## Installation

### Quick Install (Recommended)

Install the pre-built binary:

```bash
curl -fsSL https://raw.githubusercontent.com/garymjr/forest/main/install.sh | bash
```

This downloads the latest binary for your platform (Linux x64, macOS ARM64) and installs it to `~/.local/bin/forest`.

### Install from Source

Requires [Bun](https://bun.sh):

```bash
git clone https://github.com/garymjr/forest.git
cd forest
bun install
bun run index.ts <command>

# Optional: Create a symlink for easier access
ln -s "$(pwd)/index.ts" ~/.local/bin/forest
```

### Setup Shell Integration

After installation, enable completions and helper functions:

```bash
forest setup
# or for a specific shell: forest setup --shell zsh
```

## Quick Start

### Create Your First Worktree

```bash
# Create a worktree for an existing branch
forest add existing-branch

# Create a new branch in a worktree (based on current HEAD)
forest add new-feature -b

# Create a new branch based on main
forest add bugfix -b --from main
```

### List All Worktrees

```bash
# Simple list
forest list

# Compact format
forest ls

# Detailed status
forest status
```

### Switch to a Worktree

```bash
# Print the path
cd $(forest path feature-x)

# Jump to it directly (requires shell integration)
fcd feature-x
```

### Remove a Worktree

```bash
# Remove a clean worktree
forest remove feature-x

# Remove even with uncommitted changes
forest remove feature-x --force
```

### Sync All Worktrees

```bash
# Pull updates on all clean worktrees
forest sync

# Include worktrees with changes (stashes first)
forest sync --force
```

## Common Workflows

### Workflow 1: Feature Development

You're starting work on a new feature. Create an isolated worktree:

```bash
# Create and enter the worktree
forest add feature/auth -b
cd $(forest path feature/auth)

# Make changes, commit
git add .
git commit -m "Add authentication"

# Push to upstream
git push -u origin feature/auth
```

Later, sync with upstream to keep it updated:

```bash
forest sync --group feature
```

### Workflow 2: Code Review & Testing

A colleague pushes a PR. Test it in isolation:

```bash
# Clone their commit state to a new worktree
forest clone origin/their-feature review/their-feature -b

# Test in the new worktree
cd $(forest path review/their-feature)
npm test

# Clean up after review
forest remove review/their-feature
```

### Workflow 3: Parallel Bug Fixes

Multiple bugs reported. Work on them in parallel:

```bash
# Create worktrees for different bugs
forest add bugfix/crash-on-load -b
forest add bugfix/memory-leak -b
forest add bugfix/ui-alignment -b

# Check status across all
forest status --group bugfix

# Sync all bugfix worktrees
forest sync --group bugfix
```

### Workflow 4: Organized Development

Use namespaces to organize your work:

```bash
# Create feature worktrees
forest add feature/auth -b
forest add feature/notifications -b

# Create experiment worktree
forest add experiment/new-ui -b --group experiment

# List by namespace
forest groups
forest list --group feature
forest list --group experiment

# Sync specific namespace
forest sync --group feature
```

### Workflow 5: Clean Up Before Standup

Before team sync, make sure everything is up-to-date:

```bash
# Check status of all work
forest status --all

# Sync everything
forest sync --force

# List any dirty worktrees that need attention
forest status | grep -i dirty
```

## Command Reference

| Command | Shortcut | Purpose |
|---------|----------|---------|
| `list` | `ls` | List all worktrees |
| `add` | `mk` | Create a new worktree |
| `clone` | - | Clone worktree from another's state |
| `remove` | `rm` | Remove a worktree |
| `status` | `st` | Show comprehensive status |
| `sync` | - | Pull updates across worktrees |
| `prune` | - | Clean up stale worktrees |
| `lock` | - | Lock a worktree (prevent removal) |
| `unlock` | - | Unlock a worktree |
| `info` | - | Show worktree details |
| `path` | - | Get worktree path (useful in scripts) |
| `switch` | `sw` | Alias for `path` |
| `config` | - | Manage configuration |
| `groups` | - | List all namespaces/groups |
| `setup` | - | Setup shell integration |

For detailed help on any command:

```bash
forest help <command>
```

## Advanced Features

### Namespace/Group Organization

Organize worktrees automatically using branch naming or explicit groups:

```bash
# Auto-detect from branch name (creates in feature/ namespace)
forest add feature/auth -b
forest add feature/payments -b

# Explicitly set group
forest add my-auth-work -b --group feature

# List by group
forest list --group feature
forest status --group feature
forest sync --group feature

# See all groups
forest groups
forest groups --verbose  # Include worktrees in each group
```

### Batch Operations

Perform operations across multiple worktrees:

```bash
# Sync all worktrees
forest sync

# Sync only a specific group
forest sync --group feature

# Sync with uncommitted changes (stashes them first)
forest sync --force

# Check status of everything
forest status --all

# Status for a specific group
forest status --group bugfix

# Prune stale worktrees
forest prune

# Remove all prunable worktrees (marked by git as broken)
forest prune --all
```

### Shell Integration

After running `forest setup`, you get helper functions:

```bash
# Jump to a worktree directory
fcd feature-auth

# Create a worktree and jump into it
fadd feature-new-api

# List all worktrees
fls

# Remove current worktree and return to main repo
frm

# Sync all worktrees
fsync

# Sync with force
fsync --force
```

### JSON Output for Scripting

All commands support `--json` for programmatic access:

```bash
# Get structured output
forest list --json

# Parse and use in scripts
forest status --json | jq '.data.worktrees[] | select(.status.dirty == true)'

# Example: Find all dirty worktrees
forest status --json --group feature | jq '.data.worktrees[] | select(.dirty == true) | .path'
```

### Configuration

Customize where forest stores worktrees:

```bash
# Set custom worktree directory
forest config set directory ~/.my-worktrees

# Check current settings
forest config get directory

# Reset to defaults
forest config reset
```

The configuration is stored at `~/.config/forest/config.json`.

## Troubleshooting

### Issue: "Cannot remove worktree with uncommitted changes"

**Problem:** You tried to remove a worktree but it has uncommitted work.

**Solutions:**

```bash
# Option 1: Commit or stash your changes first
git -C /path/to/worktree stash
forest remove my-feature

# Option 2: Force remove (WARNING: loses uncommitted work)
forest remove my-feature --force
```

### Issue: "Worktree has merge conflicts"

**Problem:** Status shows conflicts in a worktree.

**Solutions:**

```bash
# Navigate to the worktree and resolve conflicts
cd $(forest path conflicted-branch)
# Resolve conflicts manually or using:
git merge --abort    # Abort the merge
# or
git mergetool        # Use configured merge tool

# Then return and retry sync
forest sync
```

### Issue: "No upstream configured"

**Problem:** Trying to sync but worktree has no tracking branch.

**Solutions:**

```bash
# Set up tracking for the branch
git -C /path/to/worktree push -u origin branch-name

# Or in the worktree directly
cd $(forest path my-feature)
git push -u origin my-feature

# Then sync again
forest sync
```

### Issue: Worktree marked as "prunable"

**Problem:** Git sees the worktree as broken/stale.

**Solutions:**

```bash
# Check which worktrees are prunable
forest status

# Option 1: Prune them
forest prune

# Option 2: Remove them explicitly
forest prune --all

# Option 3: Remove individually
forest remove path/to/prunable/worktree --force
```

### Issue: Path conflicts between worktrees

**Problem:** Two worktrees trying to use the same path.

**Solutions:**

```bash
# Remove or rename the conflicting worktree first
forest remove conflicting-branch

# Use explicit paths to avoid conflicts
forest add ~/path/to/custom/location my-feature

# Or use explicit groups
forest add my-feature -b --group custom-group
```

### Issue: Accidental worktree removal

**Problem:** You removed a worktree and lost work.

**Recovery:**

```bash
# If the worktree was recently removed, the data may still be in .git
git worktree list --porcelain    # See if it still exists

# If you committed everything, you can restore from git history
git log --all --oneline | grep your-message

# Check git reflog
git reflog
```

### Issue: Shell integration not working

**Problem:** Helper functions (fcd, fadd, etc.) not available.

**Solutions:**

```bash
# Reinstall shell integration
forest setup

# Manually source the functions file
source ~/.local/share/forest/functions.sh

# Verify installation
echo $SHELL
forest setup --shell bash    # Reinstall for your shell

# For zsh, check ~/.zshrc contains the source line
grep "forest/functions.sh" ~/.zshrc

# For bash, check ~/.bashrc
grep "forest/functions.sh" ~/.bashrc
```

## Forest vs Git Worktree

Here's how forest compares to using `git worktree` directly:

| Feature | Plain `git worktree` | Forest |
|---------|-------------------|--------|
| **Create worktree** | `git worktree add path branch` | `forest add branch` |
| **Path management** | Manual path tracking | Automatic path generation |
| **Organization** | Flat directory structure | Namespace/group support |
| **List worktrees** | `git worktree list` | `forest list` (with colors, status) |
| **Status checking** | Check each worktree individually | `forest status` (unified view) |
| **Batch sync** | Write custom scripts | `forest sync` |
| **Batch operations** | Not built-in | `forest sync --group feature` |
| **Configuration** | Not applicable | `forest config` |
| **Shell helpers** | Not applicable | `fcd`, `fadd`, `fls`, `frm`, `fsync` |
| **JSON output** | Not applicable | All commands support `--json` |
| **Conflict checking** | Manual | Automatic detection in status |
| **Dirty worktree protection** | Manual with `--force` | Built-in safety checks |

### Example Comparison

**Scenario:** Create a feature branch worktree, add another, check status, then sync all.

**With plain git worktree:**

```bash
# Create worktrees (manual path management)
git worktree add ~/.worktrees/myproject/feature-auth feature/auth
git worktree add ~/.worktrees/myproject/feature-api feature/api

# List worktrees (minimal output)
git worktree list

# Check status of each individually
cd ~/.worktrees/myproject/feature-auth && git status
cd ~/.worktrees/myproject/feature-api && git status

# Sync each individually
cd ~/.worktrees/myproject/feature-auth && git pull
cd ~/.worktrees/myproject/feature-api && git pull
```

**With forest:**

```bash
# Create worktrees (automatic path management)
forest add feature/auth -b
forest add feature/api -b

# List with enhanced output (colors, status, commit messages)
forest list

# Check unified status
forest status

# Sync all at once
forest sync --group feature
```

## Configuration

Forest stores its configuration at `~/.config/forest/config.json`. Default settings:

```json
{
  "directory": "~/.forest/worktrees"
}
```

### Customizing Worktree Directory

By default, forest stores all worktrees in `~/.forest/worktrees`, organized by repository name and namespace. You can change this:

```bash
# Set custom directory
forest config set directory ~/.my-worktrees

# Verify
forest config get directory

# Reset to defaults
forest config reset
```

All new worktrees will be created in the configured directory with structure:

```
~/.forest/worktrees/
  my-repo/
    feature/
      auth/
      payments/
    bugfix/
      crash-fix/
    (root)/
      experimental/
```

### Setup for Different Shells

After installation, enable shell integration:

```bash
# Auto-detect your shell
forest setup

# Or specify shell explicitly
forest setup --shell bash
forest setup --shell zsh
forest setup --shell fish
forest setup --shell all

# Configuration files updated:
# - Bash: ~/.bashrc
# - Zsh: ~/.zshrc
# - Fish: ~/.config/fish/config.fish
```

## Usage in CI/CD

Forest's `--json` output makes it ideal for automation:

```bash
# Check all worktrees are clean
if forest status --json | jq -e '.data.summary.dirty > 0' >/dev/null; then
  echo "Worktrees have uncommitted changes"
  exit 1
fi

# Sync all and fail if any fail
if ! forest sync --json | jq -e '.success'; then
  echo "Sync failed"
  exit 1
fi

# Get all worktree paths for backup/archival
forest list --json | jq -r '.data.worktrees[].path'
```

## Performance Tips

- Use `--group` to limit operations to specific namespaces
- Use `--dry-run` with `prune` to preview changes before removing
- Use `--json` for fast parsing in scripts (avoids parsing colored output)
- Lock important worktrees to prevent accidental removal: `forest lock my-work --reason "Production fix"`

## Getting Help

- View all commands: `forest help`
- Help for specific command: `forest help <command>`
- Version info: `forest --version`
- Shell integration: `forest setup --help`

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT
