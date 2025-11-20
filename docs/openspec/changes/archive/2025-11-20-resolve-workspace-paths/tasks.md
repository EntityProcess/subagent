# Tasks: Resolve Workspace Paths

## Implementation Tasks

### 1. Create workspace path transformation utility

**File**: `src/utils/workspace.ts` (new file)

- Create `transformWorkspacePaths(workspaceContent: string, templateDir: string): string` function
- Parse JSON workspace content
- Iterate through all folders and resolve relative paths (including `"."`) to absolute using `templateDir`
- Preserve absolute paths unchanged
- After resolving all paths, insert `{ "path": "." }` as the first folder entry
- Transform chat settings paths:
  - For `chat.promptFilesLocations`, `chat.instructionsFilesLocations`, and `chat.modeFilesLocations`
  - Resolve relative glob paths to absolute paths based on `templateDir`
  - Preserve absolute paths unchanged
- Return stringified JSON with proper formatting

**Validation**: Unit tests covering:
- Relative path resolution
- Absolute path preservation
- Subagent folder insertion
- Chat settings path resolution (relative and absolute)
- Edge cases (empty folders array, malformed JSON, missing chat settings)

### 2. Update copyAgentConfig to transform workspace paths

**File**: `src/vscode/agentDispatch.ts`

- Import `transformWorkspacePaths` utility
- After reading workspace template file, transform its content before writing
- Pass template file's directory and destination subagent directory to transformer
- Handle transformation errors gracefully

**Validation**: 
- Existing dispatch tests should still pass
- Add new test cases for path transformation scenarios

### 3. Add integration tests

**File**: `tests/agentDispatch.test.ts`

- Test workspace template with relative paths gets transformed correctly
- Test workspace template with absolute paths remain unchanged
- Test default template behavior unchanged
- Test template already containing `{ "path": "." }` as first entry
- Test chat settings with relative paths get resolved
- Test chat settings with absolute paths remain unchanged

**Validation**: All new tests pass

### 4. Update documentation

**File**: `README.md`

- Document the workspace path resolution behavior
- Add example showing how relative paths in templates are resolved
- Clarify that `{ "path": "." }` always refers to the subagent directory

**Validation**: Documentation reviewed and accurate

## Testing Checklist

- [x] Unit tests for `transformWorkspacePaths` utility
- [x] Integration tests for dispatch with custom templates
- [x] Manual test: Create template with `./lib` path, verify it resolves correctly
- [x] Manual test: Verify default template behavior unchanged
- [x] Manual test: Template with mix of relative and absolute paths
- [ ] Manual test: Template with chat settings relative paths
- [ ] Manual test: Template with chat settings absolute paths
- [x] Verify on Windows and Unix-style paths (if applicable)

## Dependencies

None - all tasks can proceed in sequence.
