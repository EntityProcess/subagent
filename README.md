# Subagent

Subagent is a CLI tool for managing workspace agents across different providers. It currently supports VS Code workspace agents with plans to add support for Azure AI Agents, GitHub Copilot CLI, OpenAI Codex and Claude Code.

## Features

### VS Code Workspace Agents

Manage isolated VS Code workspaces for parallel agent development sessions:

- **Provision subagents**: Create a pool of isolated workspace directories
- **Chat with agents**: Automatically claim a workspace and start a VS Code chat session
- **Lock management**: Prevent conflicts when running multiple agents in parallel

## Prerequisites

- Node.js 20+ 
- npm or pnpm
- VS Code installed for workspace agent functionality

## Quick Start

### Installation

```bash
# Install from npm
npm install -g subagent

# Or for development (install from source)
git clone <repo-url>
cd subagent
pnpm install
pnpm build
pnpm link --global
```

### Using VS Code Workspace Agents

1. **Provision and optionally warm up subagent workspaces**:
   ```bash
   subagent code provision --subagents 5 [--warmup]
   ```
   This creates 5 isolated workspace directories in `~/.subagent/vscode-agents/` (or `~/.subagent/vscode-insiders-agents/` for code-insiders). Add `--warmup` to open the newly provisioned workspaces immediately.

2. **Start a chat with an agent (async mode - default)**:
   ```bash
   subagent code chat "Your query here" [--prompt <prompt_file>]
   ```
   This claims an unlocked subagent, copies your prompt file (if provided) and any attachments, opens VS Code with a wakeup chatmode, and returns immediately.
   The agent writes its response to a file that you can monitor or read later.

3. **Start a chat with an agent (sync mode - wait for response)**:
   ```bash
   subagent code chat "Your query here" [--prompt <prompt_file>] --wait
   ```
   This blocks until the agent completes and prints the response to stdout.

4. **Use a custom workspace template**:
   ```bash
   subagent code chat "Your query here" --workspace-template ./my-workspace.code-workspace
   ```
   This uses a custom `.code-workspace` file with your preferred settings, extensions, and folder configurations.
   
   **Workspace Path Resolution**: When using a custom template, the system automatically:
   - Resolves all relative paths (including `"."`) in the template to absolute paths based on the template file's directory
   - Inserts `{ "path": "." }` as the first folder entry (which will resolve to the subagent directory when the workspace is opened)
   - Preserves absolute paths unchanged
   
   For example, if your template at `/home/user/templates/my-template.code-workspace` contains:
   ```json
   {
     "folders": [
       { "path": "./lib" },
       { "path": "/absolute/path" }
     ]
   }
   ```
   
   The resulting workspace file in the subagent directory will become:
   ```json
   {
     "folders": [
       { "path": "." },
       { "path": "/home/user/templates/lib" },
       { "path": "/absolute/path" }
     ]
   }
   ```
   
   This ensures that:
   - The subagent directory is always accessible (via the `"."` entry)
   - Template folders remain accessible at their original locations
   - You can reference shared libraries or resources from your template location

### Command Reference

**Provision subagents**:
```bash
subagent code provision --subagents <count> [--force] [--target-root <path>] [--warmup]
```
- `--subagents <count>`: Number of workspaces to create
- `--force`: Unlock and overwrite all subagent directories regardless of lock status
- `--target-root <path>`: Custom destination (default: `~/.subagent/vscode-agents` or `~/.subagent/vscode-insiders-agents` for code-insiders)
- `--dry-run`: Preview without making changes
- `--warmup`: Launch VS Code for the provisioned workspaces once provisioning finishes

**Warm up workspaces**:
```bash
subagent code warmup [--subagents <count>] [--target-root <path>] [--dry-run]
```
- `--subagents <count>`: Number of workspaces to open (default: 1)
- `--target-root <path>`: Custom subagent root directory (default: `~/.subagent/vscode-agents` or `~/.subagent/vscode-insiders-agents` for code-insiders)
- `--dry-run`: Show which workspaces would be opened

**Start a chat with an agent**:
```bash
subagent code chat <query> [--prompt <prompt_file>] [--workspace-template <path>] [--attachment <path>] [--wait] [--dry-run]
```
- `<query>`: User query to pass to the agent (required)
- `--prompt <prompt_file>`: Path to a prompt file to copy and attach (optional)
- `--workspace-template <path>`: Path to a custom .code-workspace file to use as template (optional)
- `--attachment <path>` / `-a`: Additional files to attach (repeatable)
- `--wait` / `-w`: Wait for response and print to stdout (sync mode). Default is async mode.
- `--dry-run`: Preview without launching VS Code

**Note**: By default, chat runs in **async mode** - it returns immediately after launching VS Code, and the agent writes its response to a timestamped file in the subagent's `messages/` directory. Use `--wait` for synchronous operation.

**List provisioned subagents**:
```bash
subagent code list [--target-root <path>] [--json]
```
- `--target-root <path>`: Custom subagent root directory (default: `~/.subagent/vscode-agents` or `~/.subagent/vscode-insiders-agents` for code-insiders)
- `--json`: Output results as JSON

**Unlock subagents**:
```bash
subagent code unlock [--subagent <name>] [--all] [--target-root <path>] [--dry-run]
```
- `--subagent <name>`: Specific subagent to unlock (e.g., `subagent-1`)
- `--all`: Unlock all subagents
- `--target-root <path>`: Custom subagent root directory (default: `~/.subagent/vscode-agents` or `~/.subagent/vscode-insiders-agents` for code-insiders)
- `--dry-run`: Show what would be unlocked without making changes

**VS Code Insiders Support**:

All commands are also available with `code-insiders` instead of `code`:
```bash
subagent code-insiders provision --subagents 3
subagent code-insiders chat "query" --prompt <prompt_file>
subagent code-insiders warmup
subagent code-insiders list
subagent code-insiders unlock --all
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode (uses tsx for direct TypeScript execution)
npm run dev -- code provision --subagents 1 --dry-run

# Link for local testing
npm link

# Run tests (once test suite is added)
npm test
```

## Project Structure

```
subagent/
├── src/
│   ├── cli.ts                      # Main CLI entry point
│   ├── utils/
│   │   ├── fs.ts                   # File system utilities
│   │   └── time.ts                 # Time utilities
│   └── vscode/
│       ├── agentDispatch.ts        # Agent dispatch and workspace management
│       ├── constants.ts            # Constants and default paths
│       ├── provision.ts            # Provisioning logic
│       └── subagent_template/      # Workspace template
│           ├── subagent.code-workspace
│           └── wakeup.chatmode.md
├── dist/                           # Compiled JavaScript output
├── package.json                    # Package configuration
├── tsconfig.json                   # TypeScript configuration
└── README.md                       # This file
```

## How It Works

### Subagent Architecture

Each subagent is an isolated VS Code workspace directory:
- Provisioned in `~/.subagent/vscode-agents/subagent-N/` (or `~/.subagent/vscode-insiders-agents/subagent-N/` for code-insiders)
- Contains a `.code-workspace` file
- Uses a `subagent.lock` file to prevent concurrent access
- Messages exchanged in a `messages/` subdirectory

### Workflow

1. **Provision**: Creates workspace directories from a template
2. **Lock**: When dispatching, claims the first unlocked subagent
3. **Launch**: Opens VS Code with the workspace and a chat session
4. **Execute**: Agent processes the query and writes results
5. **Unlock**: Agent signals completion by unlocking itself

### Async vs Sync Mode

- **Async (default)**: Returns immediately, agent works in background
- **Sync (`--wait`)**: Blocks until agent completes and prints response

## License

MIT - See LICENSE file for details.

## Contributing

This project is under active development. Contributions are welcome!