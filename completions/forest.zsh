#compdef forest

# Zsh completion for forest CLI

_forest() {
  local -a commands state line
  
  commands=(
    "list:List all worktrees"
    "ls:Alias for list"
    "add:Create a new worktree"
    "mk:Alias for add"
    "clone:Create a worktree from another worktree's commit"
    "remove:Remove a worktree"
    "rm:Alias for remove"
    "prune:Prune stale worktrees"
    "sync:Pull updates across all worktrees"
    "info:Show worktree details"
    "status:Show comprehensive status of all worktrees"
    "st:Alias for status"
    "groups:List all worktree groups/namespaces"
    "path:Get path to worktree (useful in scripts)"
    "switch:Alias for path"
    "sw:Alias for switch"
    "config:Manage configuration"
    "lock:Lock a worktree"
    "unlock:Unlock a worktree"
    "setup:Setup shell integration"
    "help:Show help"
  )
  
  _arguments -C \
    '(-h --help)'{-h,--help}'[Show help]' \
    '--version[Show version]' \
    '1: :->cmd' \
    '*:: :->args'
  
  case $state in
    cmd)
      _describe 'command' commands
      ;;
    args)
      case $line[1] in
        list|ls)
          _arguments \
            '--group[Filter by namespace/group]:group:($(forest groups --json 2>/dev/null | grep -o "\"name\":\"[^\"]*\"" | cut -d"\"" -f4 | grep -v "(root)"))' \
            '--json[Output as JSON]' \
            '--help[Show help]'
          ;;
        add|mk)
          _arguments \
            '-b[Create new branch]' \
            '--new-branch[Create new branch]' \
            '--from[Base branch for new branch]:branch:($(git branch --list 2>/dev/null | sed "s/^[* ]*//'"))' \
            '--group[Explicitly set group]:group:($(forest groups --json 2>/dev/null | grep -o "\"name\":\"[^\"]*\"" | cut -d"\"" -f4 | grep -v "(root)"))' \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            '1:branch name:($(git branch --list 2>/dev/null | sed "s/^[* ]*//'"))'
          ;;
        clone)
          _arguments \
            '-b[Create new branch]' \
            '--new-branch[Create new branch]' \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            "1:source worktree:($(forest list --json 2>/dev/null | grep -o '\"branch\":\"[^\"]*\"' | cut -d'\"' -f4))" \
            '2:new branch name: '
          ;;
        remove|rm|path|switch|sw|unlock)
          _arguments \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            "1:worktree branch:($(forest list --json 2>/dev/null | grep -o '\"branch\":\"[^\"]*\"' | cut -d'\"' -f4))"
          ;;
        prune)
          _arguments \
            '--all[Remove all prunable worktrees]' \
            '--dry-run[Show what would be done]' \
            '--json[Output as JSON]' \
            '--help[Show help]'
          ;;
        sync)
          _arguments \
            '--group[Filter by namespace/group]:group:($(forest groups --json 2>/dev/null | grep -o "\"name\":\"[^\"]*\"" | cut -d"\"" -f4 | grep -v "(root)"))' \
            '--force[Pull even if worktrees have changes]' \
            '--json[Output as JSON]' \
            '--help[Show help]'
          ;;
        status|st)
          _arguments \
            '--group[Filter by namespace/group]:group:($(forest groups --json 2>/dev/null | grep -o "\"name\":\"[^\"]*\"" | cut -d"\"" -f4 | grep -v "(root)"))' \
            '--all[Show all worktrees including clean ones]' \
            '--json[Output as JSON]' \
            '--help[Show help]'
          ;;
        groups)
          _arguments \
            '--verbose[Show worktrees in each group]' \
            '--json[Output as JSON]' \
            '--help[Show help]'
          ;;
        lock)
          _arguments \
            '--reason[Reason for locking]:reason: ' \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            "1:worktree branch:($(forest list --json 2>/dev/null | grep -o '\"branch\":\"[^\"]*\"' | cut -d'\"' -f4))"
          ;;
        unlock)
          _arguments \
            '--force[Force unlock]' \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            "1:worktree branch:($(forest list --json 2>/dev/null | grep -o '\"branch\":\"[^\"]*\"' | cut -d'\"' -f4))"
          ;;
        info)
          _arguments \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            "1:worktree path:($(forest list --json 2>/dev/null | grep -o '\"path\":\"[^\"]*\"' | cut -d'\"' -f4))"
          ;;
        config)
          _arguments \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            '1:(get set reset)' \
            '2:(directory)'
          ;;
        setup)
          _arguments \
            '--shell[Target shell]:shell:(bash zsh fish all)' \
            '--json[Output as JSON]' \
            '--help[Show help]'
          ;;
        help)
          _describe 'command' commands
          ;;
      esac
      ;;
  esac
}

_forest "$@"
