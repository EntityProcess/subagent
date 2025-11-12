# Resolve Workspace Paths

## Problem

Currently, when dispatching a subagent, the `copyAgentConfig` function simply copies the workspace template file to the subagent directory without modifying its contents. If the template workspace contains relative paths (e.g., `"path": "./empty"`), these paths remain relative in the copied workspace file, which can lead to incorrect workspace folder resolution.

Additionally, when additional folders are present in the template, there's no mechanism to ensure the subagent folder is accessible or to convert relative paths to absolute paths based on the template's location.

## Current Behavior

When using a workspace template like:
```json
{
  "folders": [
    {
      "path": "./empty"
    }
  ]
}
```

The system copies this file as-is to the subagent workspace, resulting in relative paths that resolve from the subagent directory location rather than the template's original location.

## Desired Behavior

When copying a workspace template, the system should:

1. **Resolve all relative paths to absolute**: Convert any relative paths in the template (including `"."`) to absolute paths based on the template file's directory location
2. **Add subagent folder as first entry**: Insert `{ "path": "." }` as the first folder entry (this will resolve to the subagent directory when the workspace file is opened from the subagent location)

For example, if the template at `C:/Users/Christopher.Tso/templates/my-template.code-workspace` contains:
```json
{
  "folders": [
    {
      "path": "./empty"
    }
  ]
}
```

The resulting workspace file in the subagent directory should become:
```json
{
  "folders": [
    {
      "path": "."
    },
    {
      "path": "C:/Users/Christopher.Tso/templates/empty"
    }
  ]
}
```

If the template contains `{ "path": "." }`, it should be resolved to the template's directory absolute path, then the subagent's `"."` is added as the first entry.

## Scope

This change affects:
- **workspace-dispatch** specification: Add requirements for workspace path resolution

## Implementation Approach

Modify the `copyAgentConfig` function in `src/vscode/agentDispatch.ts` to:
1. Read the workspace template JSON content
2. Parse and transform the `folders` array:
   - Convert ALL relative paths (including `"."`) to absolute paths using the template's directory as base
   - Preserve absolute paths as-is
3. Insert `{ "path": "." }` as the first entry in the folders array (this remains as `"."` and will resolve to the subagent directory)
4. Write the transformed JSON to the destination workspace file

## Dependencies

None - this is a standalone change to existing dispatch behavior.

## Validation

- Unit tests for path resolution logic (relative to absolute conversion)
- Integration tests for workspace template processing
- Manual testing with various template configurations
