# Batch Dispatch Change Summary

## Quick Reference

- **Change ID**: `add-batch-dispatch`
- **Status**: Proposed (awaiting approval)
- **Scope**: Programmatic API only (no CLI changes)
- **Files Created**: 4 (proposal, tasks, design, spec delta)

## What Was Created

```
docs/openspec/changes/add-batch-dispatch/
├── proposal.md                              # Problem, solution, scope, alternatives
├── tasks.md                                 # 8 implementation tasks in 2 phases
├── design.md                                # Architecture, workflow, response handling
└── specs/
    └── batch-dispatch/
        └── spec.md                          # 7 new requirements with scenarios
```

## Key Design Decisions

1. **Delegation Strategy**: Leverage VS Code's `#runSubagent` tool for parallelization and isolation instead of building custom orchestration
2. **Request Files**: One `{timestamp}_{index}_req.md` file per query with sequential indexing
3. **Chat Instruction**: "Call the #runSubagent tool (not the subagent CLI) for each attached req.md file to process them in isolated contexts"
4. **API Surface**: New `dispatchBatchAgent()` function, not exposed via CLI
5. **Response Handling**: Start with simple batch completion signal (Option A in design.md)

## Function Signature

```typescript
interface BatchDispatchOptions {
  userQueries: string[];  // Array instead of single userQuery
  // ... all other DispatchOptions fields
}

interface BatchDispatchResult {
  exitCode: number;
  subagentName?: string;
  requestFiles: string[];
  queryCount: number;
  error?: string;
}

async function dispatchBatchAgent(
  options: BatchDispatchOptions
): Promise<BatchDispatchResult>
```

## Implementation Tasks (8 Total)

### Phase 1: Core Functionality (5 tasks)
1. Add `dispatchBatchAgent()` function signature
2. Generate multiple request files
3. Attach all request files to chat
4. Send batch processing instruction
5. Handle batch response files

### Phase 2: Testing & Documentation (3 tasks)
6. Add unit tests
7. Add integration test
8. Update documentation

## Validation Status

✅ **Passed strict validation**: `openspec validate add-batch-dispatch --strict`

## Next Steps

1. **Review & Approve**: Review this proposal for completeness and alignment
2. **Implementation**: Work through tasks 1-8 in sequence
3. **Testing**: Verify batch dispatch with real VS Code workspace
4. **Documentation**: Update README with batch API examples
5. **Archive**: Move to `openspec/changes/archive/` once deployed

## Related Specifications

- `workspace-dispatch` - Workspace configuration during dispatch (existing)

## Questions for Review

1. Is the batch completion signaling strategy (Option A) acceptable, or should we implement per-query response tracking (Option B)?
2. Should we add a maximum batch size limit?
3. Should `wait: false` mode be supported for batches, or always require waiting?
