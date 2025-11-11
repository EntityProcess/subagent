import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(new URL("./constants.ts", import.meta.url)));

export const DEFAULT_LOCK_NAME = "subagent.lock";
export function getDefaultSubagentRoot(vscodeCmd: string = "code"): string {
  const folder = vscodeCmd === "code-insiders" ? "vscode-insiders-agents" : "vscode-agents";
  return path.join(os.homedir(), ".subagent", folder);
}

export const DEFAULT_SUBAGENT_ROOT = getDefaultSubagentRoot();
export const DEFAULT_TEMPLATE_DIR = path.join(here, "subagent_template");
export const DEFAULT_WORKSPACE_FILENAME = "subagent.code-workspace";
export const DEFAULT_WAKEUP_FILENAME = "wakeup.chatmode.md";
export const DEFAULT_ALIVE_FILENAME = ".alive";
