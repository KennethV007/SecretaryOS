import {
  CHANNELS,
  MEMORY_KINDS,
  MEMORY_SCOPES,
  MODEL_PROVIDERS,
  MODES,
  POLICY_SURFACES,
  PROMPT_SURFACES,
  TASK_STATUSES,
  TASK_STEP_STATUSES,
  TASK_TYPES,
} from "@secretaryos/core";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const channelEnum = pgEnum("channel", CHANNELS);
export const modeEnum = pgEnum("mode", MODES);
export const taskTypeEnum = pgEnum("task_type", TASK_TYPES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const taskStepStatusEnum = pgEnum(
  "task_step_status",
  TASK_STEP_STATUSES,
);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "denied",
  "expired",
]);
export const memoryKindEnum = pgEnum("memory_kind", MEMORY_KINDS);
export const memoryScopeEnum = pgEnum("memory_scope", MEMORY_SCOPES);
export const memorySourceEnum = pgEnum("memory_source", [
  "discord",
  "imessage",
  "voice",
  "dashboard",
  "codex_task",
  "api",
]);
export const providerEnum = pgEnum("provider", MODEL_PROVIDERS);
export const promptSurfaceEnum = pgEnum("prompt_surface", PROMPT_SURFACES);
export const policySurfaceEnum = pgEnum("policy_surface", POLICY_SURFACES);
export const skillRunStatusEnum = pgEnum("skill_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const promotionTierEnum = pgEnum("promotion_tier", [
  "auto_adopt",
  "approval_required",
  "locked",
]);
export const replayCaseCategoryEnum = pgEnum("replay_case_category", [
  "conversation",
  "task",
  "workflow",
  "memory",
  "other",
]);
export const improvementStatusEnum = pgEnum("improvement_status", [
  "proposed",
  "experimental",
  "submitted_for_approval",
  "adopted",
  "rejected",
]);
export const experimentStatusEnum = pgEnum("experiment_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const incidentSeverityEnum = pgEnum("incident_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

const timestampColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const personas = pgTable(
  "personas",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    defaultMode: modeEnum("default_mode").notNull(),
    promptPackPath: text("prompt_pack_path").notNull(),
    voiceProfile: text("voice_profile"),
    ...timestampColumns,
  },
  (table) => [uniqueIndex("personas_slug_idx").on(table.slug)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    repoPath: text("repo_path").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    codexProfile: text("codex_profile").notNull().default("default"),
    ...timestampColumns,
  },
  (table) => [uniqueIndex("projects_slug_idx").on(table.slug)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channel: channelEnum("channel").notNull(),
    channelSessionKey: text("channel_session_key").notNull(),
    activeMode: modeEnum("active_mode").notNull(),
    activePersonaId: text("active_persona_id").references(() => personas.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sessions_channel_session_key_idx").on(table.channelSessionKey),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    type: taskTypeEnum("type").notNull(),
    status: taskStatusEnum("status").notNull(),
    approvalClass: integer("approval_class").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    personaId: text("persona_id").references(() => personas.id, {
      onDelete: "set null",
    }),
    mode: modeEnum("mode").notNull(),
    title: text("title").notNull(),
    inputText: text("input_text").notNull(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("tasks_session_id_idx").on(table.sessionId),
    index("tasks_status_idx").on(table.status),
    index("tasks_project_id_idx").on(table.projectId),
  ],
);

export const taskSteps = pgTable(
  "task_steps",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    label: text("label").notNull(),
    status: taskStepStatusEnum("status").notNull(),
    outputText: text("output_text"),
    artifactPath: text("artifact_path"),
    ...timestampColumns,
  },
  (table) => [
    index("task_steps_task_id_idx").on(table.taskId),
    uniqueIndex("task_steps_task_id_step_index_idx").on(
      table.taskId,
      table.stepIndex,
    ),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actionName: text("action_name").notNull(),
    reason: text("reason").notNull(),
    requestedInChannel: channelEnum("requested_in_channel").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("approvals_task_id_idx").on(table.taskId),
    index("approvals_status_idx").on(table.status),
  ],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: text("id").primaryKey(),
    externalMemoryId: text("external_memory_id"),
    kind: memoryKindEnum("kind").notNull(),
    scope: memoryScopeEnum("scope").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    personaId: text("persona_id").references(() => personas.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    contentSummary: text("content_summary").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    importance: integer("importance").notNull().default(0),
    source: memorySourceEnum("source").notNull(),
    visibility: text("visibility").notNull().default("default"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("memory_items_kind_idx").on(table.kind),
    index("memory_items_scope_idx").on(table.scope),
    uniqueIndex("memory_items_external_memory_id_idx").on(
      table.externalMemoryId,
    ),
  ],
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    followupPolicy: text("followup_policy").notNull().default("manual"),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("events_due_at_idx").on(table.dueAt)],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    provider: providerEnum("provider").notNull(),
    model: text("model").notNull(),
    lane: text("lane").notNull(),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCost: numeric("estimated_cost", {
      precision: 12,
      scale: 6,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("usage_records_task_id_idx").on(table.taskId),
    index("usage_records_created_at_idx").on(table.createdAt),
  ],
);

export const modelRoutes = pgTable(
  "model_routes",
  {
    id: text("id").primaryKey(),
    lane: text("lane").notNull(),
    provider: providerEnum("provider").notNull(),
    modelName: text("model_name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    ...timestampColumns,
  },
  (table) => [
    index("model_routes_lane_priority_idx").on(table.lane, table.priority),
  ],
);

export const skillRuns = pgTable(
  "skill_runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    inputJson: jsonb("input_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputJson: jsonb("output_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: skillRunStatusEnum("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("skill_runs_task_id_idx").on(table.taskId)],
);

export const replayCases = pgTable(
  "replay_cases",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: replayCaseCategoryEnum("category").notNull(),
    inputPayload: jsonb("input_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    expectedTraits: jsonb("expected_traits")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("replay_cases_category_idx").on(table.category)],
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: text("id").primaryKey(),
    evalName: text("eval_name").notNull(),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    candidateId: text("candidate_id"),
    score: numeric("score", { precision: 12, scale: 6 }).notNull(),
    passed: boolean("passed").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("eval_runs_eval_name_idx").on(table.evalName)],
);

export const improvementCandidates = pgTable(
  "improvement_candidates",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    targetSurface: text("target_surface").notNull(),
    proposedBy: text("proposed_by").notNull(),
    status: improvementStatusEnum("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("improvement_candidates_status_idx").on(table.status)],
);

export const experiments = pgTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id").references(
      () => improvementCandidates.id,
      {
        onDelete: "set null",
      },
    ),
    variantName: text("variant_name").notNull(),
    configJson: jsonb("config_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: experimentStatusEnum("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("experiments_candidate_id_idx").on(table.candidateId)],
);

export const experimentResults = pgTable(
  "experiment_results",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    metricName: text("metric_name").notNull(),
    metricValue: numeric("metric_value", { precision: 12, scale: 6 }).notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("experiment_results_experiment_id_idx").on(table.experimentId),
  ],
);

export const systemIncidents = pgTable(
  "system_incidents",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    severity: incidentSeverityEnum("severity").notNull(),
    summary: text("summary").notNull(),
    rootCauseGuess: text("root_cause_guess"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("system_incidents_category_idx").on(table.category)],
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: text("id").primaryKey(),
    scope: promptSurfaceEnum("scope").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("prompt_versions_scope_name_version_idx").on(
      table.scope,
      table.name,
      table.version,
    ),
  ],
);

export const policyVersions = pgTable(
  "policy_versions",
  {
    id: text("id").primaryKey(),
    surface: policySurfaceEnum("surface").notNull(),
    configJson: jsonb("config_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    version: integer("version").notNull(),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("policy_versions_surface_version_idx").on(
      table.surface,
      table.version,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const personasRelations = relations(personas, ({ many }) => ({
  sessions: many(sessions),
  tasks: many(tasks),
  memories: many(memoryItems),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
  memories: many(memoryItems),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  persona: one(personas, {
    fields: [sessions.activePersonaId],
    references: [personas.id],
  }),
  tasks: many(tasks),
  events: many(events),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  session: one(sessions, {
    fields: [tasks.sessionId],
    references: [sessions.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  persona: one(personas, {
    fields: [tasks.personaId],
    references: [personas.id],
  }),
  steps: many(taskSteps),
  approvals: many(approvals),
  skillRuns: many(skillRuns),
  usageRecords: many(usageRecords),
}));

export const taskStepsRelations = relations(taskSteps, ({ one }) => ({
  task: one(tasks, {
    fields: [taskSteps.taskId],
    references: [tasks.id],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  task: one(tasks, {
    fields: [approvals.taskId],
    references: [tasks.id],
  }),
}));

export const memoryItemsRelations = relations(memoryItems, ({ one }) => ({
  project: one(projects, {
    fields: [memoryItems.projectId],
    references: [projects.id],
  }),
  persona: one(personas, {
    fields: [memoryItems.personaId],
    references: [personas.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  session: one(sessions, {
    fields: [events.sessionId],
    references: [sessions.id],
  }),
}));

export const usageRecordsRelations = relations(usageRecords, ({ one }) => ({
  task: one(tasks, {
    fields: [usageRecords.taskId],
    references: [tasks.id],
  }),
}));

export const skillRunsRelations = relations(skillRuns, ({ one }) => ({
  task: one(tasks, {
    fields: [skillRuns.taskId],
    references: [tasks.id],
  }),
}));

export const replayCasesRelations = relations(replayCases, () => ({}));

export const evalRunsRelations = relations(evalRuns, ({ one }) => ({
  task: one(tasks, {
    fields: [evalRuns.taskId],
    references: [tasks.id],
  }),
}));

export const improvementCandidatesRelations = relations(
  improvementCandidates,
  () => ({}),
);

export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  candidate: one(improvementCandidates, {
    fields: [experiments.candidateId],
    references: [improvementCandidates.id],
  }),
  results: many(experimentResults),
}));

export const experimentResultsRelations = relations(
  experimentResults,
  ({ one }) => ({
    experiment: one(experiments, {
      fields: [experimentResults.experimentId],
      references: [experiments.id],
    }),
  }),
);

export const systemIncidentsRelations = relations(
  systemIncidents,
  ({ one }) => ({
    task: one(tasks, {
      fields: [systemIncidents.taskId],
      references: [tasks.id],
    }),
  }),
);

export const schema = {
  users,
  personas,
  projects,
  sessions,
  tasks,
  taskSteps,
  approvals,
  memoryItems,
  events,
  usageRecords,
  modelRoutes,
  skillRuns,
  replayCases,
  evalRuns,
  improvementCandidates,
  experiments,
  experimentResults,
  systemIncidents,
  promptVersions,
  policyVersions,
};
