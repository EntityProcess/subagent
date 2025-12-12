## Plan: Refactor Prompt System to Use Template Variables

Modernize the subagent dispatch system by replacing hardcoded prompt strings with external template files using `{{VARIABLE}}` syntax, enabling customizable prompts and clearer separation between protocol logic and content.

### Steps

1. **Create template rendering utility** in `src/utils/template.ts` with `renderTemplate(content, variables)` function using regex `/\{\{([a-zA-Z_]+)\}\}/gi` (case-insensitive) to replace `{{variableName}}` placeholders with runtime values. Template variables match JavaScript variable names (camelCase) but are matched case-insensitively in templates. The function should throw an error if a variable is referenced but not provided.

2. **Extract default templates** to `src/vscode/templates/` directory: create `request-prompt.md`, `batch-request-prompt.md`, and `batch-orchestrator-prompt.md` files converting current `createRequestPrompt`, `createBatchRequestPrompt`, and `createBatchOrchestratorPrompt` string literals to use template variables:
   - `{{responseFileTmp}}` - temporary response file path
   - `{{responseFileFinal}}` - final response file path
   - `{{userQuery}}` - user's task/query text
   - `{{requestFiles}}` - formatted list of batch request files (batch orchestrator only)
   - `{{responseList}}` - PowerShell array of response filenames (batch orchestrator only)

3. **Add template loading** to `agentDispatch.ts`: create `loadTemplateFile(filePath)` function that reads template files and handles errors. Load default templates from `src/vscode/templates/` at module initialization.

4. **Add optional `requestTemplate` parameter** to `DispatchOptions` and `BatchDispatchOptions` interfaces. When `requestTemplate` is provided, load and use the custom template; otherwise use the hardcoded default template to maintain backward compatibility.

5. **Replace prompt construction functions** in `agentDispatch.ts`: refactor `createRequestPrompt`, `createBatchRequestPrompt`, and `createBatchOrchestratorPrompt` to:
   - Accept an optional `templateContent` parameter
   - If `templateContent` is provided, call `renderTemplate` with variable mappings
   - If not provided, return the current hardcoded template string (backward compatibility)

6. **Update CLI** in `src/cli.ts`: add `--request-template <file>` option to `dispatch` and `batch-dispatch` commands, passing the template file path through to dispatch functions.

7. **Add unit tests** in `tests/template.test.ts`: verify variable replacement, error handling for undefined variables, and edge cases like empty templates or malformed variable syntax.

8. **Add integration tests** in `tests/agentDispatch.test.ts`: verify end-to-end template usage including:
   - Backward compatibility: dispatch with no template uses hardcoded default
   - Custom template: dispatch with `requestTemplate` parameter renders variables correctly
   - Template file loading errors are handled gracefully
   - Batch dispatch with custom templates works for orchestrator and request prompts

### Design Decisions

1. **Template variable naming:** Use camelCase matching JavaScript variable names (e.g., `{{responseFileTmp}}`). Template matching is case-insensitive, so `{{RESPONSE_FILE_TMP}}`, `{{responseFileTmp}}`, or `{{ResponseFileTmp}}` all work, providing flexibility while maintaining consistency with JavaScript naming conventions.

2. **Backward compatibility:** Maintain full backward compatibility by keeping the current hardcoded behavior as the default. Custom templates are opt-in via the `requestTemplate` parameter. Existing function signatures and parameters remain unchanged.

3. **Prompt structure:** No separation of system instructions from protocol instructions. The template contains both the system instructions block and the user query placeholder, matching the current structure where prompts consist primarily of system instructions followed by `{{USER_QUERY}}`.
