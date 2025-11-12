# Workspace Dispatch

## MODIFIED Requirements

### Requirement: Workspace Path Resolution

The system SHALL transform workspace template folder paths during dispatch to ensure proper path resolution.

#### Scenario: Add subagent folder as first entry

- **WHEN** copying a workspace template during dispatch
- **THEN** the system inserts `{ "path": "." }` as the first folder entry AFTER resolving all template paths (this will resolve to the subagent directory when opened)

#### Scenario: Convert all relative paths to absolute

- **WHEN** the workspace template contains relative folder paths (e.g., `"./empty"` or `"."`) 
- **THEN** the system resolves these paths to absolute paths based on the template file's directory location

#### Scenario: Preserve absolute paths

- **WHEN** the workspace template contains absolute folder paths (e.g., `"C:/Projects/mylib"`)
- **THEN** the system preserves these paths without modification

#### Scenario: Template with relative path resolution

- **GIVEN** a template at `C:/Users/User/templates/my.code-workspace` containing:
  ```json
  {
    "folders": [
      { "path": "./empty" }
    ]
  }
  ```
- **WHEN** user runs `subagent code chat "query" --workspace-template "C:/Users/User/templates/my.code-workspace"`
- **THEN** the copied workspace file contains:
  ```json
  {
    "folders": [
      { "path": "." },
      { "path": "C:/Users/User/templates/empty" }
    ]
  }
  ```

#### Scenario: Template with dot path gets resolved

- **GIVEN** a template at `C:/Users/User/templates/my.code-workspace` containing:
  ```json
  {
    "folders": [
      { "path": "." },
      { "path": "./lib" }
    ]
  }
  ```
- **WHEN** the system copies this template
- **THEN** the copied workspace contains:
  ```json
  {
    "folders": [
      { "path": "." },
      { "path": "C:/Users/User/templates" },
      { "path": "C:/Users/User/templates/lib" }
    ]
  }
  ```
  Where the first `"."` refers to the subagent directory, and the original template's `"."` is resolved to the template's absolute path

#### Scenario: Default template with single dot path

- **GIVEN** the default template at `src/vscode/subagent_template/subagent.code-workspace` contains:
  ```json
  {
    "folders": [
      { "path": "." }
    ]
  }
  ```
- **WHEN** user runs `subagent code chat "query"` without `--workspace-template`
- **THEN** the workspace file contains:
  ```json
  {
    "folders": [
      { "path": "." },
      { "path": "<absolute-path-to-template-dir>" }
    ]
  }
  ```
  Where the first `"."` is the newly inserted subagent directory entry, and the second is the resolved template directory
