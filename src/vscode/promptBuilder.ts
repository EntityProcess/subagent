import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { renderTemplate } from "../utils/template.js";

/**
 * Get the default templates directory path
 */
export function getTemplatesDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "templates");
}

/**
 * Load a template file from the filesystem
 */
export async function loadTemplateFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to load template file '${filePath}': ${(error as Error).message}`);
  }
}

/**
 * Create a request prompt for single agent dispatch
 */
export function createRequestPrompt(
  userQuery: string,
  responseFileTmp: string,
  responseFileFinal: string,
  templateContent?: string,
): string {
  if (templateContent) {
    return renderTemplate(templateContent, {
      userQuery,
      responseFileTmp,
      responseFileFinal,
    });
  }

  // Backward compatibility: return hardcoded default template
  return `[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Do NOT create any additional output files in the workspace.
2. Create and write your complete response to: ${responseFileTmp}
3. All intended file outputs/changes MUST be returned INLINE in your response using \`<file path="..."> ... </file>\` tags. For each file, include either:
    - the full final file content, OR
    - a unified git diff (preferred when editing an existing file).
4. When completely finished, run these PowerShell commands to signal completion:
\`\`\`
Move-Item -LiteralPath '${responseFileTmp}' -Destination '${responseFileFinal}'
if (Test-Path subagent.lock) { del subagent.lock }
\`\`\`

Do not proceed to step 2 until your response is completely written to the temporary file.

[[ ## task ## ]]

${userQuery}`;
}

/**
 * Create a batch request prompt for batch agent dispatch
 */
export function createBatchRequestPrompt(
  userQuery: string,
  responseFileTmp: string,
  responseFileFinal: string,
  templateContent?: string,
): string {
  if (templateContent) {
    return renderTemplate(templateContent, {
      userQuery,
      responseFileTmp,
      responseFileFinal,
    });
  }

  // Backward compatibility: return hardcoded default template
  return `[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Do NOT create any additional output files in the workspace.
2. Create and write your complete response to: ${responseFileTmp}
3. All intended file outputs/changes MUST be returned INLINE in your response using \`<file path="..."> ... </file>\` tags. For each file, include either:
    - the full final file content, OR
    - a unified git diff (preferred when editing an existing file).
4. When completely finished and the response is stable, rename it to: ${responseFileFinal}
5. Do not unlock the workspace from this request; batch orchestration will handle unlocking after all responses are ready.

[[ ## task ## ]]

${userQuery}`;
}

/**
 * Create a batch orchestrator prompt that coordinates multiple subagent requests
 */
export function createBatchOrchestratorPrompt(
  requestFiles: readonly string[],
  responseFiles: readonly string[],
  templateContent?: string,
): string {
  const requestLines = requestFiles
    .map((file, index) => `${index + 1}. messages/${path.basename(file)}`)
    .join("\n");
  const responseList = responseFiles.map((file) => `"${path.basename(file)}"`).join(", ");

  if (templateContent) {
    return renderTemplate(templateContent, {
      requestFiles: requestLines,
      responseList,
    });
  }

  // Backward compatibility: return hardcoded default template
  return `MANDATORY: Run #runSubagent tool in your Available Actions for each request file to process them in isolated contexts.
DO NOT read the request files yourself - only pass the file paths to each subagent:

${requestLines}

After ALL queries complete, verify all responses exist and unlock:

\`\`\`powershell
$responses = @(${responseList})
$missing = $responses | Where-Object { -not (Test-Path "messages/$_") }
if ($missing.Count -eq 0) { del subagent.lock }
\`\`\`
`;
}
