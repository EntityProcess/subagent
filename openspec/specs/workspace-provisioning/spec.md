# Workspace Provisioning

## Requirements

### Requirement: Default Template

The system SHALL provision subagent workspaces using a default template located at `src/vscode/subagent_template/`.

#### Scenario: Provision with default template

- **WHEN** user runs `subagent code provision --subagents 3`
- **THEN** the system copies `src/vscode/subagent_template/subagent.code-workspace` to each provisioned workspace directory

### Requirement: Template Directory

The system SHALL support provisioning from a custom template directory.

#### Scenario: Provision with custom template directory

- **WHEN** user runs `subagent code provision --subagents 3 --template /custom/path`
- **THEN** the system copies the workspace file from `/custom/path/subagent.code-workspace` to each provisioned workspace

### Requirement: Workspace File Copy

The system SHALL copy the workspace template file to each provisioned subagent directory with a name matching the directory.

#### Scenario: Workspace file naming

- **WHEN** provisioning subagent directory `subagent-1`
- **THEN** the workspace file is named `subagent-1.code-workspace`

#### Scenario: Multiple subagents provisioned

- **WHEN** provisioning 3 subagents
- **THEN** each workspace receives its own copy of the template workspace file

### Requirement: Template Validation

The system SHALL validate that the template directory exists and contains a valid workspace file before provisioning.

#### Scenario: Missing template directory

- **WHEN** the specified template directory does not exist
- **THEN** the system reports an error: "template path {path} is not a directory"

#### Scenario: Missing workspace template

- **WHEN** the template directory exists but lacks `subagent.code-workspace`
- **THEN** the system reports an error: "workspace template not found at {path}"
