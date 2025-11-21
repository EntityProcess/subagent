# Batch Dispatch Design

## Architecture Overview

The batch dispatch feature extends the existing single-query dispatch mechanism to support multiple queries in a single workspace session for cost optimization. The key architectural decision is to **use an orchestrator file that orchestrates sequential processing** via VS Code's `#runSubagent` tool, with the orchestrator responsible for verifying completion and unlocking the workspace.

## Component Design

### Function Signature

```typescript
export interface BatchDispatchOptions {
  userQueries: string[];           // Array of queries to process
  promptFile?: string;             // Optional chatmode template
  extraAttachments?: readonly string[];
  workspaceTemplate?: string;
  dryRun?: boolean;
  wait?: boolean;                  // Wait for batch completion
  vscodeCmd?: string;
  subagentRoot?: string;
  silent?: boolean;
}

export interface BatchDispatchResult {
  exitCode: number;
  subagentName?: string;
  requestFiles: string[];          // All generated request files
  queryCount: number;
  error?: string;
}

export async function dispatchBatchAgent(
  options: BatchDispatchOptions
): Promise<BatchDispatchResult>
```

### Request File Generation

**Naming Convention**: `{timestamp}_{index}_req.md`

- **timestamp**: ISO timestamp (same format as single dispatch: `YYYYMMDDHHmmss`)
- **index**: Zero-based sequential index (0, 1, 2, ...)
- Ensures ordering and uniqueness within the same batch

**Individual request files contain ONLY task and response file instructions (NO unlock commands)**

**Example**:
```
messages/
  20251120143000_0_req.md   # "analyze code" + write to *_0_res.md
  20251120143000_1_req.md   # "run tests" + write to *_1_res.md
  20251120143000_2_req.md   # "check types" + write to *_2_res.md
  20251120143000_orchestrator.md  # Orchestrates all + unlocks
```

### Orchestrator File

**Single-Query Instruction** (current):
```
Follow instructions in {timestamp}_req.md
```

**Batch Orchestrator** (new): `{timestamp}_orchestrator.md`
```markdown
Process these queries sequentially in isolated contexts using #runSubagent (not subagent CLI):

1. #runSubagent @{timestamp}_0_req.md
2. #runSubagent @{timestamp}_1_req.md
3. #runSubagent @{timestamp}_2_req.md

After ALL queries complete, verify all responses exist and unlock:

```powershell
$responses = @("{timestamp}_0_res.md", "{timestamp}_1_res.md", "{timestamp}_2_res.md")
$allExist = $responses | ForEach-Object { Test-Path "messages/$_" } | Where-Object { $_ -eq $false } | Measure-Object | Select-Object -ExpandProperty Count
if ($allExist -eq 0) { subagent {vscodeCmd} unlock --subagent {subagentName} }
```
```

**Key Points**:
- Coordinator orchestrates sequential processing
- Verifies all responses before unlocking
- Individual request files have no unlock logic

## Workflow Comparison

### Single Dispatch (Current)

```
1. Find unlocked subagent
2. Create lock file
3. Copy workspace config
4. Create single req.md
5. Launch VS Code with chat
6. Attach req.md
7. Send: "Follow instructions in req.md"
8. Wait for response
9. Remove lock
```

### Batch Dispatch (New)

```
1. Find unlocked subagent
2. Create lock file
3. Copy workspace config
4. Create req_0.md, req_1.md, req_2.md, ...
5. Create orchestrator.md
6. Launch VS Code with chat
7. Attach orchestrator + extra attachments
8. Send: "Follow the batch processing instructions in the orchestrator file"
9. Wait for batch completion (orchestrator handles unlock)
```

## Response Handling Strategy

### Approach: Individual Response Files + Orchestrator

Each query generates its own response file pair:
- `{timestamp}_{index}_res.tmp.md` (temporary, being written)
- `{timestamp}_{index}_res.md` (final, complete)

The VS Code agent processes the orchestrator file which:
1. Calls `#runSubagent` for each `*_req.md` file sequentially
2. Each subagent writes to its corresponding `*_res.tmp.md` → `*_res.md`
3. Orchestrator verifies all `*_res.md` files exist
4. Orchestrator unlocks workspace when all complete

### Wait Behavior

**When `wait: true`**:
- `dispatchBatchAgent()` polls for all N response files
- Waits until all `{timestamp}_{index}_res.md` files exist
- Returns `BatchDispatchResult` with populated `responseFiles` array

**When `wait: false`**:
- `dispatchBatchAgent()` returns immediately after launching VS Code
- `responseFiles` is undefined in result
- Caller is responsible for monitoring response file creation

### Response File Convention

```
messages/
  20251120143000_0_req.md
  20251120143000_0_res.tmp.md  # Being written
  20251120143000_0_res.md      # Complete ✓
  20251120143000_1_req.md
  20251120143000_1_res.tmp.md  # Being written
  20251120143000_1_res.md      # Complete ✓
  20251120143000_2_req.md
  20251120143000_2_res.tmp.md  # Still processing...
```

### Completion Detection

The system detects batch completion by checking for the existence of all final response files:
```typescript
const allResponsesComplete = responseFiles.every(file => 
  fs.existsSync(file.replace('_res.tmp.md', '_res.md'))
);
```

## Error Handling

### Validation Errors (Pre-Dispatch)

- Empty `userQueries` array → immediate error return
- Invalid attachments → same as single dispatch
- No unlocked subagent → same as single dispatch

### Dispatch Errors

- Request file creation failure → return error before launching VS Code
- VS Code launch failure → same as single dispatch

### Batch Processing Errors (In VS Code)

- Partial failures (some queries succeed, some fail) → VS Code handles via `#runSubagent`
- Complete batch failure → detected via timeout or explicit error signal

## Constraints & Assumptions

### Constraints

- Must reuse existing `launchVsCodeWithChat()` and workspace management
- Must not modify CLI commands (programmatic API only)
- Must maintain backward compatibility with single dispatch

### Assumptions

- VS Code's `#runSubagent` tool processes requests sequentially
- VS Code agent can execute PowerShell commands in orchestrator
- Orchestrator can verify file existence before unlocking
- Single workspace lock is sufficient (no query-level locking needed)

## Future Enhancements (Out of Scope)

- Per-query response aggregation
- Batch progress tracking (e.g., 3/5 queries complete)
- Custom batch completion callbacks
- Query prioritization within batch
- Batch size limits or throttling
