## 1. Implementation

- [x] 1.1 Add `workspaceTemplate?: string` parameter to `copyAgentConfig()` in `agentDispatch.ts`
- [x] 1.2 Update `copyAgentConfig()` to use custom workspace template when provided, default template otherwise
- [x] 1.3 Add workspace template validation logic in `copyAgentConfig()` to handle file paths
- [x] 1.4 Add `workspaceTemplate?: string` to `DispatchOptions` interface in `agentDispatch.ts`
- [x] 1.5 Add `--workspace-template` CLI option to chat command in `cli.ts`
- [x] 1.6 Remove `--template` option from provision command in `cli.ts`
- [x] 1.7 Remove `templateDir` parameter from `ProvisionOptions` in `provision.ts`
- [x] 1.8 Update help text and examples in README.md to reflect new option

## 2. Testing

- [x] 2.1 Add unit test for `copyAgentConfig()` with custom workspace template
- [x] 2.2 Add unit test for validation of custom workspace template path
- [x] 2.3 Add unit test for error handling when workspace template is missing
- [x] 2.4 Add unit test for error handling when workspace template is a directory
- [x] 2.5 Add unit test for default template fallback when no workspace template specified
- [x] 2.6 Add integration test for dispatch workflow with custom workspace template

## 3. Documentation

- [x] 3.1 Update README.md with `--workspace-template` option documentation
- [x] 3.2 Add example showing custom workspace template usage