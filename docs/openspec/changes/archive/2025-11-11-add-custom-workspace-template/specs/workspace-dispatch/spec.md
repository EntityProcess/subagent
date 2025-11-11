## ADDED Requirements

### Requirement: Custom Workspace Template File During Dispatch

The system SHALL support dispatching agents with a custom workspace template file specified by path.

#### Scenario: Dispatch with custom workspace file

- **WHEN** user runs `subagent code chat "query" --workspace-template "C:\Users\User\custom.code-workspace"`
- **THEN** the system copies `C:\Users\User\custom.code-workspace` to the claimed subagent directory as `{subagent-name}.code-workspace` before launching VS Code

#### Scenario: Default workspace template used when not specified

- **WHEN** user runs `subagent code chat "query"` without `--workspace-template`
- **THEN** the system copies the default template from `src/vscode/subagent_template/subagent.code-workspace` (existing behavior)

### Requirement: Custom Workspace Template Validation

The system SHALL validate that the custom workspace template exists and is a readable file before provisioning.

#### Scenario: Missing custom workspace template

- **WHEN** the specified workspace template file does not exist
- **THEN** the system reports an error: "workspace template not found: {path}"

#### Scenario: Custom workspace template is a directory

- **WHEN** the specified workspace template path points to a directory instead of a file
- **THEN** the system reports an error: "workspace template must be a file, not a directory: {path}"

## REMOVED Requirements

### Requirement: Template Directory for Provisioning

**Reason**: The template directory option was never used in practice. Workspace files are now copied during dispatch (chat command) not provisioning, allowing workspace recycling with fresh configurations.

**Migration**: Users should use `--workspace-template` on the chat command to specify a workspace file, not during provisioning.

## MODIFIED Requirements

### Requirement: Workspace Configuration During Dispatch

The system SHALL copy the workspace configuration file during agent dispatch (chat command), not during provisioning, to support workspace recycling with fresh configurations.

#### Scenario: Workspace copied on each dispatch

- **WHEN** user runs `subagent code chat "query"` after a workspace has been unlocked and recycled
- **THEN** the system copies a fresh workspace file from the template before launching VS Code
