# Subagent Project

## Overview

Subagent is a CLI tool for managing workspace agents across different backends. It currently supports VS Code workspace agents with plans to add support for OpenAI Agents, Azure AI Agents, GitHub Copilot CLI and Codex CLI.

## Technology Stack

- **Language**: TypeScript 5.x targeting ES2022
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **Build**: TypeScript compiler with tsup
- **Testing**: Vitest
- **CLI Framework**: Commander.js

## Project Structure

```
subagent/
├── src/
│   ├── cli.ts                      # Main CLI entry point
│   ├── utils/
│   │   ├── fs.ts                   # File system utilities
│   │   ├── time.ts                 # Time utilities
│   │   ├── logger.ts               # Logging utilities
│   │   └── config.ts               # Configuration management
│   └── vscode/
│       ├── agentDispatch.ts        # Agent dispatch and workspace management
│       ├── constants.ts            # Constants and default paths
│       ├── provision.ts            # Provisioning logic
│       └── subagent_template/      # Workspace template
│           ├── subagent.code-workspace
│           └── wakeup.chatmode.md
├── dist/                           # Compiled JavaScript output
├── tests/                          # Test files
└── openspec/                       # Specifications and changes
```

## Architecture

Each subagent is an isolated VS Code workspace directory:
- Provisioned in `~/.subagent/vscode-agents/subagent-N/` (or `~/.subagent/vscode-insiders-agents/subagent-N/` for code-insiders)
- Contains a `.code-workspace` file
- Uses a `subagent.lock` file to prevent concurrent access
- Messages exchanged in a `messages/` subdirectory

## Development Workflow

1. **Provision**: Creates workspace directories from a template
2. **Lock**: When dispatching, claims the first unlocked subagent
3. **Launch**: Opens VS Code with the workspace and a chat session
4. **Execute**: Agent processes the query and writes results
5. **Unlock**: Agent signals completion by unlocking itself

## Conventions

### Naming
- Use kebab-case for file and directory names
- Use camelCase for TypeScript identifiers
- Prefix subagent directories with `subagent-` followed by a number

### File Organization
- Template files in `src/vscode/subagent_template/`
- Utilities in `src/utils/`
- Backend-specific code in `src/{backend}/`

### Configuration
- Default workspace root: `~/.subagent/{backend}-agents/`
- Lock file name: `subagent.lock`
- Workspace file name: `{subagent-name}.code-workspace`

### Error Handling
- Use descriptive error messages
- Provide actionable hints for common errors
- Return appropriate exit codes (0 for success, 1 for errors)

### Testing
- Test files alongside implementation in `tests/`
- Use `.test.ts` extension
- Mock file system operations where appropriate
