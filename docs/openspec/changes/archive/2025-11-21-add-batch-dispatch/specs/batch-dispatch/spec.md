# Batch Dispatch

## Purpose

Define requirements for dispatching multiple independent queries to a single subagent workspace for sequential processing, using an orchestrator file to orchestrate execution and manage workspace unlocking. This optimizes costs by reusing a single VS Code instance.

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

The system SHALL attach the orchestrator file and any extra attachments to the VS Code chat session.

#### Scenario: Attach orchestrator file

- **GIVEN** a batch dispatch with orchestrator file and 2 extra attachments
- **WHEN** the system launches VS Code with chat
- **THEN** the orchestrator file and 2 extra attachments appear in the chat attachments list
- **AND** individual request files are NOT attached (orchestrator references them)

### Requirement: Batch Orchestrator File

The system SHALL create an orchestrator file that orchestrates sequential processing of all queries and handles workspace unlocking.

#### Scenario: Orchestrator file creation

- **GIVEN** a batch dispatch with 3 queries at timestamp "20251120143000"
- **WHEN** the system generates batch files
- **THEN** an orchestrator file `20251120143000_orchestrator.md` is created

#### Scenario: Orchestrator file content

- **WHEN** the orchestrator file is created
- **THEN** it contains:
  - Sequential `#runSubagent` calls for each request file
  - PowerShell verification script to check all response files exist
  - Unlock command that runs only after verification succeeds

#### Scenario: Individual request files have no unlock

- **WHEN** individual request files are created
- **THEN** they contain ONLY the task and response file write instructions
- **AND** they do NOT contain unlock commands

### Requirement: Batch Result Structure

The system SHALL return a structured result containing status and metadata for the batch dispatch operation.

#### Scenario: Batch result interface

- **GIVEN** the `BatchDispatchResult` interface
- **THEN** it contains:
  - `exitCode: number` (0 for success, 1 for error)
  - `subagentName?: string` (workspace that processed the batch)
  - `requestFiles: string[]` (paths to all generated request files)
  - `responseFiles?: string[]` (paths to completed response files, only populated when wait: true)
  - `queryCount: number` (number of queries in the batch)
  - `error?: string` (error message if dispatch failed)

#### Scenario: Successful batch dispatch result with wait

- **GIVEN** a successful batch dispatch of 3 queries with `wait: true`
- **WHEN** `dispatchBatchAgent()` completes
- **THEN** the result contains:
  - `exitCode: 0`
  - `subagentName: "subagent-1"`
  - `requestFiles: ["/path/to/20251120143000_0_req.md", "/path/to/20251120143000_1_req.md", "/path/to/20251120143000_2_req.md"]`
  - `responseFiles: ["/path/to/20251120143000_0_res.md", "/path/to/20251120143000_1_res.md", "/path/to/20251120143000_2_res.md"]`
  - `queryCount: 3`

#### Scenario: Batch dispatch result without wait

- **GIVEN** a batch dispatch of 3 queries with `wait: false`
- **WHEN** `dispatchBatchAgent()` returns
- **THEN** the result contains:
  - `exitCode: 0`
  - `subagentName: "subagent-1"`
  - `requestFiles: ["/path/to/20251120143000_0_req.md", ...]`
  - `responseFiles: undefined` (not populated when wait is false)
  - `queryCount: 3`

### Requirement: Batch Workspace Locking

The system SHALL use the same workspace locking mechanism as single dispatch to prevent concurrent access during batch processing.

#### Scenario: Single lock for batch

- **WHEN** `dispatchBatchAgent()` claims an unlocked subagent
- **THEN** the system creates a single `subagent.lock` file (not one per query)

#### Scenario: Lock release after batch

- **WHEN** batch processing completes (or `wait: false`)
- **THEN** the workspace lock behavior follows the same rules as single dispatch (immediate unlock if `wait: false`, unlock after completion if `wait: true`)

### Requirement: Batch Response File Handling

The system SHALL generate response files following the pattern `{timestamp}_{index}_res.tmp.md` and `{timestamp}_{index}_res.md` for each query in the batch.

#### Scenario: Response file naming

- **GIVEN** a batch dispatch with 3 queries at timestamp "20251120143000"
- **WHEN** the VS Code agent processes the batch
- **THEN** response files are named:
  - `20251120143000_0_res.tmp.md` → `20251120143000_0_res.md`
  - `20251120143000_1_res.tmp.md` → `20251120143000_1_res.md`
  - `20251120143000_2_res.tmp.md` → `20251120143000_2_res.md`

### Requirement: Batch Wait Behavior

The system SHALL wait for all response files to be renamed from `.tmp.md` to `.md` when `wait: true` is specified, before returning from `dispatchBatchAgent()`.

#### Scenario: Wait for all responses

- **GIVEN** a batch dispatch with 3 queries and `wait: true`
- **WHEN** the VS Code agent processes queries
- **THEN** `dispatchBatchAgent()` waits until all 3 `*_res.tmp.md` files are renamed to `*_res.md`
- **AND** returns only after all responses are complete

#### Scenario: No wait returns immediately

- **GIVEN** a batch dispatch with `wait: false`
- **WHEN** the VS Code agent starts processing
- **THEN** `dispatchBatchAgent()` returns immediately with request file paths
- **AND** does not wait for response files

#### Scenario: Partial completion with wait

- **GIVEN** a batch dispatch with 3 queries and `wait: true`
- **WHEN** 2 queries complete but 1 is still processing
- **THEN** `dispatchBatchAgent()` continues waiting
- **AND** only returns when all 3 response files exist

### Requirement: Batch Export Availability

The system SHALL export `dispatchBatchAgent()` as a public API function but NOT expose it via CLI commands.

#### Scenario: Programmatic API only

- **WHEN** a Node.js application imports from `agentDispatch.ts`
- **THEN** `dispatchBatchAgent` is available as an exported function

#### Scenario: No CLI command

- **WHEN** user runs `subagent code --help`
- **THEN** no batch dispatch command appears (batch dispatch is programmatic only)
