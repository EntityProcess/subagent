import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { getAllSubagentWorkspaces, warmupSubagents } from "../src/vscode/agentDispatch.js";
import { provisionSubagents } from "../src/vscode/provision.js";
import { DEFAULT_LOCK_NAME, DEFAULT_WORKSPACE_FILENAME } from "../src/vscode/constants.js";
import { pathExists } from "../src/utils/fs.js";

// Mock child_process spawn
vi.mock("child_process", () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
  exec: vi.fn(),
}));

describe("warmup", () => {
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
    vi.clearAllMocks();
  });

  describe("getAllSubagentWorkspaces", () => {
    it("should return empty array for empty directory", async () => {
      const workspaces = await getAllSubagentWorkspaces(targetRoot);
      expect(workspaces).toEqual([]);
    });

    it("should return empty array for nonexistent directory", async () => {
      const nonexistentRoot = path.join(tmpDir, "nonexistent");
      const workspaces = await getAllSubagentWorkspaces(nonexistentRoot);
      expect(workspaces).toEqual([]);
    });

    it("should return workspace files for provisioned subagents", async () => {
      // Provision 3 subagents
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 3,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const workspaces = await getAllSubagentWorkspaces(targetRoot);

      expect(workspaces).toHaveLength(3);
      expect(workspaces[0]).toContain("subagent-1.code-workspace");
      expect(workspaces[1]).toContain("subagent-2.code-workspace");
      expect(workspaces[2]).toContain("subagent-3.code-workspace");
    });

    it("should skip subagent directories missing workspace file", async () => {
      // Provision properly first
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 2,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Then DELETE the workspace file from subagent-1
      const { rm } = await import("fs/promises");
      const subagent1Workspace = path.join(targetRoot, "subagent-1", "subagent-1.code-workspace");
      await rm(subagent1Workspace);

      const workspaces = await getAllSubagentWorkspaces(targetRoot);

      // Should only return subagent-2 since subagent-1 has no workspace file
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]).toContain("subagent-2.code-workspace");
    });
  });

  describe("warmupSubagents", () => {
    it("should return error code when no workspaces found", async () => {
      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 1,
        dryRun: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(1);
    });

    it("should not spawn processes during dry run", async () => {
      // Provision 2 subagents
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 2,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const { spawn } = await import("child_process");

      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 2,
        dryRun: true,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);
      expect(spawn).not.toHaveBeenCalled();
    });

    it("should open workspaces when not dry run", async () => {
      // Provision 2 subagents
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 2,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const { spawn } = await import("child_process");

      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 2,
        dryRun: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    it("should respect count limit", async () => {
      // Provision 5 subagents
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 5,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const { spawn } = await import("child_process");

      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 3,
        dryRun: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);
      // Should only open 3 workspaces, not all 5
      expect(spawn).toHaveBeenCalledTimes(3);
    });

    it("should default to opening one workspace", async () => {
      // Provision 3 subagents
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 3,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const { spawn } = await import("child_process");

      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 1,
        dryRun: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it("should use specified vscode command", async () => {
      // Provision 1 subagent
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const { spawn } = await import("child_process");

      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 1,
        dryRun: false,
        vscodeCmd: "code-insiders",
      });

      expect(exitCode).toBe(0);
      expect(spawn).toHaveBeenCalled();

      // Check that code-insiders was used (check the call arguments)
      const calls = vi.mocked(spawn).mock.calls;
      expect(calls[0][0]).toBe("code-insiders");
    });
  });
});
