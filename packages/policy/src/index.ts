import type { ApprovalClass, TaskType } from "@secretaryos/core";

const workflowApprovalMap: Record<TaskType, ApprovalClass> = {
  chat_assistant: 0,
  planner_deep_dive: 0,
  repo_execute: 1,
  repo_audit: 1,
  filesystem_reorg: 2,
  security_sweep: 3,
  markdown_runbook_execute: 1,
  usage_report: 0,
  daily_checkin: 0,
  after_hours_chat: 0,
};

export function classifyWorkflow(taskType: TaskType): ApprovalClass {
  return workflowApprovalMap[taskType];
}

export function classifySkill(skillId: string): ApprovalClass {
  switch (skillId) {
    case "filesystem.list":
    case "filesystem.read":
    case "git.status":
    case "git.diff":
    case "usage.report":
      return 0;
    case "repo.run-tests":
    case "repo.run-lint":
    case "markdown.runbook":
    case "mode.switch":
      return 1;
    case "persona.switch":
      return 2;
    default:
      return skillId.startsWith("system.") ? 3 : 1;
  }
}

export function requiresApproval(approvalClass: ApprovalClass): boolean {
  return approvalClass >= 2;
}

export function isLockedApprovalClass(approvalClass: ApprovalClass): boolean {
  return approvalClass === 3;
}
