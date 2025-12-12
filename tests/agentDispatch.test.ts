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

  describe("template usage integration tests", () => {
    describe("backward compatibility - no template parameter", () => {
      it("should use hardcoded default prompt when requestTemplate is not provided", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        const result = await dispatchAgentSession({
          userQuery: "test query",
          subagentRoot: targetRoot,
          dryRun: true,
          wait: true,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(0);
        expect(result.subagentName).toBe("subagent-1");
        expect(result.responseFile).toBeDefined();
        expect(result.tempFile).toBeDefined();

        // Verify the request file would have been created with hardcoded format
        // In dry run mode, files aren't created, but we can verify the structure is correct
        const expectedTempFile = result.tempFile!;
        const expectedFinalFile = result.responseFile!;
        
        expect(expectedTempFile).toContain("res.tmp.md");
        expect(expectedFinalFile).toContain("res.md");
      });

      it("should create correct request prompt structure without template", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        // Use dry run to verify the structure without actually launching VS Code
        const result = await dispatchAgentSession({
          userQuery: "Implement feature X",
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(0);
        expect(result.subagentName).toBeDefined();
        expect(result.responseFile).toBeDefined();
        expect(result.tempFile).toBeDefined();
      });
    });

    describe("custom template - variable rendering", () => {
      let customRequestTemplate: string;

      beforeEach(async () => {
        // Create a custom template file with variables
        customRequestTemplate = path.join(tmpDir, "custom-request.md");
        const templateContent = `# Custom Request Template

User Query: {{userQuery}}

Temporary Output: {{responseFileTmp}}
Final Output: {{responseFileFinal}}

Please complete the task.`;
        
        await writeFile(customRequestTemplate, templateContent);
      });

      it("should load and render custom template with variables correctly", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        const userQuery = "Test query with custom template";
        const result = await dispatchAgentSession({
          userQuery,
          requestTemplate: customRequestTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(0);
        expect(result.subagentName).toBe("subagent-1");
        expect(result.responseFile).toBeDefined();
        expect(result.tempFile).toBeDefined();
        
        // Verify the template file paths exist
        expect(await pathExists(customRequestTemplate)).toBe(true);
      });

      it("should handle case-insensitive variable names in templates", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        // Create template with different case variations
        const caseVariantTemplate = path.join(tmpDir, "case-variant.md");
        const templateContent = `Query: {{USERQUERY}}
Temp: {{ResponseFileTmp}}
Final: {{responseFILEfinal}}`;
        
        await writeFile(caseVariantTemplate, templateContent);

        const result = await dispatchAgentSession({
          userQuery: "Test case insensitivity",
          requestTemplate: caseVariantTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(0);
      });
    });

    describe("template file loading errors", () => {
      it("should return error for non-existent template file", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        const nonExistentTemplate = path.join(tmpDir, "nonexistent-template.md");

        const result = await dispatchAgentSession({
          userQuery: "test query",
          requestTemplate: nonExistentTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(1);
        expect(result.error).toBeDefined();
        expect(result.error).toContain("Failed to load template file");
        expect(result.error).toContain(nonExistentTemplate);
      });

      it("should handle template file read errors gracefully", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        // Create a directory instead of a file to trigger an error
        const dirAsTemplate = path.join(tmpDir, "dir-template.md");
        await mkdir(dirAsTemplate, { recursive: true });

        const result = await dispatchAgentSession({
          userQuery: "test query",
          requestTemplate: dirAsTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(1);
        expect(result.error).toBeDefined();
        expect(result.error).toContain("Failed to load template file");
      });
    });

    describe("batch dispatch with custom templates", () => {
      let batchRequestTemplate: string;

      beforeEach(async () => {
        // Create a custom batch request template
        batchRequestTemplate = path.join(tmpDir, "batch-request.md");
        const templateContent = `# Batch Request

Query: {{userQuery}}

Write response to: {{responseFileTmp}}
Then rename to: {{responseFileFinal}}`;
        
        await writeFile(batchRequestTemplate, templateContent);
      });

      it("should create batch requests with custom template rendering", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        const userQueries = [
          "First batch query",
          "Second batch query",
          "Third batch query",
        ];

        const result = await dispatchBatchAgent({
          userQueries,
          requestTemplate: batchRequestTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(0);
        expect(result.subagentName).toBe("subagent-1");
        expect(result.requestFiles).toHaveLength(3);
        expect(result.queryCount).toBe(3);
      });

      it("should handle batch dispatch without template (backward compatibility)", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        const userQueries = [
          "Query one",
          "Query two",
        ];

        const result = await dispatchBatchAgent({
          userQueries,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(0);
        expect(result.subagentName).toBe("subagent-1");
        expect(result.requestFiles).toHaveLength(2);
        expect(result.queryCount).toBe(2);
      });

      it("should return error for non-existent batch template file", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        const nonExistentTemplate = path.join(tmpDir, "nonexistent-batch.md");
        const userQueries = ["Test query"];

        const result = await dispatchBatchAgent({
          userQueries,
          requestTemplate: nonExistentTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(1);
        expect(result.error).toBeDefined();
        expect(result.error).toContain("Failed to load template file");
      });

      it("should create orchestrator prompt with custom template", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        // Create orchestrator template
        const orchestratorTemplate = path.join(tmpDir, "orchestrator.md");
        const templateContent = `# Orchestrator

Process these requests:
{{requestFiles}}

Wait for: {{responseList}}`;
        
        await writeFile(orchestratorTemplate, templateContent);

        const userQueries = ["Query 1", "Query 2"];

        const result = await dispatchBatchAgent({
          userQueries,
          requestTemplate: orchestratorTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        expect(result.exitCode).toBe(0);
        expect(result.requestFiles).toHaveLength(2);
      });
    });

    describe("template variable validation", () => {
      it("should return error when template references undefined variables", async () => {
        await provisionSubagents({
          targetRoot,
          subagents: 1,
          lockName: DEFAULT_LOCK_NAME,
          force: false,
          dryRun: false,
        });

        // Create template with an invalid variable
        const invalidTemplate = path.join(tmpDir, "invalid-vars.md");
        const templateContent = `Query: {{userQuery}}
Invalid: {{nonExistentVariable}}`;
        
        await writeFile(invalidTemplate, templateContent);

        // Template validation should fail even in dry run mode
        // because renderTemplate is called to validate the template
        const result = await dispatchAgentSession({
          userQuery: "test",
          requestTemplate: invalidTemplate,
          subagentRoot: targetRoot,
          dryRun: true,
          wait: false,
          vscodeCmd: "code",
        });

        // Should return error for missing template variable
        expect(result.exitCode).toBe(1);
        expect(result.error).toBeDefined();
      });
    });
  });
});
