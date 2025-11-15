import os from "os";
import path from "path";

export const DEFAULT_LOCK_NAME = "subagent.lock";
export function getDefaultSubagentRoot(vscodeCmd: string = "code"): string {
  const folder = vscodeCmd === "code-insiders" ? "vscode-insiders-agents" : "vscode-agents";
  return path.join(os.homedir(), ".subagent", folder);
}

export const DEFAULT_SUBAGENT_ROOT = getDefaultSubagentRoot();
export const DEFAULT_WORKSPACE_FILENAME = "subagent.code-workspace";
export const DEFAULT_WAKEUP_FILENAME = "wakeup.chatmode.md";
export const DEFAULT_ALIVE_FILENAME = ".alive";
