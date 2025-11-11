# Design: Custom Workspace Template Support

## Context

The current provisioning system copies a workspace file from a template directory structure. Users have requested the ability to specify a direct path to a `.code-workspace` file that should be used as the template, making it easier to share and reuse workspace configurations without maintaining a full template directory structure.

## Goals / Non-Goals

### Goals
- Allow users to specify a custom `.code-workspace` file via CLI option
- Maintain backward compatibility with existing `--template` directory option
- Validate custom workspace template files before provisioning
- Support both relative and absolute paths for workspace templates

### Non-Goals
- Modifying the internal structure of `.code-workspace` files
- Validating the JSON schema of workspace files beyond basic file existence
- Supporting multiple workspace template files in a single provision operation
- Auto-discovering workspace templates from common locations

## Decisions

### Decision: Replace `--template` directory option with `--workspace-template` file option

**Rationale**: 
- The `--template` option is never used in practice (default template works for everyone)
- Users only need to customize the workspace file, not the entire directory structure
- Other template files like `wakeup.chatmode.md` are handled separately in `agentDispatch.ts`, not during provisioning
- Simpler, more intuitive API that solves the actual user need

**Alternatives considered**:
- Keep both `--template` and `--workspace-template` (rejected: unnecessary overlap, confusing API)
- Make `--template` accept both files and directories (rejected: implicit behavior, API confusion)
- Keep `--template` as-is and add `--workspace-template` (rejected: doesn't solve the unused option problem)

### Decision: Copy workspace during dispatch, not provisioning

**Rationale**: 
- Subagent workspaces are recycled (locked, used, unlocked, reused)
- Each dispatch should get a fresh workspace configuration
- Allows different workspace templates for different chat sessions on the same provisioned workspace

**Priority order**:
1. `--workspace-template` (if specified on chat command)
2. Default `src/vscode/subagent_template/subagent.code-workspace`

No middle tier needed since template directories are no longer supported.

### Decision: This is a breaking change

**Rationale**: Removing `--template` is technically breaking, but acceptable because:
- The option was never used in practice (default works universally)
- Not documented as a common use case in README
- Provides a clearer, simpler API going forward

### Decision: Copy workspace file during provisioning only

**Rationale**: Workspace files are copied during the `provision` command. The `chat` command currently calls `copyAgentConfig()` which also copies the workspace, so this maintains consistency.

**Note**: If users want to update workspace configuration for existing subagents, they can use `--force` to re-provision.

## Implementation Plan

### Changes to `agentDispatch.ts`

1. Add `workspaceTemplate?: string` to `DispatchOptions` interface
2. Update `copyAgentConfig()` signature:
   ```typescript
   async function copyAgentConfig(
     subagentDir: string, 
     workspaceTemplate?: string
   ): Promise<{ workspace: string; messagesDir: string }>
   ```
3. Modify workspace copy logic in `copyAgentConfig()`:
   ```typescript
   // Determine workspace source - use custom if provided, otherwise default
   const workspaceSrc = workspaceTemplate 
     ? path.resolve(workspaceTemplate)
     : path.join(DEFAULT_TEMPLATE_DIR, DEFAULT_WORKSPACE_FILENAME);
   
   // Validate the workspace template exists
   if (!(await pathExists(workspaceSrc))) {
     throw new Error(`workspace template not found: ${workspaceSrc}`);
   }
   
   const stats = await stat(workspaceSrc);
### Changes to `cli.ts`

Remove from provision command:
```typescript
// DELETE THIS from provision command:
.option('--template <path>', 'Path to the subagent template', DEFAULT_TEMPLATE_DIR)
```

Add to chat command:
```typescript
.option('--workspace-template <path>', 'Path to a custom .code-workspace file to use as template')
```

Pass to `dispatchAgent()`:
```typescript
workspaceTemplate: options.workspaceTemplate,
```ove the old option:
```typescript
// DELETE THIS:
.option('--template <path>', 'Path to the subagent template', DEFAULT_TEMPLATE_DIR)
```

Add the new option:
```typescript
.option('--workspace-template <path>', 'Path to a custom .code-workspace file to use as template')
```

Pass to `provisionSubagents()`:
```typescript
workspaceTemplate: options.workspaceTemplate,
```

### Error Handling

- File not found: "workspace template not found: {path}"
- Path is directory: "workspace template must be a file, not a directory: {path}"
- Unreadable file: Re-throw with context

### Testing Strategy

1. **Unit tests** (in `tests/provision.test.ts`):
   - Provision with custom workspace template (valid file)
   - Provision with missing workspace template (error)
   - Provision with directory as workspace template (error)
   - Provision with both `--template` and `--workspace-template` (workspace template wins)
   - Provision with neither option (uses default)

2. **Integration tests**:
   - End-to-end provisioning with custom workspace
   - Verify workspace file contents match template
   - Verify workspace file naming convention

## Risks / Trade-offs

### Risk: Users might confuse `--template` and `--workspace-template`

**Mitigation**: 
- Clear documentation with examples
- Update help text to explain the difference
- Consider adding a note in the output when using custom workspace template

### Risk: Path resolution issues on Windows vs Unix

**Mitigation**:
- Use `path.resolve()` to normalize paths
- Test on both platforms
- Support both forward slashes and backslashes in paths

### Trade-off: Additional CLI complexity

**Accept**: The benefit of flexibility outweighs the small increase in CLI surface area. The option is clearly named and optional.

## Migration Plan

This is a breaking change, but minimal impact expected:

1. **Who is affected**: Only users who explicitly use `--template <directory>` (likely zero based on analysis)
2. **What changes**: `--template` option removed, replaced with `--workspace-template <file>`
3. **Default behavior**: Unchanged - still uses built-in template
4. **Migration path**: If anyone was using `--template /custom/dir`, they should now use `--workspace-template /custom/dir/subagent.code-workspace`

### Communication

- Update README with clear example of new option
- Add brief note about `--template` removal (only if we find actual usage)
- Version bump: Minor version (0.x.0 → 0.y.0) to signal breaking change

### Rollback

If issues arise, users can simply omit the `--workspace-template` option and continue using existing workflow.

## Open Questions

None. The design is straightforward and builds on existing patterns.
