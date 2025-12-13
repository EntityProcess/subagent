import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { dispatchBatchAgent } from "../src/vscode/agentDispatch.js";
import { provisionSubagents } from "../src/vscode/provision.js";

describe("vscode integration", { concurrent: false, timeout: 30000 }, () => {
	let testRoot: string;

	beforeAll(async () => {
		// Create temporary test directory
		testRoot = await mkdtemp(path.join(tmpdir(), "subagent-vscode-integration-"));

		// Provision subagents for tests
		await provisionSubagents({
			targetRoot: testRoot,
			subagents: 3,
			lockName: "subagent.lock",
			force: false,
			dryRun: false,
		});
	});

	afterAll(async () => {
		// Cleanup test directory (with retries in case files are locked by VS Code)
		let retries = 3;
		while (retries > 0) {
			try {
				await rm(testRoot, { recursive: true, force: true });
				break;
			} catch (error) {
				retries--;
				if (retries === 0) {
					console.warn(`Warning: Failed to cleanup test directory ${testRoot}: ${(error as Error).message}`);
				} else {
					// Wait a bit and retry
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		}
	});

	it("should dispatch single agent with default template and verify variable substitution", async () => {
		const { dispatchAgentSession } = await import("../src/vscode/agentDispatch.js");

		const result = await dispatchAgentSession({
			userQuery: "TEST_MARKER: Verify single dispatch works end-to-end",
			dryRun: false,
			wait: false,
			subagentRoot: testRoot,
			silent: true,
		});

		expect(result.exitCode).toBe(0);
		expect(result.subagentName).toBeDefined();

		const subagentDir = path.join(testRoot, result.subagentName!);
		const messagesDir = path.join(subagentDir, "messages");

		await new Promise((resolve) => setTimeout(resolve, 100));

		const { readdirSync } = await import("fs");
		const files = readdirSync(messagesDir).filter((f) => f.endsWith("_req.md"));
		expect(files.length).toBeGreaterThan(0);

		const requestFile = path.join(messagesDir, files[files.length - 1]);
		const content = await readFile(requestFile, "utf8");

		// Verify default template structure
		expect(content).toContain("system_instructions");
		expect(content).toContain("IMPORTANT");
		expect(content).toContain("Move-Item -LiteralPath");
		
		// Verify user query was substituted
		expect(content).toContain("TEST_MARKER: Verify single dispatch works end-to-end");
		
		// Verify no unreplaced template variables
		expect(content).not.toContain("{{userQuery}}");
		expect(content).not.toContain("{{responseFileTmp}}");
		expect(content).not.toContain("{{responseFileFinal}}");
		
		// Verify file paths were substituted
		expect(content).toMatch(/_res\.tmp\.md/);
		expect(content).toMatch(/_res\.md/);
	});

	it("should dispatch batch agents with default template and verify orchestration", async () => {
		const result = await dispatchBatchAgent({
			userQueries: [
				"BATCH_TEST_1: First query",
				"BATCH_TEST_2: Second query"
			],
			dryRun: false,
			wait: false,
			subagentRoot: testRoot,
			silent: true,
		});

		expect(result.exitCode).toBe(0);
		expect(result.subagentName).toBeDefined();

		const subagentDir = path.join(testRoot, result.subagentName!);
		const messagesDir = path.join(subagentDir, "messages");

		await new Promise((resolve) => setTimeout(resolve, 100));

		const { readdirSync } = await import("fs");
		const files = readdirSync(messagesDir);

		// Verify batch request files
		const batchRequestFiles = files.filter((f) => /_\d+_req\.md$/.test(f));
		expect(batchRequestFiles.length).toBe(2);

		const firstRequestContent = await readFile(path.join(messagesDir, batchRequestFiles[0]), "utf8");
		expect(firstRequestContent).toContain("BATCH_TEST_1: First query");
		expect(firstRequestContent).not.toContain("{{userQuery}}");

		const secondRequestContent = await readFile(path.join(messagesDir, batchRequestFiles[1]), "utf8");
		expect(secondRequestContent).toContain("BATCH_TEST_2: Second query");

		// Verify orchestrator file
		const orchestratorFiles = files.filter((f) => f.includes("orchestrator.md"));
		expect(orchestratorFiles.length).toBeGreaterThan(0);

		const orchestratorContent = await readFile(path.join(messagesDir, orchestratorFiles[0]), "utf8");
		
		// Verify orchestrator has request file references
		expect(orchestratorContent).toMatch(/_0_req\.md/);
		expect(orchestratorContent).toMatch(/_1_req\.md/);
		
		// Verify orchestrator has response file references
		expect(orchestratorContent).toMatch(/_0_res\.md/);
		expect(orchestratorContent).toMatch(/_1_res\.md/);
		
		// Verify no unreplaced template variables
		expect(orchestratorContent).not.toContain("{{requestFiles}}");
		expect(orchestratorContent).not.toContain("{{responseList}}");
	});
});
