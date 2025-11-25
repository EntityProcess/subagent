import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  dispatchAgent,
  dispatchBatchAgent,
  dispatchAgentSession,
  findUnlockedSubagent,
  listSubagents,
} from "../src/vscode/agentDispatch.js";
import { provisionSubagents } from "../src/vscode/provision.js";
import { DEFAULT_LOCK_NAME } from "../src/vscode/constants.js";
import { pathExists } from "../src/utils/fs.js";

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
  exec: vi.fn((cmd, options, callback) => {
    // Mock exec to simulate VS Code not running (workspace not opened)
    if (callback) {
      callback(null, { stdout: "", stderr: "" }, "");
    }
  }),
}));

// Mock promisify to return our mocked exec
vi.mock("util", async () => {
  const actual = await vi.importActual<typeof import("util")>("util");
  return {
    ...actual,
    promisify: (fn: Function) => {
      if (fn.name === "exec") {
        return async () => ({ stdout: "", stderr: "" });
      }
      return actual.promisify(fn as any);
    },
  };
});

describe("agent dispatch", () => {
  let tmpDir: string;
  let targetRoot: string;
  let promptFile: string;
  let customWorkspaceTemplate: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tmpDir = path.join(os.tmpdir(), `subagent-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await mkdir(tmpDir, { recursive: true });

    // Create target root directory
    targetRoot = path.join(tmpDir, "agents");
    await mkdir(targetRoot, { recursive: true });

    // Create a test prompt file
    promptFile = path.join(tmpDir, "test-prompt.md");
    await writeFile(promptFile, "# Test Prompt\n\nTest instructions");

    // Create a custom workspace template file
    customWorkspaceTemplate = path.join(tmpDir, "custom.code-workspace");
    await writeFile(customWorkspaceTemplate, JSON.stringify({ folders: [{ path: "." }], settings: { "custom.setting": true } }));
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await pathExists(tmpDir)) {
      const { rm } = await import("fs/promises");
      await rm(tmpDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe("findUnlockedSubagent", () => {
    it("should return null for nonexistent directory", async () => {
      const nonexistentRoot = path.join(tmpDir, "nonexistent");
      const result = await findUnlockedSubagent(nonexistentRoot);
      expect(result).toBeNull();
    });

    it("should return null for empty directory", async () => {
      const result = await findUnlockedSubagent(targetRoot);
      expect(result).toBeNull();
    });

    it("should find first unlocked subagent", async () => {
      // Provision 3 subagents
      await provisionSubagents({
        targetRoot,
        subagents: 3,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const result = await findUnlockedSubagent(targetRoot);

      expect(result).not.toBeNull();
      expect(result).toContain("subagent-1");
    });

    it("should skip locked subagents", async () => {
      // Provision 3 subagents
      await provisionSubagents({
        targetRoot,
        subagents: 3,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Lock subagent-1
      await writeFile(path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME), "");

      const result = await findUnlockedSubagent(targetRoot);

      expect(result).not.toBeNull();
      expect(result).toContain("subagent-2");
    });

    it("should return null when all subagents are locked", async () => {
      // Provision 2 subagents
      await provisionSubagents({
        targetRoot,
        subagents: 2,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Lock both subagents
      await writeFile(path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME), "");
      await writeFile(path.join(targetRoot, "subagent-2", DEFAULT_LOCK_NAME), "");

      const result = await findUnlockedSubagent(targetRoot);

      expect(result).toBeNull();
    });
  });

  describe("dispatchAgent", () => {
    it("should return error when no unlocked subagents available", async () => {
      const exitCode = await dispatchAgent({
        userQuery: "test query",
        promptFile,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(1);
    });

    it("should return error for nonexistent prompt file", async () => {
      // Provision 1 subagent
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        promptFile: path.join(tmpDir, "nonexistent.md"),
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(1);
    });

    it("should succeed in dry run mode", async () => {
      // Provision 1 subagent
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        promptFile,
        subagentRoot: targetRoot,
        dryRun: true,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // No lock file should be created in dry run
      const lockFile = path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME);
      expect(await pathExists(lockFile)).toBe(false);
    });
  });

  describe("dispatchBatchAgent", () => {
    it("returns an error for an empty query array", async () => {
      const result = await dispatchBatchAgent({
        userQueries: [],
        subagentRoot: targetRoot,
        vscodeCmd: "code",
      });

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe("At least one query is required for batch dispatch");
      expect(result.queryCount).toBe(0);
      expect(result.requestFiles).toEqual([]);
    });
  });

  describe("dispatchAgentSession", () => {
    it("returns structured data in dry run mode", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const result = await dispatchAgentSession({
        userQuery: "test query",
        promptFile,
        subagentRoot: targetRoot,
        dryRun: true,
        wait: true,
        vscodeCmd: "code",
      });

      expect(result.exitCode).toBe(0);
      expect(result.subagentName).toBe("subagent-1");
      expect(result.responseFile).toBeDefined();
      expect(result.tempFile).toBeDefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe("listSubagents", () => {
    it("should return error for nonexistent directory", async () => {
      const nonexistentRoot = path.join(tmpDir, "nonexistent");
      const exitCode = await listSubagents({
        subagentRoot: nonexistentRoot,
        jsonOutput: false,
      });

      expect(exitCode).toBe(1);
    });

    it("should return error for empty directory", async () => {
      const exitCode = await listSubagents({
        subagentRoot: targetRoot,
        jsonOutput: false,
      });

      expect(exitCode).toBe(1);
    });

    it("should list provisioned subagents", async () => {
      // Provision 3 subagents
      await provisionSubagents({
        targetRoot,
        subagents: 3,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Lock subagent-1
      await writeFile(path.join(targetRoot, "subagent-1", DEFAULT_LOCK_NAME), "");

      const exitCode = await listSubagents({
        subagentRoot: targetRoot,
        jsonOutput: false,
      });

      expect(exitCode).toBe(0);
    });

    it("should output JSON when requested", async () => {
      // Provision 2 subagents
      await provisionSubagents({
        targetRoot,
        subagents: 2,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Mock console.log to capture output
      const originalLog = process.stdout.write;
      let output = "";
      process.stdout.write = ((str: string) => {
        output += str;
        return true;
      }) as any;

      const exitCode = await listSubagents({
        subagentRoot: targetRoot,
        jsonOutput: true,
      });

      process.stdout.write = originalLog;

      expect(exitCode).toBe(0);
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.subagents).toHaveLength(2);
    });
  });

  describe("custom workspace template", () => {
    it("should return error for nonexistent workspace template", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        workspaceTemplate: path.join(tmpDir, "nonexistent.code-workspace"),
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(1);
    });

    it("should return error when workspace template is a directory", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Create a directory instead of a file
      const dirTemplate = path.join(tmpDir, "dir-template");
      await mkdir(dirTemplate, { recursive: true });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        workspaceTemplate: dirTemplate,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(1);
    });

    it("should work with dispatchAgentSession", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const result = await dispatchAgentSession({
        userQuery: "test query",
        workspaceTemplate: customWorkspaceTemplate,
        subagentRoot: targetRoot,
        dryRun: true,
        wait: false,
        vscodeCmd: "code",
      });

      expect(result.exitCode).toBe(0);
      expect(result.subagentName).toBe("subagent-1");
    });
  });
});
