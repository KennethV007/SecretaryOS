# Workflows

## `chat_assistant`
Default conversational workflow for normal assistant requests.

## `planner_deep_dive`
Used for architecture, investigation, decomposition, and high-context planning.

## `repo_execute`
Primary engineering workflow. Default shape is PM pass -> implementation -> review -> docs follow-up when behavior changes.

## `repo_audit`
Repository diagnostics such as lint, test, dependency, and security review.

## `markdown_runbook_execute`
Parses structured markdown plans into deterministic execution steps with approval checkpoints.

## `filesystem_reorg`
File organization workflow that should preview proposed changes before performing writes.

## `after_hours_chat`
Personality-forward conversation with isolated memory scope and reduced operational behavior.
