import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  dispatchAgent,
  dispatchAgentSession,
  findUnlockedSubagent,
  listSubagents,
} from "../src/vscode/agentDispatch.js";
import { provisionSubagents } from "../src/vscode/provision.js";
import { DEFAULT_LOCK_NAME, DEFAULT_WORKSPACE_FILENAME } from "../src/vscode/constants.js";
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
  let templateDir: string;
  let targetRoot: string;
  let promptFile: string;
  let customWorkspaceTemplate: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tmpDir = path.join(os.tmpdir(), `subagent-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await mkdir(tmpDir, { recursive: true });

    // Create template directory
    templateDir = path.join(tmpDir, "template");
    await mkdir(templateDir, { recursive: true });
    await writeFile(path.join(templateDir, DEFAULT_WORKSPACE_FILENAME), "{}");
    await writeFile(path.join(templateDir, "wakeup.chatmode.md"), "# Wakeup");

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
        templateDir,
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
        templateDir,
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
        templateDir,
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
        templateDir,
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

    it("should create lock file when dispatching", async () => {
      // Provision 1 subagent
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");
      
      // Mock spawn to create .alive file when chat command is called
      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        // If this is a chat command with "create a file named .alive", create the file
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        promptFile,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Lock file should be created
      const lockFile = path.join(subagentDir, DEFAULT_LOCK_NAME);
      expect(await pathExists(lockFile)).toBe(true);
    });

    it("should copy chatmode file", async () => {
      // Provision 1 subagent
      await provisionSubagents({
        templateDir,
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");
      
      // Mock spawn to create .alive file when chat command is called
      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        // If this is a chat command with "create a file named .alive", create the file
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        promptFile,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Check that a chatmode file was created
      const files = await import("fs/promises").then((fs) => fs.readdir(subagentDir));
      const chatmodeFiles = files.filter((f) => f.endsWith(".chatmode.md"));
      expect(chatmodeFiles.length).toBeGreaterThan(0);
    });
  });

  describe("dispatchAgentSession", () => {
    it("returns structured data in dry run mode", async () => {
      await provisionSubagents({
        templateDir,
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
        templateDir,
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
        templateDir,
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
    it("should use custom workspace template when provided", async () => {
      // Provision 1 subagent
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");

      // Mock spawn to create .alive file when chat command is called
      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        promptFile,
        workspaceTemplate: customWorkspaceTemplate,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Verify custom workspace template was copied
      const workspaceFile = path.join(subagentDir, "subagent-1.code-workspace");
      expect(await pathExists(workspaceFile)).toBe(true);

      const { readFile } = await import("fs/promises");
      const workspaceContent = JSON.parse(await readFile(workspaceFile, "utf8"));
      expect(workspaceContent.settings).toEqual({ "custom.setting": true });
    });

    it("should transform relative paths in workspace template to absolute paths", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Create a template directory with a lib subdirectory
      const libDir = path.join(tmpDir, "lib");
      await mkdir(libDir, { recursive: true });

      // Create a workspace template with relative paths
      const relativeTemplate = path.join(tmpDir, "relative.code-workspace");
      await writeFile(
        relativeTemplate,
        JSON.stringify({
          folders: [
            { path: "./lib" },
            { path: "../other" },
          ],
        })
      );

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");

      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        workspaceTemplate: relativeTemplate,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Read the workspace file and verify paths were transformed
      const { readFile } = await import("fs/promises");
      const workspaceFile = path.join(subagentDir, "subagent-1.code-workspace");
      const workspaceContent = JSON.parse(await readFile(workspaceFile, "utf8"));

      // First folder should be "." (subagent directory)
      expect(workspaceContent.folders[0].path).toBe(".");

      // Second folder should be resolved to absolute path
      expect(workspaceContent.folders[1].path).toBe(path.resolve(tmpDir, "./lib"));

      // Third folder should be resolved to absolute path
      expect(workspaceContent.folders[2].path).toBe(path.resolve(tmpDir, "../other"));
    });

    it("should preserve absolute paths in workspace template", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const absolutePath = path.resolve(tmpDir, "absolute-folder");
      const absoluteTemplate = path.join(tmpDir, "absolute.code-workspace");
      await writeFile(
        absoluteTemplate,
        JSON.stringify({
          folders: [
            { path: absolutePath },
            { path: "./relative" },
          ],
        })
      );

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");

      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        workspaceTemplate: absoluteTemplate,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Read the workspace file and verify absolute path was preserved
      const { readFile } = await import("fs/promises");
      const workspaceFile = path.join(subagentDir, "subagent-1.code-workspace");
      const workspaceContent = JSON.parse(await readFile(workspaceFile, "utf8"));

      expect(workspaceContent.folders[0].path).toBe(".");
      expect(workspaceContent.folders[1].path).toBe(absolutePath);
      expect(workspaceContent.folders[2].path).toBe(path.resolve(tmpDir, "./relative"));
    });

    it("should insert subagent folder as first entry", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const templateWithFolders = path.join(tmpDir, "multi.code-workspace");
      await writeFile(
        templateWithFolders,
        JSON.stringify({
          folders: [
            { path: "./src" },
            { path: "./lib" },
          ],
        })
      );

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");

      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        workspaceTemplate: templateWithFolders,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Read workspace file and verify "." is first
      const { readFile } = await import("fs/promises");
      const workspaceFile = path.join(subagentDir, "subagent-1.code-workspace");
      const workspaceContent = JSON.parse(await readFile(workspaceFile, "utf8"));

      expect(workspaceContent.folders[0]).toEqual({ path: "." });
      expect(workspaceContent.folders.length).toBe(3); // . + src + lib
    });

    it("should resolve '.' in template to template directory absolute path", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const dotTemplate = path.join(tmpDir, "dot.code-workspace");
      await writeFile(
        dotTemplate,
        JSON.stringify({
          folders: [{ path: "." }],
        })
      );

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");

      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        workspaceTemplate: dotTemplate,
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Read workspace file and verify "." in template was resolved to tmpDir
      const { readFile } = await import("fs/promises");
      const workspaceFile = path.join(subagentDir, "subagent-1.code-workspace");
      const workspaceContent = JSON.parse(await readFile(workspaceFile, "utf8"));

      expect(workspaceContent.folders[0]).toEqual({ path: "." }); // Subagent folder
      expect(workspaceContent.folders[1].path).toBe(tmpDir); // Template's "." resolved
    });

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

    it("should use default template when no workspace template specified", async () => {
      await provisionSubagents({
        targetRoot,
        subagents: 1,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const subagentDir = path.join(targetRoot, "subagent-1");
      const aliveFile = path.join(subagentDir, ".alive");

      const { spawn } = await import("child_process");
      vi.mocked(spawn).mockImplementation((command: string, args?: readonly string[]) => {
        if (args && args.includes("chat") && args.includes("create a file named .alive")) {
          setTimeout(async () => {
            await writeFile(aliveFile, "").catch(() => {});
          }, 10);
        }
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        } as any;
      });

      const exitCode = await dispatchAgent({
        userQuery: "test query",
        promptFile,
        // No workspaceTemplate specified
        subagentRoot: targetRoot,
        dryRun: false,
        wait: false,
        vscodeCmd: "code",
      });

      expect(exitCode).toBe(0);

      // Workspace file should exist (using default template)
      const workspaceFile = path.join(subagentDir, "subagent-1.code-workspace");
      expect(await pathExists(workspaceFile)).toBe(true);
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
