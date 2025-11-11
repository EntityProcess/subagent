# Change: Replace Template Directory with Workspace Template File

## Why

The current `--template` option accepts a directory path but is never actually used in practice because:
1. The default template directory is hardcoded and works for all cases
2. Users would need to recreate the entire directory structure just to customize the workspace file
3. The only file users actually want to customize is the `.code-workspace` file itself

Users need a simple way to specify a custom VS Code workspace configuration file that gets copied to each provisioned subagent, allowing organizations to standardize workspace settings, extensions, and folder configurations.

## What Changes

- **BREAKING**: Remove `--template` directory option from `provision` command
- Add `--workspace-template` option to `chat` command to accept a direct path to a custom `.code-workspace` file
- Copy the custom workspace file to the subagent workspace during dispatch (in `chat` command), not during provisioning
- Validate that the custom workspace template exists and is a valid file
- Fall back to default template when `--workspace-template` is not specified

## Impact

- **Affected specs**: `workspace-dispatch`
- **Affected code**: 
  - `src/vscode/agentDispatch.ts` - Update `copyAgentConfig()` to accept workspaceTemplate parameter
  - `src/cli.ts` - Remove `--template` from provision command, add `--workspace-template` to chat command
  - `src/vscode/provision.ts` - Remove templateDir parameter (no longer needed)
  - `src/vscode/constants.ts` - Keep DEFAULT_TEMPLATE_DIR for internal use only
- **Breaking changes**: **BREAKING** - `--template` option removed from provision command (but was unused in practice)
- **Migration**: Option was never documented as commonly used; users relying on default behavior are unaffected
