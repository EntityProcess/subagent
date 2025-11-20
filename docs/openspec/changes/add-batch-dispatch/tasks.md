# Implementation Tasks

## Phase 1: Core Batch Dispatch Function

1. **Add `dispatchBatchAgent()` function signature**
   - Create `BatchDispatchOptions` interface extending base dispatch options
   - Replace `userQuery: string` with `userQueries: string[]`
   - Define `BatchDispatchResult` return type
   - Export from `agentDispatch.ts`
   - **Validation**: Type checking compiles without errors

2. **Generate multiple request files**
   - Create one `{timestamp}_{index}_req.md` file per query in `userQueries[]`
   - Use consistent timestamp prefix with sequential index suffix
   - Write each query to its corresponding request file
   - **Validation**: Request files created with correct naming pattern

3. **Attach all request files to chat**
   - Collect all request file paths
   - Pass all paths to `launchVsCodeWithChat()` via `attachmentPaths[]`
   - **Validation**: All request files appear as chat attachments

4. **Send batch processing instruction**
   - Replace single-query prompt with batch instruction
   - Use: "Call the #runSubagent tool (not the subagent CLI) for each attached req.md file to process them in isolated contexts"
   - Remove references to specific request file names (since there are multiple)
   - **Validation**: Chat receives correct batch instruction

5. **Handle batch response files**
   - Define response file naming: `{timestamp}_{index}_res.tmp.md` → `{timestamp}_{index}_res.md`
   - Implement polling mechanism to wait for all N response files when `wait: true`
   - Populate `responseFiles` array in result when all responses complete
   - Return immediately with `responseFiles: undefined` when `wait: false`
   - **Validation**: Response files correctly associated with queries, wait behavior works correctly

## Phase 2: Testing & Documentation

6. **Add unit tests**
   - Test `dispatchBatchAgent()` with 1, 2, and 5 queries
   - Test request file generation and naming
   - Test error handling for empty query array
   - **Validation**: All tests pass with `pnpm test`

7. **Add integration test**
   - End-to-end test with real VS Code workspace (if feasible)
   - Or mock-based integration test
   - **Validation**: Batch dispatch workflow executes correctly

8. **Update documentation**
   - Add API documentation for `dispatchBatchAgent()`
   - Include usage examples in README or docs
   - Document batch response handling
   - **Validation**: Documentation reviewed and accurate

## Dependencies

- Task 2 depends on Task 1 (function signature must exist)
- Task 3 depends on Task 2 (files must be created before attaching)
- Task 4 depends on Task 3 (attachments must be ready before sending instruction)
- Task 5 depends on Task 4 (instruction must be sent before awaiting responses)
- Tasks 6-8 can proceed in parallel once Tasks 1-5 are complete

## Parallelization Opportunities

- Tasks 6, 7, 8 can be done concurrently
