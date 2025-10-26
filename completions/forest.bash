#!/usr/bin/env bash
# Bash completion for forest CLI

_forest_complete() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local prev="${COMP_WORDS[COMP_CWORD-1]}"
  local cmd="${COMP_WORDS[1]}"
  
  # Main commands
  local commands="list add remove prune config path switch lock unlock info help"
  
  # Complete main command
  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return 0
  fi
  
  # Complete flags
  if [[ "$cur" == -* ]]; then
    case "$cmd" in
      list|info)
        COMPREPLY=($(compgen -W "--json --help" -- "$cur"))
        ;;
      add)
        COMPREPLY=($(compgen -W "--json --help" -- "$cur"))
        ;;
      remove|path|switch|lock|unlock)
        COMPREPLY=($(compgen -W "--json --help" -- "$cur"))
        ;;
      lock)
        COMPREPLY=($(compgen -W "--reason --json --help" -- "$cur"))
        ;;
      unlock)
        COMPREPLY=($(compgen -W "--force --json --help" -- "$cur"))
        ;;
      prune)
        COMPREPLY=($(compgen -W "--dry-run --json --help" -- "$cur"))
        ;;
      config)
        COMPREPLY=($(compgen -W "--json --help" -- "$cur"))
        ;;
    esac
    return 0
  fi
  
  # Complete arguments based on command
  case "$cmd" in
    add)
      if [ $COMP_CWORD -eq 2 ]; then
        # First arg: suggest branches
        local branches=$(git branch --list 2>/dev/null | sed 's/^[* ]*//' | tr '\n' ' ')
        COMPREPLY=($(compgen -W "$branches" -- "$cur"))
      fi
      ;;
    remove|path|switch|unlock)
      if [ $COMP_CWORD -eq 2 ]; then
        # Complete with worktree branches/paths
        local worktrees=$(forest list --json 2>/dev/null | grep -o '"branch":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
        COMPREPLY=($(compgen -W "$worktrees" -- "$cur"))
      fi
      ;;
    lock)
      if [ $COMP_CWORD -eq 2 ]; then
        local worktrees=$(forest list --json 2>/dev/null | grep -o '"branch":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
        COMPREPLY=($(compgen -W "$worktrees" -- "$cur"))
      elif [ "$prev" = "--reason" ]; then
        COMPREPLY=()
      fi
      ;;
    info)
      if [ $COMP_CWORD -eq 2 ]; then
        # Complete with worktree paths
        local paths=$(forest list --json 2>/dev/null | grep -o '"path":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
        COMPREPLY=($(compgen -W "$paths" -- "$cur"))
      fi
      ;;
    config)
      if [ $COMP_CWORD -eq 2 ]; then
        COMPREPLY=($(compgen -W "get set reset" -- "$cur"))
      elif [ $COMP_CWORD -eq 3 ]; then
        COMPREPLY=($(compgen -W "directory" -- "$cur"))
      fi
      ;;
    help)
      if [ $COMP_CWORD -eq 2 ]; then
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      fi
      ;;
  esac
}

complete -F _forest_complete forest
