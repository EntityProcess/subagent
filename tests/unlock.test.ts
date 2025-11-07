import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { provisionSubagents, unlockSubagents } from "../src/vscode/provision.js";
import { DEFAULT_LOCK_NAME, DEFAULT_WORKSPACE_FILENAME } from "../src/vscode/constants.js";
import { pathExists } from "../src/utils/fs.js";

describe("unlock", () => {
  let tmpDir: string;
  let templateDir: string;
  let targetRoot: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tmpDir = path.join(os.tmpdir(), `subagent-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await mkdir(tmpDir, { recursive: true });

    // Create template directory
    templateDir = path.join(tmpDir, "template");
    await mkdir(templateDir, { recursive: true });
    await writeFile(path.join(templateDir, DEFAULT_WORKSPACE_FILENAME), "{}");

    // Create target root directory
    targetRoot = path.join(tmpDir, "agents");
    await mkdir(targetRoot, { recursive: true });

    // Provision 3 subagents
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 3,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Lock subagent-1 and subagent-2
    await writeFile(path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME), "");
    await writeFile(path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME), "");
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await pathExists(tmpDir)) {
      const { rm } = await import("fs/promises");
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("should unlock a specific locked subagent", async () => {
    const lockFile = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
    expect(await pathExists(lockFile)).toBe(true);

    const unlocked = await unlockSubagents({
      targetRoot,
      lockName: DEFAULT_LOCK_NAME,
      subagentName: "subagent-1",
      unlockAll: false,
      dryRun: false,
    });

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]).toContain("subagent-1");
    expect(await pathExists(lockFile)).toBe(false);

    // subagent-2 should still be locked
    expect(await pathExists(path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME))).toBe(true);
  });

  it("should return empty array when unlocking a non-locked subagent", async () => {
    const unlocked = await unlockSubagents({
      targetRoot,
      lockName: DEFAULT_LOCK_NAME,
      subagentName: "subagent-3",
      unlockAll: false,
      dryRun: false,
    });

    expect(unlocked).toHaveLength(0);
  });

  it("should unlock all locked subagents", async () => {
    const lockFile1 = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
    const lockFile2 = path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME);

    expect(await pathExists(lockFile1)).toBe(true);
    expect(await pathExists(lockFile2)).toBe(true);

    const unlocked = await unlockSubagents({
      targetRoot,
      lockName: DEFAULT_LOCK_NAME,
      unlockAll: true,
      dryRun: false,
    });

    expect(unlocked).toHaveLength(2);
    expect(unlocked.some((p) => p.includes("subagent-1"))).toBe(true);
    expect(unlocked.some((p) => p.includes("subagent-2"))).toBe(true);

    expect(await pathExists(lockFile1)).toBe(false);
    expect(await pathExists(lockFile2)).toBe(false);
  });

  it("should not remove lock files during dry run (specific)", async () => {
    const lockFile = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
    expect(await pathExists(lockFile)).toBe(true);

    const unlocked = await unlockSubagents({
      targetRoot,
      lockName: DEFAULT_LOCK_NAME,
      subagentName: "subagent-1",
      unlockAll: false,
      dryRun: true,
    });

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]).toContain("subagent-1");

    // Lock file should still exist
    expect(await pathExists(lockFile)).toBe(true);
  });

  it("should not remove lock files during dry run (all)", async () => {
    const lockFile1 = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
    const lockFile2 = path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME);

    const unlocked = await unlockSubagents({
      targetRoot,
      lockName: DEFAULT_LOCK_NAME,
      unlockAll: true,
      dryRun: true,
    });

    expect(unlocked).toHaveLength(2);

    // Lock files should still exist
    expect(await pathExists(lockFile1)).toBe(true);
    expect(await pathExists(lockFile2)).toBe(true);
  });

  it("should throw error for nonexistent subagent", async () => {
    await expect(
      unlockSubagents({
        targetRoot,
        lockName: DEFAULT_LOCK_NAME,
        subagentName: "subagent-99",
        unlockAll: false,
        dryRun: false,
      }),
    ).rejects.toThrow("does not exist");
  });

  it("should throw error for nonexistent target root", async () => {
    const nonexistentRoot = path.join(tmpDir, "nonexistent");

    await expect(
      unlockSubagents({
        targetRoot: nonexistentRoot,
        lockName: DEFAULT_LOCK_NAME,
        subagentName: "subagent-1",
        unlockAll: false,
        dryRun: false,
      }),
    ).rejects.toThrow("does not exist");
  });

  it("should throw error when neither subagentName nor unlockAll is specified", async () => {
    await expect(
      unlockSubagents({
        targetRoot,
        lockName: DEFAULT_LOCK_NAME,
        unlockAll: false,
        dryRun: false,
      }),
    ).rejects.toThrow("must specify either --subagent or --all");
  });

  it("should throw error when both subagentName and unlockAll are specified", async () => {
    await expect(
      unlockSubagents({
        targetRoot,
        lockName: DEFAULT_LOCK_NAME,
        subagentName: "subagent-1",
        unlockAll: true,
        dryRun: false,
      }),
    ).rejects.toThrow("must specify either --subagent or --all");
  });

  it("should return empty array when unlocking all with no locked subagents", async () => {
    // First unlock all existing locks
    await unlockSubagents({
      targetRoot,
      lockName: DEFAULT_LOCK_NAME,
      unlockAll: true,
      dryRun: false,
    });

    // Try to unlock all again
    const unlocked = await unlockSubagents({
      targetRoot,
      lockName: DEFAULT_LOCK_NAME,
      unlockAll: true,
      dryRun: false,
    });

    expect(unlocked).toHaveLength(0);
  });

  it("should handle custom lock name", async () => {
    const customLockName = "custom.lock";
    const customLockFile = path.join(targetRoot, "subagent-1", customLockName);

    // Create a custom lock file
    await writeFile(customLockFile, "");
    expect(await pathExists(customLockFile)).toBe(true);

    const unlocked = await unlockSubagents({
      targetRoot,
      lockName: customLockName,
      subagentName: "subagent-1",
      unlockAll: false,
      dryRun: false,
    });

    expect(unlocked).toHaveLength(1);
    expect(await pathExists(customLockFile)).toBe(false);

    // Default lock should still exist
    expect(await pathExists(path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME))).toBe(true);
  });
});
