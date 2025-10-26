#!/usr/bin/env fish
# Fish completion for forest CLI

# Commands
complete -c forest -f -n "__fish_seen_subcommand_from" -d "Git worktree manager"
complete -c forest -n "__fish_use_subcommand" -a "list" -d "List all worktrees"
complete -c forest -n "__fish_use_subcommand" -a "add" -d "Create a new worktree"
complete -c forest -n "__fish_use_subcommand" -a "remove" -d "Remove a worktree"
complete -c forest -n "__fish_use_subcommand" -a "prune" -d "Prune stale worktrees"
complete -c forest -n "__fish_use_subcommand" -a "info" -d "Show worktree details"
complete -c forest -n "__fish_use_subcommand" -a "path" -d "Get path to worktree"
complete -c forest -n "__fish_use_subcommand" -a "switch" -d "Alias for path"
complete -c forest -n "__fish_use_subcommand" -a "config" -d "Manage configuration"
complete -c forest -n "__fish_use_subcommand" -a "lock" -d "Lock a worktree"
complete -c forest -n "__fish_use_subcommand" -a "unlock" -d "Unlock a worktree"
complete -c forest -n "__fish_use_subcommand" -a "help" -d "Show help"
complete -c forest -n "__fish_use_subcommand" -a "setup" -d "Setup shell integration"

# Global options
complete -c forest -f -l "version" -d "Show version"
complete -c forest -f -l "help" -d "Show help"
complete -c forest -s "h" -d "Show help"

# list command options
complete -c forest -n "__fish_seen_subcommand_from list" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from list" -l "help" -d "Show help"

# add command options
complete -c forest -n "__fish_seen_subcommand_from add" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from add" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from add" -a "(git branch --list 2>/dev/null | sed 's/^[* ]*//')" -d "Branch name"

# remove command options
complete -c forest -n "__fish_seen_subcommand_from remove" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from remove" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from remove" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

# path command options
complete -c forest -n "__fish_seen_subcommand_from path" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from path" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from path" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

# switch command options
complete -c forest -n "__fish_seen_subcommand_from switch" -l "json" -d "Output as JSON"
complete -c forest -n "__fish_seen_subcommand_from switch" -l "help" -d "Show help"
complete -c forest -n "__fish_seen_subcommand_from switch" -a "(forest list --json 2>/dev/null | jq -r '.data.worktrees[].branch' 2>/dev/null)" -d "Worktree branch"

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
