import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";

import { DEFAULT_LOCK_NAME, getDefaultSubagentRoot } from "./constants.js";
import { pathExists, readDirEntries, removeIfExists } from "../utils/fs.js";
import { transformWorkspacePaths } from "../utils/workspace.js";

/**
 * Default workspace template content
 */
const DEFAULT_WORKSPACE_TEMPLATE = {
  folders: [
    {
      path: ".",
    },
  ],
};

/**
 * Get the subagent root directory
 */
export function getSubagentRoot(vscodeCmd: string = "code"): string {
  return getDefaultSubagentRoot(vscodeCmd);
}

/**
 * Get all subagent workspace file paths
 */
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

/**
 * Find the first unlocked subagent directory
 */
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

/**
 * Copy agent configuration files to subagent directory
 */
export async function copyAgentConfig(
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

/**
 * Create a lock file and clean up messages directory
 */
export async function createSubagentLock(subagentDir: string): Promise<string> {
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

/**
 * Remove the lock file from a subagent directory
 */
export async function removeSubagentLock(subagentDir: string): Promise<void> {
  const lockFile = path.join(subagentDir, DEFAULT_LOCK_NAME);
  await removeIfExists(lockFile);
}

/**
 * Prepare a subagent directory for dispatch
 */
export async function prepareSubagentDirectory(
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

export interface ListOptions {
  subagentRoot?: string;
  jsonOutput?: boolean;
  vscodeCmd?: string;
}

/**
 * List all subagents with their status
 */
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

/**
 * Warm up subagents by opening their workspaces
 */
export async function warmupSubagents(options: WarmupOptions): Promise<number> {
  const { subagentRoot, subagents = 1, dryRun = false, vscodeCmd = "code" } = options;

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
