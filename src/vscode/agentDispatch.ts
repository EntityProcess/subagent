import { exec, spawn } from "child_process";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

import {
  DEFAULT_ALIVE_FILENAME,
  DEFAULT_LOCK_NAME,
  DEFAULT_SUBAGENT_ROOT,
  DEFAULT_TEMPLATE_DIR,
  DEFAULT_WAKEUP_FILENAME,
  DEFAULT_WORKSPACE_FILENAME,
} from "./constants.js";
import { pathExists, readDirEntries, removeIfExists } from "../utils/fs.js";
import { sleep } from "../utils/time.js";

const execAsync = promisify(exec);

export function getSubagentRoot(): string {
  return DEFAULT_SUBAGENT_ROOT;
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

  const wakeupSrc = path.join(DEFAULT_TEMPLATE_DIR, DEFAULT_WAKEUP_FILENAME);
  const wakeupDst = path.join(subagentDir, DEFAULT_WAKEUP_FILENAME);
  if (await pathExists(wakeupSrc)) {
    await copyFile(wakeupSrc, wakeupDst);
  }

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

async function copyAgentConfig(subagentDir: string): Promise<{ workspace: string; messagesDir: string }> {
  const workspaceSrc = path.join(DEFAULT_TEMPLATE_DIR, DEFAULT_WORKSPACE_FILENAME);
  if (!(await pathExists(workspaceSrc))) {
    throw new Error(`Default workspace template not found: ${workspaceSrc}`);
  }

  const workspaceDst = path.join(subagentDir, `${path.basename(subagentDir)}.code-workspace`);
  await copyFile(workspaceSrc, workspaceDst);

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

  const chatmodeFiles = await readdir(subagentDir);
  await Promise.all(
    chatmodeFiles
      .filter((file) => file.endsWith(".chatmode.md"))
      .map((file) => removeIfExists(path.join(subagentDir, file))),
  );

  const lockFile = path.join(subagentDir, DEFAULT_LOCK_NAME);
  await writeFile(lockFile, "", { encoding: "utf8" });
  return lockFile;
}

async function removeSubagentLock(subagentDir: string): Promise<void> {
  const lockFile = path.join(subagentDir, DEFAULT_LOCK_NAME);
  await removeIfExists(lockFile);
}

async function waitForResponseOutput(responseFileFinal: string, pollInterval = 1000): Promise<boolean> {
  console.error(`waiting for agent to finish: ${responseFileFinal}`);

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
      process.stdout.write(`${content}\n`);
      return true;
    } catch (error) {
      attempts += 1;
      if ((error as NodeJS.ErrnoException).code !== "EBUSY" || attempts >= maxAttempts) {
        console.error(`error: failed to read agent response: ${(error as Error).message}`);
        return false;
      }
      await sleep(pollInterval);
    }
  }

  return false;
}

async function prepareSubagentDirectory(
  subagentDir: string,
  promptFile: string,
  chatId: string,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    return 0;
  }

  try {
    await copyAgentConfig(subagentDir);
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

  const chatmodeFile = path.join(subagentDir, `${chatId}.chatmode.md`);
  try {
    await copyFile(promptFile, chatmodeFile);
  } catch (error) {
    console.error(`error: Failed to copy prompt file to chatmode: ${(error as Error).message}`);
    return 1;
  }

  return 0;
}

function createRequestPrompt(
  userQuery: string,
  responseFileTmp: string,
  responseFileFinal: string,
  subagentName: string,
): string {
  return String.raw`[[ ## task ## ]]
${userQuery}

[[ ## system_instructions ## ]]

**IMPORTANT**: Follow these exact steps:
1. Create and write your complete response to: ${responseFileTmp}
2. When completely finished, run these PowerShell commands to signal completion:
\`\`\`
Move-Item -LiteralPath '${responseFileTmp}' -Destination '${responseFileFinal}'
subagent code unlock --subagent ${subagentName}
\`\`\`

Do not proceed to step 2 until your response is completely written to the temporary file.`;
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
  sudolangPrompt: string,
  timestamp: string,
  vscodeCmd: string,
): Promise<boolean> {
  try {
    const workspacePath = path.join(subagentDir, `${path.basename(subagentDir)}.code-workspace`);
    const messagesDir = path.join(subagentDir, "messages");
    await mkdir(messagesDir, { recursive: true });

    const reqFile = path.join(messagesDir, `${timestamp}_req.md`);
    await writeFile(reqFile, sudolangPrompt, { encoding: "utf8" });

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

export interface DispatchOptions {
  userQuery: string;
  promptFile: string;
  extraAttachments?: readonly string[];
  dryRun?: boolean;
  wait?: boolean;
  vscodeCmd?: string;
}

export async function dispatchAgent(options: DispatchOptions): Promise<number> {
  const {
    userQuery,
    promptFile,
    extraAttachments,
    dryRun = false,
    wait = false,
    vscodeCmd = "code",
  } = options;

  try {
    const resolvedPrompt = path.resolve(promptFile);
    if (!(await pathExists(resolvedPrompt))) {
      throw new Error(`Prompt file not found: ${resolvedPrompt}`);
    }

    const promptStats = await stat(resolvedPrompt);
    if (!promptStats.isFile()) {
      throw new Error(`Prompt file must be a file, not a directory: ${resolvedPrompt}`);
    }

    const subagentRoot = getSubagentRoot();
    const subagentDir = await findUnlockedSubagent(subagentRoot);
    if (!subagentDir) {
      console.error(
        "error: No unlocked subagents available. Provision additional subagents with:\n  subagent code provision --subagents <desired_total>",
      );
      return 1;
    }

    console.error(`info: Acquiring subagent: ${path.basename(subagentDir)}`);

    const chatId = Math.random().toString(16).slice(2, 10);
    const preparationResult = await prepareSubagentDirectory(subagentDir, resolvedPrompt, chatId, dryRun);
    if (preparationResult !== 0) {
      return preparationResult;
    }

    const attachments = await resolveAttachments(extraAttachments);

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const messagesDir = path.join(subagentDir, "messages");
    const responseFileTmp = path.join(messagesDir, `${timestamp}_res.tmp.md`);
    const responseFileFinal = path.join(messagesDir, `${timestamp}_res.md`);

    const sudolangPrompt = createRequestPrompt(userQuery, responseFileTmp, responseFileFinal, path.basename(subagentDir));

    process.stdout.write(
      `${JSON.stringify({ success: true, subagent_name: path.basename(subagentDir), response_file: responseFileFinal })}\n`,
    );

    if (dryRun) {
      return 0;
    }

    const launchSuccess = await launchVsCodeWithChat(subagentDir, chatId, attachments, sudolangPrompt, timestamp, vscodeCmd);
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
      console.error(
        `\nAgent dispatched. Response will be written to:\n  ${responseFileFinal}\nMonitor: check if ${path.basename(
          responseFileTmp,
        )} has been renamed to ${path.basename(responseFileFinal)}\n`,
      );
      return 0;
    }

    const received = await waitForResponseOutput(responseFileFinal);
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

export interface ListOptions {
  subagentRoot?: string;
  jsonOutput?: boolean;
}

export async function listSubagents(options: ListOptions): Promise<number> {
  const { subagentRoot = getSubagentRoot(), jsonOutput = false } = options;

  if (!(await pathExists(subagentRoot))) {
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify({ subagents: [] })}\n`);
    } else {
      console.error(`No subagents found in ${subagentRoot}`);
      console.error("hint: Provision subagents first with:\n  subagent code provision --subagents <count>");
    }
    return 1;
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

  if (subagents.length === 0) {
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify({ subagents: [] })}\n`);
    } else {
      console.error(`No subagents found in ${subagentRoot}`);
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

  console.error(`Found ${infoList.length} subagent(s) in ${subagentRoot}`);
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
    subagentRoot = getSubagentRoot(),
    subagents = 1,
    dryRun = false,
    vscodeCmd = "code",
  } = options;

  const workspaces = await getAllSubagentWorkspaces(subagentRoot);

  if (workspaces.length === 0) {
    console.error(`info: No provisioned subagents found in ${subagentRoot}`);
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
