import { afterEach, beforeEach, describe, expect, test as it } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathExists } from '../../src/utils/fs.js';
import { getAllSubagentWorkspaces, warmupSubagents } from '../../src/vscode/agentDispatch.js';
import { DEFAULT_LOCK_NAME } from '../../src/vscode/constants.js';
import { provisionSubagents } from '../../src/vscode/provision.js';

describe('warmup', () => {
  let tmpDir: string;
  let targetRoot: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tmpDir = path.join(
      os.tmpdir(),
      `subagent-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    );
    await mkdir(tmpDir, { recursive: true });

    // Create target root directory
    targetRoot = path.join(tmpDir, 'agents');
    await mkdir(targetRoot, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await pathExists(tmpDir)) {
      const { rm } = await import('node:fs/promises');
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  describe('getAllSubagentWorkspaces', () => {
    it('should return empty array for empty directory', async () => {
      const workspaces = await getAllSubagentWorkspaces(targetRoot);
      expect(workspaces).toEqual([]);
    });

    it('should return empty array for nonexistent directory', async () => {
      const nonexistentRoot = path.join(tmpDir, 'nonexistent');
      const workspaces = await getAllSubagentWorkspaces(nonexistentRoot);
      expect(workspaces).toEqual([]);
    });

    it('should return workspace files for provisioned subagents', async () => {
      // Provision 3 subagents
      await provisionSubagents({
        targetRoot,
        subagents: 3,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const workspaces = await getAllSubagentWorkspaces(targetRoot);

      expect(workspaces).toHaveLength(3);
      expect(workspaces[0]).toContain('subagent-1.code-workspace');
      expect(workspaces[1]).toContain('subagent-2.code-workspace');
      expect(workspaces[2]).toContain('subagent-3.code-workspace');
    });

    it('should skip subagent directories missing workspace file', async () => {
      // Provision properly first
      await provisionSubagents({
        targetRoot,
        subagents: 2,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      // Then DELETE the workspace file from subagent-1
      const { rm } = await import('node:fs/promises');
      const subagent1Workspace = path.join(targetRoot, 'subagent-1', 'subagent-1.code-workspace');
      await rm(subagent1Workspace);

      const workspaces = await getAllSubagentWorkspaces(targetRoot);

      // Should only return subagent-2 since subagent-1 has no workspace file
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]).toContain('subagent-2.code-workspace');
    });
  });

  describe('warmupSubagents', () => {
    it('should return error code when no workspaces found', async () => {
      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 1,
        dryRun: false,
        vscodeCmd: 'code',
      });

      expect(exitCode).toBe(1);
    });

    it('should return success in dry run mode', async () => {
      // Provision 2 subagents
      await provisionSubagents({
        targetRoot,
        subagents: 2,
        lockName: DEFAULT_LOCK_NAME,
        force: false,
        dryRun: false,
      });

      const exitCode = await warmupSubagents({
        subagentRoot: targetRoot,
        subagents: 2,
        dryRun: true,
        vscodeCmd: 'code',
      });

      expect(exitCode).toBe(0);
    });
  });
});
