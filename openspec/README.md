# OpenSpec Documentation

This directory contains specifications and change proposals for the Subagent project using OpenSpec format.

## Quick Reference

### View Active Changes
```bash
openspec list
```

### View Specifications
```bash
openspec list --specs
```

### Validate a Change
```bash
openspec validate <change-id> --strict
```

### Show Change Details
```bash
openspec show <change-id>
```

## Current Changes

### add-custom-workspace-template

**Status**: Proposed (0/13 tasks completed)

Adds support for specifying a custom `.code-workspace` file that will be copied to each provisioned subagent workspace, enabling standardized workspace configurations across all subagents.

**Files**:
- `changes/add-custom-workspace-template/proposal.md` - Change overview and rationale
- `changes/add-custom-workspace-template/design.md` - Technical design decisions
- `changes/add-custom-workspace-template/tasks.md` - Implementation checklist
- `changes/add-custom-workspace-template/specs/workspace-provisioning/spec.md` - Specification deltas

## Specifications

### workspace-provisioning

Defines requirements for provisioning subagent workspace directories, including template handling, validation, and workspace file management.

**Location**: `specs/workspace-provisioning/spec.md`

## Workflow

1. **Review proposal**: Read `changes/<change-id>/proposal.md`
2. **Check design**: Review `changes/<change-id>/design.md` for technical decisions
3. **Implement tasks**: Complete items in `changes/<change-id>/tasks.md`
4. **Archive**: After deployment, use `openspec archive <change-id>`

## Validation

Always validate changes before implementation:

```bash
openspec validate add-custom-workspace-template --strict
```

Validation ensures:
- All requirements have scenarios
- Deltas properly reference existing specs
- Files follow OpenSpec format conventions
