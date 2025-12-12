[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Do NOT create any additional output files in the workspace.
2. Create and write your complete response to: {{responseFileTmp}}
3. All intended file outputs/changes MUST be returned INLINE in your response using `<file path="..."> ... </file>` tags. For each file, include either:
	- the full final file content, OR
	- a unified git diff (preferred when editing an existing file).
4. When completely finished, run these PowerShell commands to signal completion:
```
Move-Item -LiteralPath '{{responseFileTmp}}' -Destination '{{responseFileFinal}}'
if (Test-Path subagent.lock) { del subagent.lock }
```

Do not proceed to step 2 until your response is completely written to the temporary file.

[[ ## task ## ]]

{{userQuery}}
