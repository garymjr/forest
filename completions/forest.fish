#!/usr/bin/env fish
# Fish completion for forest CLI

# Commands
complete -c forest -f -n "__fish_seen_subcommand_from" -d "Git worktree manager"
complete -c forest -n "__fish_use_subcommand" -a "list" -d "List all worktrees"
complete -c forest -n "__fish_use_subcommand" -a "ls" -d "Alias for list"
complete -c forest -n "__fish_use_subcommand" -a "add" -d "Create a new worktree"
complete -c forest -n "__fish_use_subcommand" -a "mk" -d "Alias for add"
complete -c forest -n "__fish_use_subcommand" -a "clone" -d "Clone a worktree from another's commit"
complete -c forest -n "__fish_use_subcommand" -a "remove" -d "Remove a worktree"
complete -c forest -n "__fish_use_subcommand" -a "rm" -d "Alias for remove"
complete -c forest -n "__fish_use_subcommand" -a "prune" -d "Prune stale worktrees"
complete -c forest -n "__fish_use_subcommand" -a "sync" -d "Pull updates across all worktrees"
complete -c forest -n "__fish_use_subcommand" -a "info" -d "Show worktree details"
complete -c forest -n "__fish_use_subcommand" -a "status" -d "Show comprehensive status"
complete -c forest -n "__fish_use_subcommand" -a "st" -d "Alias for status"
complete -c forest -n "__fish_use_subcommand" -a "groups" -d "List all worktree groups"
complete -c forest -n "__fish_use_subcommand" -a "path" -d "Get path to worktree"
complete -c forest -n "__fish_use_subcommand" -a "switch" -d "Alias for path"
complete -c forest -n "__fish_use_subcommand" -a "sw" -d "Alias for switch"
complete -c forest -n "__fish_use_subcommand" -a "config" -d "Manage configuration"
complete -c forest -n "__fish_use_subcommand" -a "lock" -d "Lock a worktree"
complete -c forest -n "__fish_use_subcommand" -a "unlock" -d "Unlock a worktree"
complete -c forest -n "__fish_use_subcommand" -a "help" -d "Show help"
complete -c forest -n "__fish_use_subcommand" -a "setup" -d "Setup shell integration"

# Global options
complete -c forest -f -l "version" -d "Show version"
complete -c forest -f -l "help" -d "Show help"
complete -c forest -s "h" -d "Show help"

# list/ls command options
complete -c forest -n "__fish_seen_subcommand_from list ls" -l "group" -d "Filter by namespace/group"
complete -c forest -n "__fish_seen_subcommand_from list ls" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from list ls" -l "help" -d "Show help"

# add/mk command options
complete -c forest -n "__fish_seen_subcommand_from add mk" -s "b" -d "Create new branch"
complete -c forest -n "__fish_seen_subcommand_from add mk" -l "new-branch" -d "Create new branch"
complete -c forest -n "__fish_seen_subcommand_from add mk" -l "from" -d "Base branch for new branch"
complete -c forest -n "__fish_seen_subcommand_from add mk" -l "group" -d "Explicitly set group"
complete -c forest -n "__fish_seen_subcommand_from add mk" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from add mk" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from add mk" -a "(git branch --list 2>/dev/null | sed 's/^[* ]*//')" -d "Branch name"

# clone command options
complete -c forest -n "__fish_seen_subcommand_from clone" -s "b" -d "Create new branch"
complete -c forest -n "__fish_seen_subcommand_from clone" -l "new-branch" -d "Create new branch"
complete -c forest -n "__fish_seen_subcommand_from clone" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from clone" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from clone" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

# remove/rm command options
complete -c forest -n "__fish_seen_subcommand_from remove rm" -l "force" -d "Force removal"
complete -c forest -n "__fish_seen_subcommand_from remove rm" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from remove rm" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from remove rm" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

# prune command options
complete -c forest -n "__fish_seen_subcommand_from prune" -l "all" -d "Remove all prunable worktrees"
complete -c forest -n "__fish_seen_subcommand_from prune" -l "dry-run" -d "Show what would be done"
complete -c forest -n "__fish_seen_subcommand_from prune" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from prune" -l "help" -d "Show help"

# sync command options
complete -c forest -n "__fish_seen_subcommand_from sync" -l "group" -d "Filter by namespace/group"
complete -c forest -n "__fish_seen_subcommand_from sync" -l "force" -d "Pull even if worktrees have changes"
complete -c forest -n "__fish_seen_subcommand_from sync" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from sync" -l "help" -d "Show help"

# status/st command options
complete -c forest -n "__fish_seen_subcommand_from status st" -l "group" -d "Filter by namespace/group"
complete -c forest -n "__fish_seen_subcommand_from status st" -l "all" -d "Show all worktrees including clean"
complete -c forest -n "__fish_seen_subcommand_from status st" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from status st" -l "help" -d "Show help"

# groups command options
complete -c forest -n "__fish_seen_subcommand_from groups" -l "verbose" -d "Show worktrees in each group"
complete -c forest -n "__fish_seen_subcommand_from groups" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from groups" -l "help" -d "Show help"

# path/switch/sw command options
complete -c forest -n "__fish_seen_subcommand_from path switch sw" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from path switch sw" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from path switch sw" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

# lock command options
complete -c forest -n "__fish_seen_subcommand_from lock" -l "reason" -d "Reason for locking"
complete -c forest -n "__fish_seen_subcommand_from lock" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from lock" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from lock" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

# unlock command options
complete -c forest -n "__fish_seen_subcommand_from unlock" -f -l "force" -d "Force unlock"
complete -c forest -n "__fish_seen_subcommand_from unlock" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from unlock" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from unlock" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

# info command options
complete -c forest -n "__fish_seen_subcommand_from info" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from info" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from info" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].path' 2>/dev/null)" -d "Worktree path"

# config command options
complete -c forest -n "__fish_seen_subcommand_from config" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from config" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from config" -n "not __fish_seen_subcommand_from get set reset" -a "get set reset" -d "Config action"

# setup command options
complete -c forest -n "__fish_seen_subcommand_from setup" -l "shell" -d "Shell type (bash, zsh, fish)"
complete -c forest -n "__fish_seen_subcommand_from setup" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from setup" -l "help" -d "Show help"
