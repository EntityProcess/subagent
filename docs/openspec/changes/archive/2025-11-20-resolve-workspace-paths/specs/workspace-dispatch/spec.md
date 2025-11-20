# Workspace Dispatch

## MODIFIED Requirements

### Requirement: Workspace Path Resolution

The system SHALL transform workspace template folder paths and chat settings paths during dispatch to ensure proper path resolution.

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

#### Scenario: Resolve chat settings paths

- **WHEN** the workspace template contains relative paths in `chat.promptFilesLocations`, `chat.instructionsFilesLocations`, or `chat.modeFilesLocations` settings
- **THEN** the system resolves these paths to absolute paths based on the template file's directory location

#### Scenario: Template with chat settings and relative paths

- **GIVEN** a template at `C:/Users/User/templates/my.code-workspace` containing:
  ```json
  {
    "folders": [
      { "path": "./empty" }
    ],
    "settings": {
      "chat.promptFilesLocations": {
        "../../WTG.AI.Prompts/.github/prompts/**/*.prompt.md": true,
        "../../WTG.AI.Prompts/plugins/base/prompts/**/*.prompt.md": true
      },
      "chat.instructionsFilesLocations": {
        "../../WTG.AI.Prompts/plugins/base/instructions/**/*.instructions.md": true
      },
      "chat.modeFilesLocations": {
        "../../WTG.AI.Prompts/plugins/base/chatmodes/**/*.chatmode.md": true
      }
    }
  }
  ```
- **WHEN** the system copies this template
- **THEN** the copied workspace contains:
  ```json
  {
    "folders": [
      { "path": "." },
      { "path": "C:/Users/User/templates/empty" }
    ],
    "settings": {
      "chat.promptFilesLocations": {
        "C:/Users/WTG.AI.Prompts/.github/prompts/**/*.prompt.md": true,
        "C:/Users/WTG.AI.Prompts/plugins/base/prompts/**/*.prompt.md": true
      },
      "chat.instructionsFilesLocations": {
        "C:/Users/WTG.AI.Prompts/plugins/base/instructions/**/*.instructions.md": true
      },
      "chat.modeFilesLocations": {
        "C:/Users/WTG.AI.Prompts/plugins/base/chatmodes/**/*.chatmode.md": true
      }
    }
  }
  ```

#### Scenario: Preserve absolute paths in chat settings

- **WHEN** the workspace template contains absolute paths in chat settings (e.g., `"C:/Projects/prompts/**/*.prompt.md"`)
- **THEN** the system preserves these paths without modification
