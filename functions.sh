#!/usr/bin/env bash
# Shell helper functions for forest CLI
# Source this file in your shell profile to enable helper functions

# fcd - Change directory to a worktree
fcd() {
  if [ -z "$1" ]; then
    echo "Usage: fcd <branch|path>"
    return 1
  fi
  
  local path
  path=$(forest path "$1" 2>/dev/null)
  
  if [ $? -ne 0 ] || [ -z "$path" ]; then
    echo "Error: Worktree not found: $1"
    return 1
  fi
  
  if [ ! -d "$path" ]; then
    echo "Error: Worktree path does not exist: $path"
    return 1
  fi
  
  cd "$path" || return 1
}

# fadd - Add worktree and change into it
fadd() {
  if [ -z "$1" ]; then
    echo "Usage: fadd <branch> [branch-name]"
    return 1
  fi
  
  if forest add "$@"; then
    local branch=$1
    local path
    path=$(forest path "$branch" 2>/dev/null)
    
    if [ -d "$path" ]; then
      cd "$path" || return 1
    fi
  else
    return 1
  fi
}

# fls - List worktrees (alias)
fls() {
  forest list "$@"
}

# frm - Remove current worktree and return to main repository
frm() {
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    return 1
  fi
  
  local current_path
  current_path=$(pwd)
  
  local main_worktree
  main_worktree=$(git rev-parse --show-toplevel 2>/dev/null)
  
  if [ -z "$main_worktree" ]; then
    echo "Error: Could not determine main worktree"
    return 1
  fi
  
  # Check if we're in a worktree (by checking git worktree list)
  if ! git worktree list | grep -q "^${current_path} "; then
    echo "Error: Not in a forest-managed worktree"
    return 1
  fi
  
  # Change to main worktree first
  cd "$main_worktree" || {
    echo "Error: Could not change to main worktree: $main_worktree"
    return 1
  }
  
  # Remove the worktree
  if forest remove "$current_path"; then
    echo "Returned to main worktree: $main_worktree"
    return 0
  else
    echo "Error: Failed to remove worktree"
    cd "$current_path" || true
    return 1
  fi
}

# fsync - Sync all worktrees with upstream
fsync() {
  forest sync "$@"
}

# Export functions (for subshells)
export -f fcd
export -f fadd
export -f fls
export -f frm
export -f fsync
