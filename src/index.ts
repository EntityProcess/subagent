export type {
  DispatchOptions,
  DispatchSessionResult,
  ListOptions,
  WarmupOptions,
} from "./vscode/agentDispatch.js";

export type {
  ProvisionOptions,
  ProvisionResult,
  UnlockOptions,
} from "./vscode/provision.js";

export {
  dispatchAgent,
  dispatchAgentSession,
  getAllSubagentWorkspaces,
  getSubagentRoot,
  listSubagents,
  warmupSubagents,
  findUnlockedSubagent,
} from "./vscode/agentDispatch.js";

export {
  provisionSubagents,
  unlockSubagents,
} from "./vscode/provision.js";
