## 1. Implementation

- [ ] 1.1 Add `workspaceTemplate?: string` parameter to `copyAgentConfig()` in `agentDispatch.ts`
- [ ] 1.2 Update `copyAgentConfig()` to use custom workspace template when provided, default template otherwise
- [ ] 1.3 Add workspace template validation logic in `copyAgentConfig()` to handle file paths
- [ ] 1.4 Add `workspaceTemplate?: string` to `DispatchOptions` interface in `agentDispatch.ts`
- [ ] 1.5 Add `--workspace-template` CLI option to chat command in `cli.ts`
- [ ] 1.6 Remove `--template` option from provision command in `cli.ts`
- [ ] 1.7 Remove `templateDir` parameter from `ProvisionOptions` in `provision.ts`
- [ ] 1.8 Update help text and examples in README.md to reflect new option

## 2. Testing

- [ ] 2.1 Add unit test for provisioning with custom workspace template
- [ ] 2.2 Add unit test for validation of custom workspace template path
- [ ] 2.3 Add unit test for error handling when workspace template is missing
- [ ] 2.4 Add integration test for end-to-end provisioning workflow with custom template
- [ ] 2.5 Add unit test for default template fallback when no workspace template specified
- [ ] 2.6 Update existing tests that used `--template` option

## 3. Documentation

- [ ] 3.1 Update README.md with `--workspace-template` option documentation
- [ ] 3.2 Add example showing custom workspace template usage
- [ ] 3.3 Add migration note about `--template` removal (if needed)
