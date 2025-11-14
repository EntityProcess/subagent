# OpenSpec Instructions

Instructions for AI coding assistants using OpenSpec for spec-driven development.

## TL;DR Quick Checklist

- **Important**: Run all `openspec` commands from the same directory as this AGENTS.md file (the `openspec/` parent directory)
- Search existing work: `openspec spec list --long`, `openspec list` (use `rg` only for full-text search)
- Decide scope: new capability vs modify existing capability
- Pick a unique `change-id`: kebab-case, verb-led (`add-`, `update-`, `remove-`, `refactor-`)
- Scaffold: `proposal.md`, `tasks.md`, `design.md` (only if needed), and delta specs per affected capability
- Write deltas: use `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`; include at least one `#### Scenario:` per requirement
- Validate: `openspec validate [change-id] --strict` and fix issues
- Request approval: Do not start implementation until proposal is approved

## Project Context

This OpenSpec instance tracks specifications and changes for the **subagent** project - a CLI tool for managing workspace agents across different backends (VS Code, VS Code Insiders, and future backends).

Key areas covered:
- Workspace provisioning and configuration
- Template management
- Agent dispatch and lifecycle
- Lock management and concurrency

## Quick Start for Subagent

### View Current State
```bash
openspec list                # Active changes
openspec list --specs        # Current specifications
```

### Create New Change
```bash
# 1. Review existing context
openspec spec list --long
openspec show workspace-provisioning --type spec

# 2. Create proposal structure
CHANGE=add-new-feature
mkdir -p openspec/changes/$CHANGE/specs/affected-capability
# Create proposal.md, tasks.md, design.md (if needed)
# Create spec deltas in specs/affected-capability/spec.md

# 3. Validate
openspec validate $CHANGE --strict
```

## Key Commands

```bash
openspec list                           # List active changes
openspec list --specs                   # List specifications
openspec show <change-id>               # Show change details
openspec show <spec-id> --type spec     # Show specification
openspec validate <change-id> --strict  # Validate change
openspec archive <change-id> --yes      # Archive completed change
```

## Current Specifications

### workspace-provisioning
Defines requirements for provisioning subagent workspace directories, including:
- Default and custom template handling
- Workspace file management and naming
- Template validation

## Workflow Stages

1. **Creating Changes**: Scaffold proposal, design, tasks, and spec deltas
2. **Implementing Changes**: Work through tasks, update code, test
3. **Archiving Changes**: Move to archive after deployment, update specs

For detailed workflow documentation, refer to the OpenSpec AGENTS.md from the agentevo repository or see the inline comments in this file.
