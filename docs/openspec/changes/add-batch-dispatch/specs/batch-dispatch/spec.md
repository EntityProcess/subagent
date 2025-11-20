# Batch Dispatch

## Purpose

Define requirements for dispatching multiple independent queries to a single subagent workspace in parallel, using VS Code's `#runSubagent` tool for isolated execution contexts.

## ADDED Requirements

### Requirement: Batch Dispatch Function

The system SHALL provide a `dispatchBatchAgent()` function that accepts an array of user queries and dispatches them to a single subagent workspace for parallel processing.

#### Scenario: Dispatch multiple queries

- **GIVEN** a Node.js application imports `dispatchBatchAgent` from `agentDispatch.ts`
- **WHEN** the application calls `dispatchBatchAgent({ userQueries: ["query1", "query2", "query3"], ... })`
- **THEN** the system creates 3 separate request files and dispatches them to a single unlocked subagent workspace

#### Scenario: Empty query array

- **WHEN** `dispatchBatchAgent()` is called with an empty `userQueries` array
- **THEN** the system returns an error: "At least one query is required for batch dispatch"

### Requirement: Batch Options Interface

The system SHALL define a `BatchDispatchOptions` interface that extends dispatch options with batch-specific fields.

#### Scenario: Batch options structure

- **GIVEN** the `BatchDispatchOptions` interface
- **THEN** it contains:
  - `userQueries: string[]` (replaces single `userQuery`)
  - All other fields from `DispatchOptions` (promptFile, extraAttachments, workspaceTemplate, dryRun, wait, vscodeCmd, subagentRoot, silent)

### Requirement: Multiple Request Files

The system SHALL create one request file per query with a unique naming pattern that preserves order and prevents collisions.

#### Scenario: Request file naming for batch

- **GIVEN** a batch dispatch with 3 queries at timestamp "20251120143000"
- **WHEN** the system generates request files
- **THEN** the files are named:
  - `20251120143000_0_req.md`
  - `20251120143000_1_req.md`
  - `20251120143000_2_req.md`

#### Scenario: Request file content

- **GIVEN** a batch dispatch with `userQueries: ["analyze code", "run tests"]`
- **WHEN** the system creates request files
- **THEN** `*_0_req.md` contains "analyze code" and `*_1_req.md` contains "run tests"

### Requirement: Batch Attachment to Chat

The system SHALL attach all batch request files to a single VS Code chat session.

#### Scenario: Attach all request files

- **GIVEN** 3 request files generated for a batch dispatch
- **WHEN** the system launches VS Code with chat
- **THEN** all 3 request files appear in the chat attachments list

### Requirement: Batch Processing Instruction

The system SHALL send a batch processing instruction that delegates to VS Code's `#runSubagent` tool instead of referencing specific file names.

#### Scenario: Batch instruction content

- **WHEN** the system creates the batch chat prompt
- **THEN** the prompt message is: "Call the #runSubagent tool (not the subagent CLI) for each attached req.md file to process them in isolated contexts"

#### Scenario: No specific file references

- **WHEN** the system creates the batch chat prompt
- **THEN** the prompt does NOT contain references like "follow instructions in {reqFile}" or specific request file names

### Requirement: Batch Result Structure

The system SHALL return a structured result containing status and metadata for the batch dispatch operation.

#### Scenario: Batch result interface

- **GIVEN** the `BatchDispatchResult` interface
- **THEN** it contains:
  - `exitCode: number` (0 for success, 1 for error)
  - `subagentName?: string` (workspace that processed the batch)
  - `requestFiles: string[]` (paths to all generated request files)
  - `queryCount: number` (number of queries in the batch)
  - `error?: string` (error message if dispatch failed)

#### Scenario: Successful batch dispatch result

- **GIVEN** a successful batch dispatch of 3 queries
- **WHEN** `dispatchBatchAgent()` completes
- **THEN** the result contains:
  - `exitCode: 0`
  - `subagentName: "subagent-1"`
  - `requestFiles: ["/path/to/20251120143000_0_req.md", "/path/to/20251120143000_1_req.md", "/path/to/20251120143000_2_req.md"]`
  - `queryCount: 3`

### Requirement: Batch Workspace Locking

The system SHALL use the same workspace locking mechanism as single dispatch to prevent concurrent access during batch processing.

#### Scenario: Single lock for batch

- **WHEN** `dispatchBatchAgent()` claims an unlocked subagent
- **THEN** the system creates a single `subagent.lock` file (not one per query)

#### Scenario: Lock release after batch

- **WHEN** batch processing completes (or `wait: false`)
- **THEN** the workspace lock behavior follows the same rules as single dispatch (immediate unlock if `wait: false`, unlock after completion if `wait: true`)

### Requirement: Batch Export Availability

The system SHALL export `dispatchBatchAgent()` as a public API function but NOT expose it via CLI commands.

#### Scenario: Programmatic API only

- **WHEN** a Node.js application imports from `agentDispatch.ts`
- **THEN** `dispatchBatchAgent` is available as an exported function

#### Scenario: No CLI command

- **WHEN** user runs `subagent code --help`
- **THEN** no batch dispatch command appears (batch dispatch is programmatic only)
