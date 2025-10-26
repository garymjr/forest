#compdef forest

# Zsh completion for forest CLI

_forest() {
  local -a commands state line
  
  commands=(
    "list:List all worktrees"
    "add:Create a new worktree"
    "remove:Remove a worktree"
    "prune:Prune stale worktrees"
    "info:Show worktree details"
    "path:Get path to worktree (useful in scripts)"
    "switch:Alias for path"
    "config:Manage configuration"
    "lock:Lock a worktree"
    "unlock:Unlock a worktree"
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
        list)
          _arguments \
            '--json[Output as JSON]' \
            '--help[Show help]'
          ;;
        add)
          _arguments \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            '1:branch name:($(git branch --list 2>/dev/null | sed "s/^[* ]*//'))'
          ;;
        remove|path|switch|unlock)
          _arguments \
            '--json[Output as JSON]' \
            '--help[Show help]' \
            "1:worktree branch:($(forest list --json 2>/dev/null | grep -o '\"branch\":\"[^\"]*\"' | cut -d'\"' -f4))"
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
        help)
          _describe 'command' commands
          ;;
      esac
      ;;
  esac
}

_forest "$@"
