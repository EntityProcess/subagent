import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { provisionSubagents, unlockSubagents } from "../src/vscode/provision.js";
import { DEFAULT_LOCK_NAME, DEFAULT_WORKSPACE_FILENAME } from "../src/vscode/constants.js";
import { pathExists, removeIfExists } from "../src/utils/fs.js";

describe("provision", () => {
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
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await pathExists(tmpDir)) {
      const { rm } = await import("fs/promises");
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("should provision a single subagent", async () => {
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 1,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    expect(result.created).toHaveLength(1);
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(0);

    const subagentDir = path.join(targetRoot, "subagent-1");
    expect(await pathExists(subagentDir)).toBe(true);
    expect(await pathExists(path.join(subagentDir, "subagent-1.code-workspace"))).toBe(true);
  });

  it("should provision multiple subagents", async () => {
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 3,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    expect(result.created).toHaveLength(3);
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(0);

    for (let i = 1; i <= 3; i++) {
      const subagentDir = path.join(targetRoot, `subagent-${i}`);
      expect(await pathExists(subagentDir)).toBe(true);
    }
  });

  it("should skip existing unlocked subagents", async () => {
    // Create initial subagent
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 1,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Provision again without force
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 1,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    expect(result.created).toHaveLength(0);
    expect(result.skippedExisting).toHaveLength(1);
    expect(result.skippedLocked).toHaveLength(0);
  });

  it("should skip locked subagents without force", async () => {
    // Create initial subagent
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 1,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Create lock file
    const lockFile = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
    await writeFile(lockFile, "");

    // Request 1 unlocked subagent - should create subagent-2
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 1,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toContain("subagent-2");
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(1);

    // Both should exist
    expect(await pathExists(path.join(targetRoot, "subagent-1"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, "subagent-2"))).toBe(true);
  });

  it("should overwrite unlocked subagents with force", async () => {
    // Create initial subagent
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 1,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Add a marker file
    const markerPath = path.join(targetRoot, "subagent-1", "marker.txt");
    await writeFile(markerPath, "should remain");

    // Provision with force
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 1,
      lockName: DEFAULT_LOCK_NAME,
      force: true,
      dryRun: false,
    });

    expect(result.created).toHaveLength(1);
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(0);

    // Marker file should remain (we don't delete files, just overwrite template)
    expect(await pathExists(markerPath)).toBe(true);
    expect(await pathExists(path.join(targetRoot, "subagent-1", "subagent-1.code-workspace"))).toBe(true);
  });

  it("should unlock and overwrite locked subagents with force", async () => {
    // Create 2 initial subagents
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 2,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Lock both subagents
    const lockFile1 = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
    const lockFile2 = path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME);
    await writeFile(lockFile1, "");
    await writeFile(lockFile2, "");

    // Request 2 subagents with force
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 2,
      lockName: DEFAULT_LOCK_NAME,
      force: true,
      dryRun: false,
    });

    expect(result.created).toHaveLength(2);
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(0);

    // Both should exist
    expect(await pathExists(path.join(targetRoot, "subagent-1"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, "subagent-2"))).toBe(true);

    // Lock files should be removed
    expect(await pathExists(lockFile1)).toBe(false);
    expect(await pathExists(lockFile2)).toBe(false);
  });

  it("should not create files during dry run", async () => {
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 2,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: true,
    });

    expect(result.created).toHaveLength(2);
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(0);

    // Nothing should actually exist
    expect(await pathExists(path.join(targetRoot, "subagent-1"))).toBe(false);
    expect(await pathExists(path.join(targetRoot, "subagent-2"))).toBe(false);
  });

  it("should throw error for invalid template path", async () => {
    await expect(
      provisionSubagents({
        templateDir: "/nonexistent/path",
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      }),
    ).rejects.toThrow("not a directory");
  });

  it("should throw error for zero subagents", async () => {
    await expect(
      provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 0,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      }),
    ).rejects.toThrow("positive integer");
  });

  it("should provision additional subagents when existing ones are locked", async () => {
    // Create 2 initial subagents
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 2,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Lock both subagents
    await writeFile(path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME), "");
    await writeFile(path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME), "");

    // Request 2 unlocked subagents
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 2,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    expect(result.created).toHaveLength(2);
    expect(result.created.some((p) => p.includes("subagent-3"))).toBe(true);
    expect(result.created.some((p) => p.includes("subagent-4"))).toBe(true);
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(2);

    // All should exist
    expect(await pathExists(path.join(targetRoot, "subagent-1"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, "subagent-2"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, "subagent-3"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, "subagent-4"))).toBe(true);
  });

  it("should handle partial locked subagents", async () => {
    // Create 3 initial subagents
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 3,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Lock subagent-1 and subagent-3, leave subagent-2 unlocked
    await writeFile(path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME), "");
    await writeFile(path.join(targetRoot, "subagent-3", DEFAULT_LOCK_NAME), "");

    // Request 2 unlocked subagents
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 2,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toContain("subagent-4");
    expect(result.skippedExisting).toHaveLength(1);
    expect(result.skippedExisting[0]).toContain("subagent-2");
    expect(result.skippedLocked).toHaveLength(2);

    expect(await pathExists(path.join(targetRoot, "subagent-4"))).toBe(true);
  });

  it("should handle force with mixed locked and unlocked subagents", async () => {
    // Create 4 initial subagents
    await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 4,
      lockName: DEFAULT_LOCK_NAME,
      force: false,
      dryRun: false,
    });

    // Lock subagent-1 and subagent-2, leave subagent-3 and subagent-4 unlocked
    const lockFile1 = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
    const lockFile2 = path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME);
    await writeFile(lockFile1, "");
    await writeFile(lockFile2, "");

    // Request 2 subagents with force
    const result = await provisionSubagents({
      templateDir,
      targetRoot,
      subagents: 2,
      lockName: DEFAULT_LOCK_NAME,
      force: true,
      dryRun: false,
    });

    expect(result.created).toHaveLength(2);
    expect(result.skippedExisting).toHaveLength(0);
    expect(result.skippedLocked).toHaveLength(0);

    // All should exist
    expect(await pathExists(path.join(targetRoot, "subagent-1"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, "subagent-2"))).toBe(true);

    // Lock files should be removed
    expect(await pathExists(lockFile1)).toBe(false);
    expect(await pathExists(lockFile2)).toBe(false);
  });
});
