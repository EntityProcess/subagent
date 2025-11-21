import { exec, spawn } from "child_process";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

import {
  DEFAULT_ALIVE_FILENAME,
  DEFAULT_LOCK_NAME,
  DEFAULT_SUBAGENT_ROOT,
  getDefaultSubagentRoot,
} from "./constants.js";
import { pathExists, readDirEntries, removeIfExists } from "../utils/fs.js";
import { pathToFileUri } from "../utils/path.js";
import { sleep } from "../utils/time.js";
import { transformWorkspacePaths } from "../utils/workspace.js";

const execAsync = promisify(exec);

function generateTimestamp(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

/**
 * Default workspace template content
 */
const DEFAULT_WORKSPACE_TEMPLATE = {
  folders: [
    {
      path: ".",
    },
  ]
};

/**
 * Default wakeup agent content
 */
const DEFAULT_WAKEUP_CONTENT = `---
description: 'Wake-up Signal'
model: Grok Code Fast 1 (copilot)
---`;

export function getSubagentRoot(vscodeCmd: string = "code"): string {
  return getDefaultSubagentRoot(vscodeCmd);
}

async function resolvePromptFile(promptFile: string | undefined): Promise<string | undefined> {
  if (!promptFile) {
    return undefined;
  }

  const resolvedPrompt = path.resolve(promptFile);
  if (!(await pathExists(resolvedPrompt))) {
    throw new Error(`Prompt file not found: ${resolvedPrompt}`);
  }

  const promptStats = await stat(resolvedPrompt);
  if (!promptStats.isFile()) {
    throw new Error(`Prompt file must be a file, not a directory: ${resolvedPrompt}`);
  }

  return resolvedPrompt;
}

export async function getAllSubagentWorkspaces(subagentRoot: string): Promise<string[]> {
  if (!(await pathExists(subagentRoot))) {
    return [];
  }

  const entries = await readDirEntries(subagentRoot);
  const subagents = entries
    .filter((entry) => entry.isDirectory && entry.name.startsWith("subagent-"))
    .map((entry) => ({
      absolutePath: entry.absolutePath,
      number: Number.parseInt(entry.name.split("-")[1] ?? "", 10),
    }))
    .filter((entry) => Number.isInteger(entry.number))
    .sort((a, b) => a.number - b.number);

  const workspaces: string[] = [];
  for (const subagent of subagents) {
    const workspacePath = path.join(subagent.absolutePath, `${path.basename(subagent.absolutePath)}.code-workspace`);
    if (await pathExists(workspacePath)) {
      workspaces.push(workspacePath);
    }
  }
  return workspaces;
}

export async function findUnlockedSubagent(subagentRoot: string): Promise<string | null> {
  if (!(await pathExists(subagentRoot))) {
    return null;
  }

  const entries = await readDirEntries(subagentRoot);
  const subagents = entries
    .filter((entry) => entry.isDirectory && entry.name.startsWith("subagent-"))
    .map((entry) => ({
      absolutePath: entry.absolutePath,
      number: Number.parseInt(entry.name.split("-")[1] ?? "", 10),
    }))
    .filter((entry) => Number.isInteger(entry.number))
    .sort((a, b) => a.number - b.number);

  for (const subagent of subagents) {
    const lockFile = path.join(subagent.absolutePath, DEFAULT_LOCK_NAME);
    if (!(await pathExists(lockFile))) {
      return subagent.absolutePath;
    }
  }

  return null;
}

async function checkWorkspaceOpened(workspaceName: string, vscodeCmd: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`${vscodeCmd} --status`, { timeout: 10_000, windowsHide: true });
    return stdout.includes(workspaceName);
  } catch {
    return false;
  }
}

async function ensureWorkspaceFocused(
  workspacePath: string,
  workspaceName: string,
  subagentDir: string,
  vscodeCmd: string,
  pollInterval = 1,
  timeout = 60,
): Promise<boolean> {
  const alreadyOpen = await checkWorkspaceOpened(workspaceName, vscodeCmd);

  if (alreadyOpen) {
    spawn(vscodeCmd, [workspacePath], { windowsHide: true, shell: true, detached: false });
    return true;
  }

  const aliveFile = path.join(subagentDir, DEFAULT_ALIVE_FILENAME);
  await removeIfExists(aliveFile);

  const githubAgentsDir = path.join(subagentDir, ".github", "agents");
  await mkdir(githubAgentsDir, { recursive: true });
  const wakeupDst = path.join(githubAgentsDir, "wakeup.md");
  const subagentDst = path.join(githubAgentsDir, "subagent.md");
  await writeFile(wakeupDst, DEFAULT_WAKEUP_CONTENT, "utf8");

  spawn(vscodeCmd, [workspacePath], { windowsHide: true, shell: true, detached: false });
  await sleep(100);

  const wakeupChatId = "wakeup";
  const chatArgs = ["-r", "chat", "-m", wakeupChatId, "create a file named .alive"];
  spawn(vscodeCmd, chatArgs, { windowsHide: true, shell: true, detached: false });

  const start = Date.now();
  while (!(await pathExists(aliveFile))) {
    if (Date.now() - start > timeout * 1000) {
      console.error(`warning: Workspace readiness timeout after ${timeout}s`);
      return false;
    }
    await sleep(pollInterval * 1000);
  }

  return true;
}

async function copyAgentConfig(
  subagentDir: string,
  workspaceTemplate?: string,
): Promise<{ workspace: string; messagesDir: string }> {
  let workspaceContent: unknown;

  if (workspaceTemplate) {
    // Use custom workspace template file if provided
    const workspaceSrc = path.resolve(workspaceTemplate);

    // Validate the workspace template exists
    if (!(await pathExists(workspaceSrc))) {
      throw new Error(`workspace template not found: ${workspaceSrc}`);
    }

    const stats = await stat(workspaceSrc);
    if (!stats.isFile()) {
      throw new Error(`workspace template must be a file, not a directory: ${workspaceSrc}`);
    }

    // Read and parse custom template
    const templateText = await readFile(workspaceSrc, "utf8");
    workspaceContent = JSON.parse(templateText);
  } else {
    // Use default template
    workspaceContent = DEFAULT_WORKSPACE_TEMPLATE;
  }

  // Write workspace file
  const workspaceName = `${path.basename(subagentDir)}.code-workspace`;
  const workspaceDst = path.join(subagentDir, workspaceName);
  const templateDir = workspaceTemplate ? path.dirname(path.resolve(workspaceTemplate)) : subagentDir;
  const workspaceJson = JSON.stringify(workspaceContent, null, 2);
  const transformedContent = transformWorkspacePaths(workspaceJson, templateDir);
  await writeFile(workspaceDst, transformedContent, "utf8");

  const messagesDir = path.join(subagentDir, "messages");
  await mkdir(messagesDir, { recursive: true });

  return { workspace: workspaceDst, messagesDir };
}

async function createSubagentLock(subagentDir: string): Promise<string> {
  const messagesDir = path.join(subagentDir, "messages");
  if (await pathExists(messagesDir)) {
    const files = await readdir(messagesDir);
    await Promise.all(
      files.map(async (file) => {
        const target = path.join(messagesDir, file);
        await removeIfExists(target);
      }),
    );
  }

  const githubAgentsDir = path.join(subagentDir, ".github", "agents");
  if (await pathExists(githubAgentsDir)) {
    const agentFiles = await readdir(githubAgentsDir);
    const preservedFiles = new Set(["wakeup.md", "subagent.md"]);
    await Promise.all(
      agentFiles
        .filter((file) => file.endsWith(".md") && !preservedFiles.has(file))
        .map((file) => removeIfExists(path.join(githubAgentsDir, file))),
    );
  }

  const lockFile = path.join(subagentDir, DEFAULT_LOCK_NAME);
  await writeFile(lockFile, "", { encoding: "utf8" });
  return lockFile;
}

async function removeSubagentLock(subagentDir: string): Promise<void> {
  const lockFile = path.join(subagentDir, DEFAULT_LOCK_NAME);
  await removeIfExists(lockFile);
}

async function waitForResponseOutput(responseFileFinal: string, pollInterval = 1000, silent = false): Promise<boolean> {
  if (!silent) {
    console.error(`waiting for agent to finish: ${responseFileFinal}`);
  }

  try {
    while (!(await pathExists(responseFileFinal))) {
      await sleep(pollInterval);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }

  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    try {
      const content = await readFile(responseFileFinal, { encoding: "utf8" });
      if (!silent) {
        process.stdout.write(`${content}\n`);
      }
      return true;
    } catch (error) {
      attempts += 1;
      if ((error as NodeJS.ErrnoException).code !== "EBUSY" || attempts >= maxAttempts) {
        if (!silent) {
          console.error(`error: failed to read agent response: ${(error as Error).message}`);
        }
        return false;
      }
      await sleep(pollInterval);
    }
  }

  return false;
}

async function waitForBatchResponses(
  responseFilesFinal: readonly string[],
  pollInterval = 1000,
  silent = false,
): Promise<boolean> {
  if (!silent) {
    const fileList = responseFilesFinal.map((file) => path.basename(file)).join(", ");
    console.error(`waiting for ${responseFilesFinal.length} batch response(s): ${fileList}`);
  }

  try {
    const pending = new Set(responseFilesFinal);
    while (pending.size > 0) {
      for (const file of [...pending]) {
        if (await pathExists(file)) {
          pending.delete(file);
        }
      }

      if (pending.size > 0) {
        await sleep(pollInterval);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }

  for (const file of responseFilesFinal) {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      try {
        const content = await readFile(file, { encoding: "utf8" });
        if (!silent) {
          process.stdout.write(`${content}\n`);
        }
        break;
      } catch (error) {
        attempts += 1;
        if ((error as NodeJS.ErrnoException).code !== "EBUSY" || attempts >= maxAttempts) {
          if (!silent) {
            console.error(`error: failed to read agent response: ${(error as Error).message}`);
          }
          return false;
        }
        await sleep(pollInterval);
      }
    }
  }

  return true;
}

async function prepareSubagentDirectory(
  subagentDir: string,
  promptFile: string | undefined,
  chatId: string,
  workspaceTemplate: string | undefined,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    return 0;
  }

  try {
    await copyAgentConfig(subagentDir, workspaceTemplate);
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    return 1;
  }

  try {
    await createSubagentLock(subagentDir);
  } catch (error) {
    console.error(`error: Failed to create subagent lock: ${(error as Error).message}`);
    return 1;
  }

  if (promptFile) {
    const githubAgentsDir = path.join(subagentDir, ".github", "agents");
    await mkdir(githubAgentsDir, { recursive: true });
    const agentFile = path.join(githubAgentsDir, `${chatId}.md`);
    try {
      await copyFile(promptFile, agentFile);
    } catch (error) {
      console.error(`error: Failed to copy prompt file to agent mode: ${(error as Error).message}`);
      return 1;
    }
  }

  return 0;
}

function createRequestPrompt(
  userQuery: string,
  responseFileTmp: string,
  responseFileFinal: string,
): string {
  return `[[ ## task ## ]]

${userQuery}

[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Create and write your complete response to: ${responseFileTmp}
2. When completely finished, run these PowerShell commands to signal completion:
\`\`\`
Move-Item -LiteralPath '${responseFileTmp}' -Destination '${responseFileFinal}'
if (Test-Path subagent.lock) { del subagent.lock }
\`\`\`

Do not proceed to step 2 until your response is completely written to the temporary file.`;
}

function createBatchRequestPrompt(userQuery: string, responseFileTmp: string, responseFileFinal: string): string {
  return `[[ ## task ## ]]

${userQuery}

[[ ## system_instructions ## ]]

Write your complete response to: ${responseFileTmp}
When completely finished and the response is stable, rename it to: ${responseFileFinal}
Do not unlock the workspace from this request; batch orchestration will handle unlocking after all responses are ready.`;
}

function createBatchOrchestratorPrompt(
  requestFiles: readonly string[],
  responseFiles: readonly string[],
): string {
  const requestLines = requestFiles
    .map((file, index) => `${index + 1}. messages/${path.basename(file)}`)
    .join("\n");
  const responseList = responseFiles.map((file) => `"${path.basename(file)}"`).join(", ");

  return `Process these queries in isolated contexts using the #runSubagent tool (listed in Available Actions).
DO NOT read the request files - only pass the file paths to subagent:

${requestLines}

After ALL queries complete, verify all responses exist and unlock:

\`\`\`powershell
$responses = @(${responseList})
$missing = $responses | Where-Object { -not (Test-Path "messages/$_") }
if ($missing.Count -eq 0) { del subagent.lock }
\`\`\`
`;
}

async function resolveAttachments(extraAttachments: readonly string[] | undefined): Promise<string[]> {
  if (!extraAttachments) {
    return [];
  }

  const resolved: string[] = [];
  for (const attachment of extraAttachments) {
    const resolvedPath = path.resolve(attachment);
    if (!(await pathExists(resolvedPath))) {
      throw new Error(`Attachment not found: ${resolvedPath}`);
    }
    resolved.push(resolvedPath);
  }
  return resolved;
}

async function launchVsCodeWithChat(
  subagentDir: string,
  chatId: string,
  attachmentPaths: string[],
  requestInstructions: string,
  timestamp: string,
  vscodeCmd: string,
): Promise<boolean> {
  try {
    const workspacePath = path.join(subagentDir, `${path.basename(subagentDir)}.code-workspace`);
    const messagesDir = path.join(subagentDir, "messages");
    await mkdir(messagesDir, { recursive: true });

    const reqFile = path.join(messagesDir, `${timestamp}_req.md`);
    await writeFile(reqFile, requestInstructions, { encoding: "utf8" });

    const chatArgs = ["-r", "chat", "-m", chatId];
    for (const attachment of attachmentPaths) {
      chatArgs.push("-a", attachment);
    }
    chatArgs.push("-a", reqFile);
    chatArgs.push(`Follow instructions in ${path.basename(reqFile)}`);

    const workspaceReady = await ensureWorkspaceFocused(workspacePath, path.basename(subagentDir), subagentDir, vscodeCmd);
    if (!workspaceReady) {
      console.error("warning: Workspace may not be fully ready");
    }

    await sleep(500);
    spawn(vscodeCmd, chatArgs, { windowsHide: true, shell: true, detached: false });
    return true;
  } catch (error) {
    console.error(`warning: Failed to launch VS Code: ${(error as Error).message}`);
    return false;
  }
}

async function launchVsCodeWithBatchChat(
  subagentDir: string,
  chatId: string,
  attachmentPaths: string[],
  chatInstruction: string,
  vscodeCmd: string,
): Promise<boolean> {
  try {
    const workspacePath = path.join(subagentDir, `${path.basename(subagentDir)}.code-workspace`);
    const messagesDir = path.join(subagentDir, "messages");
    await mkdir(messagesDir, { recursive: true });

    const chatArgs = ["-r", "chat", "-m", chatId];
    for (const attachment of attachmentPaths) {
      chatArgs.push("-a", attachment);
    }
    chatArgs.push(chatInstruction);

    const workspaceReady = await ensureWorkspaceFocused(workspacePath, path.basename(subagentDir), subagentDir, vscodeCmd);
    if (!workspaceReady) {
      console.error("warning: Workspace may not be fully ready");
    }

    await sleep(500);
    spawn(vscodeCmd, chatArgs, { windowsHide: true, shell: true, detached: false });
    return true;
  } catch (error) {
    console.error(`warning: Failed to launch VS Code: ${(error as Error).message}`);
    return false;
  }
}

export interface DispatchOptions {
  userQuery: string;
  promptFile?: string;
  extraAttachments?: readonly string[];
  workspaceTemplate?: string;
  dryRun?: boolean;
  wait?: boolean;
  vscodeCmd?: string;
  subagentRoot?: string;
  silent?: boolean;
}

export interface BatchDispatchOptions extends Omit<DispatchOptions, "userQuery"> {
  userQueries: string[];
}

export interface BatchDispatchResult {
  readonly exitCode: number;
  readonly subagentName?: string;
  readonly requestFiles: string[];
  readonly responseFiles?: string[];
  readonly queryCount: number;
  readonly error?: string;
}

export async function dispatchAgent(options: DispatchOptions): Promise<number> {
  const {
    userQuery,
    promptFile,
    extraAttachments,
    workspaceTemplate,
    dryRun = false,
    wait = false,
    vscodeCmd = "code",
    subagentRoot,
    silent = false,
  } = options;

  try {
    const resolvedPrompt = await resolvePromptFile(promptFile);

    const subagentRootPath = subagentRoot ?? getSubagentRoot(vscodeCmd);
    const subagentDir = await findUnlockedSubagent(subagentRootPath);
    if (!subagentDir) {
      if (!silent) {
        console.error(
          "error: No unlocked subagents available. Provision additional subagents with:\n  subagent code provision --subagents <desired_total>",
        );
      }
      return 1;
    }

    if (!silent) {
      console.error(`info: Acquiring subagent: ${path.basename(subagentDir)}`);
    }

    const chatId = Math.random().toString(16).slice(2, 10);
    const preparationResult = await prepareSubagentDirectory(subagentDir, resolvedPrompt, chatId, workspaceTemplate, dryRun);
    if (preparationResult !== 0) {
      return preparationResult;
    }

    const attachments = await resolveAttachments(extraAttachments);

    const timestamp = generateTimestamp();
    const messagesDir = path.join(subagentDir, "messages");
    const responseFileTmp = path.join(messagesDir, `${timestamp}_res.tmp.md`);
    const responseFileFinal = path.join(messagesDir, `${timestamp}_res.md`);

    const requestInstructions = createRequestPrompt(userQuery, responseFileTmp, responseFileFinal);

    process.stdout.write(
      `${JSON.stringify({ success: true, subagent_name: path.basename(subagentDir), response_file: responseFileFinal })}\n`,
    );

    if (dryRun) {
      return 0;
    }

    const launchSuccess = await launchVsCodeWithChat(subagentDir, chatId, attachments, requestInstructions, timestamp, vscodeCmd);
    if (!launchSuccess) {
      return 1;
    }

    if (!wait) {
      process.stdout.write(
        `${JSON.stringify({
          subagent: path.basename(subagentDir),
          status: "dispatched",
          response_file: responseFileFinal,
          temp_file: responseFileTmp,
        })}\n`,
      );
      if (!silent) {
        console.error(
          `\nAgent dispatched. Response will be written to:\n  ${responseFileFinal}\nMonitor: check if ${path.basename(
            responseFileTmp,
          )} has been renamed to ${path.basename(responseFileFinal)}\n`,
        );
      }
      return 0;
    }

    const received = await waitForResponseOutput(responseFileFinal, 1000, silent);
    if (!received) {
      return 1;
    }

    await removeSubagentLock(subagentDir);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ success: false, error: (error as Error).message })}\n`);
    return 1;
  }
}

export interface DispatchSessionResult {
  readonly exitCode: number;
  readonly subagentName?: string;
  readonly responseFile?: string;
  readonly tempFile?: string;
  readonly error?: string;
}

export async function dispatchAgentSession(options: DispatchOptions): Promise<DispatchSessionResult> {
  const {
    userQuery,
    promptFile,
    extraAttachments,
    workspaceTemplate,
    dryRun = false,
    wait = true,
    vscodeCmd = "code",
    subagentRoot,
    silent = false,
  } = options;

  try {
    let resolvedPrompt: string | undefined;
    try {
      resolvedPrompt = await resolvePromptFile(promptFile);
    } catch (error) {
      return {
        exitCode: 1,
        error: (error as Error).message,
      };
    }

    const subagentRootPath = subagentRoot ?? getSubagentRoot(vscodeCmd);
    const subagentDir = await findUnlockedSubagent(subagentRootPath);
    if (!subagentDir) {
      return {
        exitCode: 1,
        error:
          "No unlocked subagents available. Provision additional subagents with: subagent code provision --subagents <desired_total>",
      };
    }

    const subagentName = path.basename(subagentDir);
    const chatId = Math.random().toString(16).slice(2, 10);
    const preparationResult = await prepareSubagentDirectory(subagentDir, resolvedPrompt, chatId, workspaceTemplate, dryRun);
    if (preparationResult !== 0) {
      return {
        exitCode: preparationResult,
        subagentName,
        error: "Failed to prepare subagent workspace",
      };
    }

    let attachments: string[];
    try {
      attachments = await resolveAttachments(extraAttachments);
    } catch (attachmentError) {
      return {
        exitCode: 1,
        subagentName,
        error: (attachmentError as Error).message,
      };
    }

    const timestamp = generateTimestamp();
    const messagesDir = path.join(subagentDir, "messages");
    const responseFileTmp = path.join(messagesDir, `${timestamp}_res.tmp.md`);
    const responseFileFinal = path.join(messagesDir, `${timestamp}_res.md`);

    const requestInstructions = createRequestPrompt(userQuery, responseFileTmp, responseFileFinal);

    if (dryRun) {
      return {
        exitCode: 0,
        subagentName,
        responseFile: responseFileFinal,
        tempFile: responseFileTmp,
      };
    }

    const launchSuccess = await launchVsCodeWithChat(
      subagentDir,
      chatId,
      attachments,
      requestInstructions,
      timestamp,
      vscodeCmd,
    );

    if (!launchSuccess) {
      return {
        exitCode: 1,
        subagentName,
        responseFile: responseFileFinal,
        tempFile: responseFileTmp,
        error: "Failed to launch VS Code for subagent session",
      };
    }

    if (!wait) {
      return {
        exitCode: 0,
        subagentName,
        responseFile: responseFileFinal,
        tempFile: responseFileTmp,
      };
    }

    const received = await waitForResponseOutput(responseFileFinal, 1000, silent);
    if (!received) {
      return {
        exitCode: 1,
        subagentName,
        responseFile: responseFileFinal,
        tempFile: responseFileTmp,
        error: "Timed out waiting for agent response",
      };
    }

    await removeSubagentLock(subagentDir);

    return {
      exitCode: 0,
      subagentName,
      responseFile: responseFileFinal,
      tempFile: responseFileTmp,
    };
  } catch (error) {
    return {
      exitCode: 1,
      error: (error as Error).message,
    };
  }
}

export async function dispatchBatchAgent(options: BatchDispatchOptions): Promise<BatchDispatchResult> {
  const {
    userQueries,
    promptFile,
    extraAttachments,
    workspaceTemplate,
    dryRun = false,
    wait = false,
    vscodeCmd = "code",
    subagentRoot,
    silent = false,
  } = options;

  if (!userQueries || userQueries.length === 0) {
    return {
      exitCode: 1,
      requestFiles: [],
      queryCount: 0,
      error: "At least one query is required for batch dispatch",
    };
  }

  const queryCount = userQueries.length;
  let requestFiles: string[] = [];
  let responseFilesFinal: string[] = [];
  let subagentName: string | undefined;

  try {
    let resolvedPrompt: string | undefined;
    try {
      resolvedPrompt = await resolvePromptFile(promptFile);
    } catch (error) {
      return {
        exitCode: 1,
        requestFiles,
        queryCount,
        error: (error as Error).message,
      };
    }

    const subagentRootPath = subagentRoot ?? getSubagentRoot(vscodeCmd);
    const subagentDir = await findUnlockedSubagent(subagentRootPath);
    if (!subagentDir) {
      return {
        exitCode: 1,
        requestFiles,
        queryCount,
        error:
          "No unlocked subagents available. Provision additional subagents with: subagent code provision --subagents <desired_total>",
      };
    }

    subagentName = path.basename(subagentDir);
    const chatId = Math.random().toString(16).slice(2, 10);
    const preparationResult = await prepareSubagentDirectory(subagentDir, resolvedPrompt, chatId, workspaceTemplate, dryRun);
    if (preparationResult !== 0) {
      return {
        exitCode: preparationResult,
        subagentName,
        requestFiles,
        queryCount,
        error: "Failed to prepare subagent workspace",
      };
    }

    let attachments: string[];
    try {
      attachments = await resolveAttachments(extraAttachments);
    } catch (attachmentError) {
      return {
        exitCode: 1,
        subagentName,
        requestFiles,
        queryCount,
        error: (attachmentError as Error).message,
      };
    }

    const timestamp = generateTimestamp();
    const messagesDir = path.join(subagentDir, "messages");

    requestFiles = userQueries.map((_, index) => path.join(messagesDir, `${timestamp}_${index}_req.md`));
    const responseTmpFiles = userQueries.map((_, index) => path.join(messagesDir, `${timestamp}_${index}_res.tmp.md`));
    responseFilesFinal = userQueries.map((_, index) => path.join(messagesDir, `${timestamp}_${index}_res.md`));
    const orchestratorFile = path.join(messagesDir, `${timestamp}_orchestrator.md`);

    if (!dryRun) {
      await Promise.all(
        userQueries.map((query, index) =>
          writeFile(
            requestFiles[index],
            createBatchRequestPrompt(query, responseTmpFiles[index], responseFilesFinal[index]),
            { encoding: "utf8" },
          ),
        ),
      );

      const orchestratorContent = createBatchOrchestratorPrompt(requestFiles, responseFilesFinal);
      await writeFile(orchestratorFile, orchestratorContent, { encoding: "utf8" });
    }

    const chatAttachments = [orchestratorFile, ...attachments];
    const orchestratorUri = pathToFileUri(orchestratorFile);
    const chatInstruction =
      `Follow instructions in [${timestamp}_orchestrator.md](${orchestratorUri}). Use #runSubagent tool.`;

    if (dryRun) {
      return {
        exitCode: 0,
        subagentName,
        requestFiles,
        responseFiles: wait ? responseFilesFinal : undefined,
        queryCount,
      };
    }

    const launchSuccess = await launchVsCodeWithBatchChat(
      subagentDir,
      chatId,
      chatAttachments,
      chatInstruction,
      vscodeCmd,
    );

    if (!launchSuccess) {
      return {
        exitCode: 1,
        subagentName,
        requestFiles,
        queryCount,
        error: "Failed to launch VS Code for batch dispatch",
      };
    }

    if (!wait) {
      return {
        exitCode: 0,
        subagentName,
        requestFiles,
        queryCount,
      };
    }

    const responsesCompleted = await waitForBatchResponses(responseFilesFinal, 1000, silent);
    if (!responsesCompleted) {
      return {
        exitCode: 1,
        subagentName,
        requestFiles,
        responseFiles: responseFilesFinal,
        queryCount,
        error: "Timed out waiting for batch responses",
      };
    }

    await removeSubagentLock(subagentDir);

    return {
      exitCode: 0,
      subagentName,
      requestFiles,
      responseFiles: responseFilesFinal,
      queryCount,
    };
  } catch (error) {
    return {
      exitCode: 1,
      subagentName,
      requestFiles,
      responseFiles: responseFilesFinal.length > 0 ? responseFilesFinal : undefined,
      queryCount,
      error: (error as Error).message,
    };
  }
}

export interface ListOptions {
  subagentRoot?: string;
  jsonOutput?: boolean;
  vscodeCmd?: string;
}

export async function listSubagents(options: ListOptions): Promise<number> {
  const { subagentRoot, jsonOutput = false, vscodeCmd = "code" } = options;

  const resolvedSubagentRoot = subagentRoot ?? getSubagentRoot(vscodeCmd);

  if (!(await pathExists(resolvedSubagentRoot))) {
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify({ subagents: [] })}\n`);
    } else {
      console.error(`No subagents found in ${resolvedSubagentRoot}`);
      console.error("hint: Provision subagents first with:\n  subagent code provision --subagents <count>");
    }
    return 1;
  }

  const entries = await readDirEntries(resolvedSubagentRoot);
  const subagents = entries
    .filter((entry) => entry.isDirectory && entry.name.startsWith("subagent-"))
    .map((entry) => ({
      absolutePath: entry.absolutePath,
      number: Number.parseInt(entry.name.split("-")[1] ?? "", 10),
    }))
    .filter((entry) => Number.isInteger(entry.number))
    .sort((a, b) => a.number - b.number);

  if (subagents.length === 0) {
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify({ subagents: [] })}\n`);
    } else {
      console.error(`No subagents found in ${resolvedSubagentRoot}`);
      console.error("hint: Provision subagents first with:\n  subagent code provision --subagents <count>");
    }
    return 1;
  }

  const infoList = await Promise.all(
    subagents.map(async (subagent) => {
      const lockFile = path.join(subagent.absolutePath, DEFAULT_LOCK_NAME);
      const workspaceFile = path.join(subagent.absolutePath, `${path.basename(subagent.absolutePath)}.code-workspace`);
      const isLocked = await pathExists(lockFile);
      const workspaceExists = await pathExists(workspaceFile);

      return {
        name: path.basename(subagent.absolutePath),
        path: subagent.absolutePath,
        workspace: workspaceExists ? workspaceFile : null,
        locked: isLocked,
        status: isLocked ? "locked" : "available",
      };
    }),
  );

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ subagents: infoList }, null, 2)}\n`);
    return 0;
  }

  const lockedCount = infoList.filter((info) => info.locked).length;
  const availableCount = infoList.length - lockedCount;

  console.error(`Found ${infoList.length} subagent(s) in ${resolvedSubagentRoot}`);
  console.error(`  Available: ${availableCount}`);
  console.error(`  Locked: ${lockedCount}`);
  console.error("");

  for (const info of infoList) {
    const icon = info.locked ? "🔒" : "✓";
    console.log(`${icon} ${info.name.padEnd(15)} ${info.status.padEnd(10)} ${info.path}`);
  }

  return 0;
}

export interface WarmupOptions {
  subagentRoot?: string;
  subagents?: number;
  dryRun?: boolean;
  vscodeCmd?: string;
}

export async function warmupSubagents(options: WarmupOptions): Promise<number> {
  const {
    subagentRoot,
    subagents = 1,
    dryRun = false,
    vscodeCmd = "code",
  } = options;

  const resolvedSubagentRoot = subagentRoot ?? getSubagentRoot(vscodeCmd);

  const workspaces = await getAllSubagentWorkspaces(resolvedSubagentRoot);

  if (workspaces.length === 0) {
    console.error(`info: No provisioned subagents found in ${resolvedSubagentRoot}`);
    console.error("hint: Provision subagents first with:\n  subagent code provision --subagents <count>");
    return 1;
  }

  const workspacesToOpen = workspaces.slice(0, Math.max(1, subagents));

  console.error(`Found ${workspaces.length} subagent workspace(s), opening ${workspacesToOpen.length}`);

  if (dryRun) {
    console.error("Workspaces that would be opened:");
    for (const workspace of workspacesToOpen) {
      console.error(`  ${workspace}`);
    }
    return 0;
  }

  console.error("Opening workspaces...");
  for (let index = 0; index < workspacesToOpen.length; index += 1) {
    const workspace = workspacesToOpen[index];
    const subagentName = path.basename(path.dirname(workspace));
    console.error(`  [${index + 1}/${workspacesToOpen.length}] ${subagentName}`);
    spawn(vscodeCmd, [workspace], { windowsHide: true, shell: true, detached: false });
  }

  console.error("✓ All workspaces opened");
  return 0;
}
