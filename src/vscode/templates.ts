/**
 * Embedded template strings for agent prompts
 * These are embedded at build time to avoid file I/O and bundling issues
 */

export const DEFAULT_REQUEST_TEMPLATE = `[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Create and write your complete response to: {{responseFileTmp}}
2. When completely finished, run these PowerShell commands to signal completion:
\`\`\`
Move-Item -LiteralPath '{{responseFileTmp}}' -Destination '{{responseFileFinal}}'
if (Test-Path subagent.lock) { del subagent.lock }
\`\`\`

Do not proceed to step 2 until your response is completely written to the temporary file.

[[ ## task ## ]]

{{userQuery}}
`;

export const DEFAULT_BATCH_REQUEST_TEMPLATE = `[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Create and write your complete response to: {{responseFileTmp}}
2. When completely finished and the response is stable, rename it to: {{responseFileFinal}}
5. Do not unlock the workspace from this request; batch orchestration will handle unlocking after all responses are ready.

[[ ## task ## ]]

{{userQuery}}
`;

export const DEFAULT_BATCH_ORCHESTRATOR_TEMPLATE = `MANDATORY: Run #runSubagent tool in your Available Actions for each request file to process them in isolated contexts.
DO NOT read the request files yourself - only pass the file paths to each subagent:

{{requestFiles}}

After ALL queries complete, verify all responses exist and unlock:

\`\`\`powershell
$responses = @({{responseList}})
$missing = $responses | Where-Object { -not (Test-Path "messages/$_") }
if ($missing.Count -eq 0) { del subagent.lock }
\`\`\`
`;
