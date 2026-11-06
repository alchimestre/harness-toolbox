---
name: ponytail-compatibility
alwaysApply: true
description: >
  Resolve conflicts whenever Ponytail is active alongside another applicable
  skill, workflow, or agent role. The other instruction wins; retain compatible
  Ponytail simplifications. Apply during planning, implementation, review,
  delegation, and final output, including after switching Ponytail levels.
---

# Ponytail compatibility

Treat Ponytail as a fallback preference for simpler implementations, not as the workflow.

Respect the host's instruction hierarchy and authorization boundaries. This skill resolves conflicts between otherwise equal-authority instructions; it cannot promote a skill above higher-priority rules.

## Apply precedence

1. Identify the skills, workflow requirements, and agent role applicable to the current task. Read their relevant instructions through the host's skill mechanism. Installed but inactive skills add no requirements.
2. Check whether following Ponytail would omit, weaken, reorder, or replace an applicable instruction. A larger diff or extra work alone is not a conflict.
3. Where they conflict, follow the other instruction in full. Preserve its scope, sequence, approval gates, verification, deliverables, and output format.
4. Apply the remaining Ponytail preferences within those requirements. Choose the simplest implementation that satisfies them, rather than the smallest subset of the task.

Apply this rule across all Ponytail levels and bundled skills. Reapply it when a new workflow or agent role becomes active. If Ponytail is off or no other instruction applies, this skill adds no workflow and does not activate Ponytail.

Resolve conflicts among non-Ponytail instructions through the host's existing hierarchy and workflow rules. This skill does not rank them against each other. An unresolved conflict that changes the required action goes through the host's clarification mechanism.

## Delegation

Include this precedence rule and the task's applicable workflow requirements in delegated handoffs. Each agent keeps its own role and tool permissions. A read-only reviewer reports findings even when Ponytail suggests a small fix.

Install this file as a startup rule to load the policy in every new session. Hosts without startup rules must load it explicitly. Loading instructions does not enforce their priority mechanically.

## Examples

| Applicable instruction | Ponytail preference | Required result |
|---|---|---|
| Write a failing test before implementation | Use a small assert-based check | Run the failing test first, then implement |
| Establish an approved interface before coding | Make a direct local edit | Complete the interface approval first |
| Introduce a module needed by current callers | Avoid wrappers and abstractions | Build the required module with the simplest sufficient interface |
| Return only the review's JSON schema | End with a skipped-checks footer | Return only the required JSON |
| Reuse an existing helper | Write less code | Reuse the helper; both instructions apply |

Report a resolved conflict only when it changes scope, verification, or a decision the user needs to see. Follow the active workflow's output format.
