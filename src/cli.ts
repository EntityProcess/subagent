#!/usr/bin/env node
import { Command } from "commander";

import {
  dispatchAgent,
  listSubagents,
  warmupSubagents,
} from "./vscode/agentDispatch.js";
import { provisionSubagents, unlockSubagents } from "./vscode/provision.js";
import { DEFAULT_LOCK_NAME, DEFAULT_SUBAGENT_ROOT, DEFAULT_TEMPLATE_DIR, getDefaultSubagentRoot } from "./vscode/constants.js";
import { logger } from "./utils/logger.js";

// Global error handlers
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled rejection");
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down...");
  process.exit(0);
});

const program = new Command();

program
  .name("subagent")
  .description("Manage workspace agents across different backends")
  .configureHelp({ sortSubcommands: true });

function configureVsCodeCommands(parent: Command, vscodeCmd: string): void {
  const defaultSubagentRoot = getDefaultSubagentRoot(vscodeCmd);
  parent
    .command("provision")
    .description("Provision subagent workspace directories")
    .option("--subagents <count>", "Number of subagent directories to provision", (value) => Number.parseInt(value, 10), 1)
    .option("--target-root <path>", "Destination root for subagent directories", defaultSubagentRoot)
    .option("--lock-name <name>", "Filename that marks a subagent as locked", DEFAULT_LOCK_NAME)
    .option("--force", "Unlock and overwrite all subagent directories regardless of lock status", false)
    .option("--dry-run", "Show the planned operations without copying files", false)
    .option("--warmup", "Warm up provisioned subagents after provisioning completes", false)
    .action(async (options) => {
      try {
        const result = await provisionSubagents({
          targetRoot: options.targetRoot,
          subagents: options.subagents,
          lockName: options.lockName,
          force: Boolean(options.force),
          dryRun: Boolean(options.dryRun),
        });

        const totalUnlocked = result.created.length + result.skippedExisting.length;

        if (result.created.length > 0) {
          console.log("created subagents:");
          for (const created of result.created) {
            console.log(`  ${created}`);
          }
        }

        if (result.skippedExisting.length > 0) {
          console.log("skipped existing unlocked subagents:");
          for (const skipped of result.skippedExisting) {
            console.log(`  ${skipped}`);
          }
        }

        if (result.skippedLocked.length > 0) {
          console.log("skipped locked subagents:");
          for (const locked of result.skippedLocked) {
            console.log(`  ${locked}`);
          }
        }

        if (result.created.length === 0 && result.skippedExisting.length === 0 && result.skippedLocked.length === 0) {
          console.log("no operations were required");
        }

        if (totalUnlocked > 0) {
          console.log(`\ntotal unlocked subagents available: ${totalUnlocked}`);
        }

        if (options.dryRun) {
          console.log("dry run complete; no changes were made");
          if (options.warmup) {
            console.log("warmup skipped because this was a dry run");
          }
          return;
        }

        if (options.warmup) {
          const exitCode = await warmupSubagents({
            subagentRoot: options.targetRoot,
            subagents: options.subagents,
            dryRun: false,
            vscodeCmd,
          });

          if (exitCode !== 0) {
            process.exitCode = exitCode;
          }
        }
      } catch (error) {
        logger.error({ err: error }, "Provision failed");
        process.exitCode = 1;
      }
    });

  parent
    .command("chat <query>")
    .description("Start a chat with an agent in an isolated subagent workspace")
    .option("--prompt <promptFile>", "Path to a prompt file to copy and attach")
    .option("--workspace-template <path>", "Path to a custom .code-workspace file to use as template")
    .option("-a, --attachment <path>", "Additional attachment to forward to the chat", (value: string, previous: string[] = []) => {
      previous.push(value);
      return previous;
    })
    .option("--dry-run", "Print what would be done without making changes", false)
    .option("-w, --wait", "Wait for response and print to stdout (sync mode)", false)
    .action(async (query: string, options) => {
      try {
        const exitCode = await dispatchAgent({
          userQuery: query,
          promptFile: options.prompt,
          workspaceTemplate: options.workspaceTemplate,
          extraAttachments: options.attachment as string[] | undefined,
          dryRun: Boolean(options.dryRun),
          wait: Boolean(options.wait),
          vscodeCmd,
        });
        if (exitCode !== 0) {
          process.exitCode = exitCode;
        }
      } catch (error) {
        logger.error({ err: error }, "Chat dispatch failed");
        process.exitCode = 1;
      }
    });

  parent
    .command("warmup")
    .description("Open provisioned VS Code workspaces to warm them up")
    .option("--subagents <count>", "Number of subagent workspaces to open", (value) => Number.parseInt(value, 10), 1)
    .option("--target-root <path>", "Root directory containing subagents", defaultSubagentRoot)
    .option("--dry-run", "Show which workspaces would be opened without opening them", false)
    .action(async (options) => {
      try {
        const exitCode = await warmupSubagents({
          subagentRoot: options.targetRoot,
          subagents: options.subagents,
          dryRun: Boolean(options.dryRun),
          vscodeCmd,
        });
        if (exitCode !== 0) {
          process.exitCode = exitCode;
        }
      } catch (error) {
        logger.error({ err: error }, "Warmup failed");
        process.exitCode = 1;
      }
    });

  parent
    .command("list")
    .description("List all provisioned subagents and their status")
    .option("--target-root <path>", "Root directory containing subagents", defaultSubagentRoot)
    .option("--json", "Output results as JSON", false)
    .action(async (options) => {
      try {
        const exitCode = await listSubagents({
          subagentRoot: options.targetRoot,
          jsonOutput: Boolean(options.json),
          vscodeCmd,
        });
        if (exitCode !== 0) {
          process.exitCode = exitCode;
        }
      } catch (error) {
        logger.error({ err: error }, "List failed");
        process.exitCode = 1;
      }
    });

  parent
    .command("unlock")
    .description("Unlock subagent(s) by removing their lock files")
    .option("--subagent <name>", "Subagent name to unlock (e.g., subagent-1)")
    .option("--all", "Unlock all subagents", false)
    .option("--target-root <path>", "Root directory containing subagents", defaultSubagentRoot)
    .option("--lock-name <name>", "Filename that marks a subagent as locked", DEFAULT_LOCK_NAME)
    .option("--dry-run", "Show what would be unlocked without making changes", false)
    .action(async (options) => {
      try {
        const unlocked = await unlockSubagents({
          targetRoot: options.targetRoot,
          lockName: options.lockName,
          subagentName: options.subagent,
          unlockAll: Boolean(options.all),
          dryRun: Boolean(options.dryRun),
        });

        if (unlocked.length > 0) {
          console.log("unlocked subagents:");
          for (const entry of unlocked) {
            console.log(`  ${entry}`);
          }
        } else if (options.all) {
          console.log("no locked subagents found");
        } else if (options.subagent) {
          console.log(`subagent '${options.subagent}' was not locked`);
        }

        if (options.dryRun) {
          console.log("dry run complete; no changes were made");
        }
      } catch (error) {
        logger.error({ err: error }, "Unlock failed");
        process.exitCode = 1;
      }
    });
}

const codeCommand = program.command("code").description("Manage VS Code workspace agents");
configureVsCodeCommands(codeCommand, "code");

const codeInsidersCommand = program
  .command("code-insiders")
  .description("Manage VS Code Insiders workspace agents");
configureVsCodeCommands(codeInsidersCommand, "code-insiders");

await program.parseAsync(process.argv);
