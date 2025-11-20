# Batch Dispatch Design

## Architecture Overview

The batch dispatch feature extends the existing single-query dispatch mechanism to support multiple queries in a single workspace session. The key architectural decision is to **delegate parallelization and isolation to VS Code's `#runSubagent` tool** rather than implementing custom orchestration logic.

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

**Example**:
```
messages/
  20251120143000_0_req.md   # "analyze code"
  20251120143000_1_req.md   # "run tests"
  20251120143000_2_req.md   # "check types"
```

### Chat Instruction

**Single-Query Instruction** (current):
```
Follow instructions in {timestamp}_req.md
```

**Batch Instruction** (new):
```
Call the #runSubagent tool (not the subagent CLI) for each attached req.md file to process them in isolated contexts
```

**Key Differences**:
- No specific file name references (VS Code sees all attachments)
- Explicit delegation to `#runSubagent` tool
- Clarifies isolation requirement ("isolated contexts")
- Distinguishes from `subagent` CLI (prevents confusion)

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
5. Launch VS Code with chat
6. Attach ALL req_*.md files
7. Send: "Call #runSubagent for each attached req.md file"
8. Wait for batch completion (TBD: how to signal)
9. Remove lock
```

## Response Handling Strategy

### Challenge

With multiple queries, we need a way to know when the batch is complete. Options:

**Option A: Delegate to VS Code**
- VS Code's `#runSubagent` handles all coordination
- We wait for a single "batch complete" signal
- **Trade-off**: Simpler implementation, but VS Code must handle completion signaling

**Option B: Individual Response Files**
- Each query generates `{timestamp}_{index}_res.md`
- Wait for all N response files to appear
- **Trade-off**: More complex tracking, but precise per-query status

**Recommendation**: Start with **Option A** (simpler, aligns with delegation strategy). The batch completion signal can be a single file like `{timestamp}_batch_complete.md` written by the VS Code agent after all `#runSubagent` calls finish.

### Response File Convention (Option B - Future)

If we later need per-query responses:

```
messages/
  20251120143000_0_req.md
  20251120143000_0_res.md      # Response for query 0
  20251120143000_1_req.md
  20251120143000_1_res.md      # Response for query 1
  20251120143000_2_req.md
  20251120143000_2_res.md      # Response for query 2
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

- VS Code's `#runSubagent` tool is available and supports multiple invocations
- VS Code agent can understand the batch instruction format
- Single workspace lock is sufficient (no query-level locking needed)

## Future Enhancements (Out of Scope)

- Per-query response aggregation
- Batch progress tracking (e.g., 3/5 queries complete)
- Custom batch completion callbacks
- Query prioritization within batch
- Batch size limits or throttling
