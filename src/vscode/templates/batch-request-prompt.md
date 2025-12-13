[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Do NOT create any additional output files in the workspace.
2. Create and write your complete response to: {{responseFileTmp}}
3. All intended file outputs/changes MUST be returned INLINE in your response using `<file path="..."> ... </file>` tags. For each file, include either:
    - the full final file content, OR
    - a unified git diff (preferred when editing an existing file).
4. When completely finished and the response is stable, rename it to: {{responseFileFinal}}
5. Do not unlock the workspace from this request; batch orchestration will handle unlocking after all responses are ready.

[[ ## task ## ]]

{{userQuery}}
