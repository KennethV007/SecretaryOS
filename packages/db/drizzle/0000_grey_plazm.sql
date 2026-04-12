CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'denied', 'expired');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('discord', 'dashboard', 'cli', 'voice', 'imessage');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('conversation', 'project', 'event', 'preference', 'persona', 'repo', 'task');--> statement-breakpoint
CREATE TYPE "public"."memory_scope" AS ENUM('global', 'project', 'repo', 'persona', 'channel', 'after_hours_only');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('discord', 'imessage', 'voice', 'dashboard', 'codex_task', 'api');--> statement-breakpoint
CREATE TYPE "public"."mode" AS ENUM('assistant', 'planner', 'after_hours');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('codex_mcp', 'openrouter', 'mempalace', 'system');--> statement-breakpoint
CREATE TYPE "public"."skill_run_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('queued', 'planning', 'awaiting_approval', 'running', 'review', 'complete', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."task_step_status" AS ENUM('queued', 'running', 'awaiting_approval', 'complete', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('chat_assistant', 'planner_deep_dive', 'repo_execute', 'repo_audit', 'filesystem_reorg', 'security_sweep', 'markdown_runbook_execute', 'usage_report', 'daily_checkin', 'after_hours_chat');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"action_name" text NOT NULL,
	"reason" text NOT NULL,
	"requested_in_channel" "channel" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"due_at" timestamp with time zone,
	"followup_policy" text DEFAULT 'manual' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"external_memory_id" text,
	"kind" "memory_kind" NOT NULL,
	"scope" "memory_scope" NOT NULL,
	"project_id" text,
	"persona_id" text,
	"title" text NOT NULL,
	"content_summary" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"importance" integer DEFAULT 0 NOT NULL,
	"source" "memory_source" NOT NULL,
	"visibility" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"lane" text NOT NULL,
	"provider" "provider" NOT NULL,
	"model_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_mode" "mode" NOT NULL,
	"prompt_pack_path" text NOT NULL,
	"voice_profile" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"repo_path" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"codex_profile" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"channel_session_key" text NOT NULL,
	"active_mode" "mode" NOT NULL,
	"active_persona_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"skill_name" text NOT NULL,
	"input_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "skill_run_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"label" text NOT NULL,
	"status" "task_step_status" NOT NULL,
	"output_text" text,
	"artifact_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "task_type" NOT NULL,
	"status" "task_status" NOT NULL,
	"approval_class" integer NOT NULL,
	"session_id" text NOT NULL,
	"project_id" text,
	"persona_id" text,
	"mode" "mode" NOT NULL,
	"title" text NOT NULL,
	"input_text" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "provider" NOT NULL,
	"model" text NOT NULL,
	"lane" text NOT NULL,
	"task_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_persona_id_personas_id_fk" FOREIGN KEY ("active_persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_runs" ADD CONSTRAINT "skill_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_steps" ADD CONSTRAINT "task_steps_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_task_id_idx" ON "approvals" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_due_at_idx" ON "events" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "memory_items_kind_idx" ON "memory_items" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "memory_items_scope_idx" ON "memory_items" USING btree ("scope");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_items_external_memory_id_idx" ON "memory_items" USING btree ("external_memory_id");--> statement-breakpoint
CREATE INDEX "model_routes_lane_priority_idx" ON "model_routes" USING btree ("lane","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "personas_slug_idx" ON "personas" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_channel_session_key_idx" ON "sessions" USING btree ("channel_session_key");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_runs_task_id_idx" ON "skill_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_steps_task_id_idx" ON "task_steps" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_steps_task_id_step_index_idx" ON "task_steps" USING btree ("task_id","step_index");--> statement-breakpoint
CREATE INDEX "tasks_session_id_idx" ON "tasks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "usage_records_task_id_idx" ON "usage_records" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "usage_records_created_at_idx" ON "usage_records" USING btree ("created_at");
--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."improvement_status" AS ENUM('proposed', 'experimental', 'submitted_for_approval', 'adopted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."policy_surface" AS ENUM('routing', 'memory', 'workflow', 'prompt');--> statement-breakpoint
CREATE TYPE "public"."prompt_surface" AS ENUM('system', 'assistant_mode', 'planner_mode', 'after_hours_mode', 'workflow', 'memory_injection');--> statement-breakpoint
CREATE TYPE "public"."promotion_tier" AS ENUM('auto_adopt', 'approval_required', 'locked');--> statement-breakpoint
CREATE TYPE "public"."replay_case_category" AS ENUM('conversation', 'task', 'workflow', 'memory', 'other');--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"eval_name" text NOT NULL,
	"task_id" text,
	"candidate_id" text,
	"score" numeric(12, 6) NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "experiment_results" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"metric_name" text NOT NULL,
	"metric_value" numeric(12, 6) NOT NULL,
	"notes" text
);--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text,
	"variant_name" text NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "experiment_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "improvement_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"target_surface" text NOT NULL,
	"proposed_by" text NOT NULL,
	"status" "improvement_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"surface" "policy_surface" NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" "prompt_surface" NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "replay_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "replay_case_category" NOT NULL,
	"input_payload" jsonb NOT NULL,
	"expected_traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "system_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text,
	"category" text NOT NULL,
	"severity" "incident_severity" NOT NULL,
	"summary" text NOT NULL,
	"root_cause_guess" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "eval_runs_eval_name_idx" ON "eval_runs" USING btree ("eval_name");--> statement-breakpoint
CREATE INDEX "experiment_results_experiment_id_idx" ON "experiment_results" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiments_candidate_id_idx" ON "experiments" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "improvement_candidates_status_idx" ON "improvement_candidates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_surface_version_idx" ON "policy_versions" USING btree ("surface","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_scope_name_version_idx" ON "prompt_versions" USING btree ("scope","name","version");--> statement-breakpoint
CREATE INDEX "replay_cases_category_idx" ON "replay_cases" USING btree ("category");--> statement-breakpoint
CREATE INDEX "system_incidents_category_idx" ON "system_incidents" USING btree ("category");--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_candidate_id_improvement_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."improvement_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_incidents" ADD CONSTRAINT "system_incidents_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
