import { copyFile } from "fs/promises";
import path from "path";

import {
  DEFAULT_LOCK_NAME,
  DEFAULT_TEMPLATE_DIR,
  DEFAULT_WORKSPACE_FILENAME,
} from "./constants.js";
import { ensureDir, isDirectory, pathExists, readDirEntries, removeIfExists } from "../utils/fs.js";

export interface ProvisionOptions {
  templateDir?: string;
  targetRoot: string;
  subagents: number;
  lockName?: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface ProvisionResult {
  created: string[];
  skippedExisting: string[];
  skippedLocked: string[];
}

export async function provisionSubagents(options: ProvisionOptions): Promise<ProvisionResult> {
  const {
    templateDir = DEFAULT_TEMPLATE_DIR,
    targetRoot,
    subagents,
    lockName = DEFAULT_LOCK_NAME,
    force = false,
    dryRun = false,
  } = options;

  if (!Number.isInteger(subagents) || subagents < 1) {
    throw new Error("subagents must be a positive integer");
  }

  const templatePath = path.resolve(templateDir);
  const targetPath = path.resolve(targetRoot);

  if (!(await isDirectory(templatePath))) {
    throw new Error(`template path ${templatePath} is not a directory`);
  }

  const workspaceSrc = path.join(templatePath, DEFAULT_WORKSPACE_FILENAME);
  if (!(await pathExists(workspaceSrc))) {
    throw new Error(`workspace template not found at ${workspaceSrc}`);
  }

  if (!dryRun) {
    await ensureDir(targetPath);
  }

  let highestNumber = 0;
  const lockedSubagents = new Set<string>();
  const existingSubagents: Array<{ number: number; absolutePath: string }> = [];

  if (await pathExists(targetPath)) {
    const entries = await readDirEntries(targetPath);
    for (const entry of entries) {
      if (!entry.isDirectory || !entry.name.startsWith("subagent-")) {
        continue;
      }

      const suffix = entry.name.split("-")[1];
      const parsed = Number.parseInt(suffix, 10);
      if (!Number.isInteger(parsed)) {
        continue;
      }

      highestNumber = Math.max(highestNumber, parsed);
      const lockFile = path.join(entry.absolutePath, lockName);
      const locked = await pathExists(lockFile);
      if (locked) {
        lockedSubagents.add(entry.absolutePath);
      }

      existingSubagents.push({ number: parsed, absolutePath: entry.absolutePath });
    }

    existingSubagents.sort((a, b) => a.number - b.number);
  }

  const created: string[] = [];
  const skippedExisting: string[] = [];

  let subagentsProvisioned = 0;

  for (const subagent of existingSubagents) {
    if (subagentsProvisioned >= subagents) {
      break;
    }

    const subagentDir = subagent.absolutePath;
    const lockFile = path.join(subagentDir, lockName);
    const workspaceDst = path.join(subagentDir, `${path.basename(subagentDir)}.code-workspace`);

    const isLocked = await pathExists(lockFile);
    if (isLocked && !force) {
      continue;
    }

    if (isLocked && force) {
      if (!dryRun) {
        await removeIfExists(lockFile);
        await copyFile(workspaceSrc, workspaceDst);
      }
      created.push(subagentDir);
      lockedSubagents.delete(subagentDir);
      subagentsProvisioned += 1;
      continue;
    }

    if (!dryRun && !(await pathExists(workspaceDst))) {
      await copyFile(workspaceSrc, workspaceDst);
    }

    skippedExisting.push(subagentDir);
    subagentsProvisioned += 1;
  }

  let nextIndex = highestNumber;
  while (subagentsProvisioned < subagents) {
    nextIndex += 1;
    const subagentDir = path.join(targetPath, `subagent-${nextIndex}`);
    const workspaceDst = path.join(subagentDir, `${path.basename(subagentDir)}.code-workspace`);

    if (!dryRun) {
      await ensureDir(subagentDir);
      await copyFile(workspaceSrc, workspaceDst);
    }

    created.push(subagentDir);
    subagentsProvisioned += 1;
  }

  return {
    created,
    skippedExisting,
    skippedLocked: Array.from(lockedSubagents).sort(),
  };
}

export interface UnlockOptions {
  targetRoot: string;
  lockName?: string;
  subagentName?: string;
  unlockAll?: boolean;
  dryRun?: boolean;
}

export async function unlockSubagents(options: UnlockOptions): Promise<string[]> {
  const { targetRoot, lockName = DEFAULT_LOCK_NAME, subagentName, unlockAll = false, dryRun = false } = options;

  if ((subagentName === undefined && !unlockAll) || (subagentName !== undefined && unlockAll)) {
    throw new Error("must specify either --subagent or --all (but not both)");
  }

  const targetPath = path.resolve(targetRoot);
  if (!(await pathExists(targetPath))) {
    throw new Error(`target root ${targetPath} does not exist`);
  }

  const unlocked: string[] = [];

  if (unlockAll) {
    const entries = await readDirEntries(targetPath);
    const candidates = entries
      .filter((entry) => entry.isDirectory && entry.name.startsWith("subagent-"))
      .map((entry) => ({
        absolutePath: entry.absolutePath,
        number: Number.parseInt(entry.name.split("-")[1] ?? "", 10),
      }))
      .filter((entry) => Number.isInteger(entry.number))
      .sort((a, b) => a.number - b.number);

    for (const candidate of candidates) {
      const lockFile = path.join(candidate.absolutePath, lockName);
      if (await pathExists(lockFile)) {
        if (!dryRun) {
          await removeIfExists(lockFile);
        }
        unlocked.push(candidate.absolutePath);
      }
    }
    return unlocked;
  }

  const resolvedName = subagentName!;
  const subagentDir = path.join(targetPath, resolvedName);
  if (!(await pathExists(subagentDir))) {
    throw new Error(`${resolvedName} does not exist in ${targetPath}`);
  }

  const lockFile = path.join(subagentDir, lockName);
  if (await pathExists(lockFile)) {
    if (!dryRun) {
      await removeIfExists(lockFile);
    }
    unlocked.push(subagentDir);
  }

  return unlocked;
}
