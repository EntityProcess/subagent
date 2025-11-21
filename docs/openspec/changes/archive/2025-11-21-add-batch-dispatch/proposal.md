# Add Batch Dispatch

## Problem Statement

Currently, the subagent CLI only supports dispatching a single query at a time via `dispatchAgent()`. This forces external Node.js applications to either:
- Call `dispatchAgent()` sequentially (slow, blocks on each agent response)
- Manually orchestrate multiple concurrent dispatches (complex, error-prone)

There's no built-in way to dispatch multiple independent queries that should be processed in parallel by the same VS Code workspace using the `#runSubagent` tool for isolated contexts.

## Proposed Solution

Add a **batch dispatch** capability to the programmatic API (not CLI) that:
1. Accepts an array of `userQuery` strings
2. Creates a separate `req.md` file for each query
3. Attaches all `req.md` files to a single VS Code chat session
4. Sends the instruction: "Call the #runSubagent tool (not the subagent CLI) for each attached req.md file to process them in isolated contexts"

This leverages VS Code's `#runSubagent` tool to handle parallelization and isolation, keeping the subagent implementation minimal.

## Scope

### In Scope
- New `dispatchBatchAgent()` function exported from `agentDispatch.ts`
- Accept `userQueries: string[]` instead of single `userQuery: string`
- Generate one `req.md` file per query with timestamps
- Attach all request files to the chat
- Send batch processing instruction to VS Code
- Return aggregate results or status

### Out of Scope
- CLI command for batch dispatch (programmatic API only)
- Complex orchestration logic (delegated to VS Code's `#runSubagent`)
- Response aggregation beyond basic status collection
- Custom batch scheduling or prioritization

## Impact

### Benefits
- **Simplicity**: Delegates parallelization to VS Code's existing `#runSubagent` tool
- **Performance**: Multiple queries processed in parallel without sequential blocking
- **Isolation**: Each query runs in an isolated context via `#runSubagent`
- **Minimal Changes**: Reuses existing workspace management and dispatch infrastructure

### Risks
- VS Code `#runSubagent` tool availability and behavior is external dependency
- Error handling for partial batch failures needs careful design
- Response file naming and collision must be managed across multiple queries

## Dependencies

- Existing `dispatchAgent()` infrastructure
- VS Code `#runSubagent` tool capability
- Current workspace locking and message file management

## Alternatives Considered

### Alternative 1: Sequential Dispatch
Call `dispatchAgent()` in a loop from client code.
- **Rejected**: Slow, blocks on each response, no parallelization benefit

### Alternative 2: Manual Concurrent Dispatch
Client manages multiple `dispatchAgent()` calls with Promise.all().
- **Rejected**: Complex for clients, doesn't leverage VS Code's built-in isolation

### Alternative 3: Custom Batch Orchestrator
Build complex batch scheduling and worker pool management.
- **Rejected**: Over-engineered, duplicates what `#runSubagent` already does
