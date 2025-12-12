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
 * Load the default request prompt template
 */
export async function loadDefaultRequestTemplate(): Promise<string> {
  const templatesDir = getTemplatesDir();
  return loadTemplateFile(path.join(templatesDir, "request-prompt.md"));
}

/**
 * Load the default batch request prompt template
 */
export async function loadDefaultBatchRequestTemplate(): Promise<string> {
  const templatesDir = getTemplatesDir();
  return loadTemplateFile(path.join(templatesDir, "batch-request-prompt.md"));
}

/**
 * Load the default batch orchestrator prompt template
 */
export async function loadDefaultBatchOrchestratorTemplate(): Promise<string> {
  const templatesDir = getTemplatesDir();
  return loadTemplateFile(path.join(templatesDir, "batch-orchestrator-prompt.md"));
}

/**
 * Create a request prompt for single agent dispatch
 */
export function createRequestPrompt(
  userQuery: string,
  responseFileTmp: string,
  responseFileFinal: string,
  templateContent: string,
): string {
  return renderTemplate(templateContent, {
    userQuery,
    responseFileTmp,
    responseFileFinal,
  });
}

/**
 * Create a batch request prompt for batch agent dispatch
 */
export function createBatchRequestPrompt(
  userQuery: string,
  responseFileTmp: string,
  responseFileFinal: string,
  templateContent: string,
): string {
  return renderTemplate(templateContent, {
    userQuery,
    responseFileTmp,
    responseFileFinal,
  });
}

/**
 * Create a batch orchestrator prompt that coordinates multiple subagent requests
 */
export function createBatchOrchestratorPrompt(
  requestFiles: readonly string[],
  responseFiles: readonly string[],
  templateContent: string,
): string {
  const requestLines = requestFiles
    .map((file, index) => `${index + 1}. messages/${path.basename(file)}`)
    .join("\n");
  const responseList = responseFiles.map((file) => `"${path.basename(file)}"`).join(", ");

  return renderTemplate(templateContent, {
    requestFiles: requestLines,
    responseList,
  });
}
