import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import {
  ApprovalStatusSchema,
  CreateMessageInputSchema,
  CreateSessionInputSchema,
  CreateTaskInputSchema,
  IdSchema,
  MemoryKindSchema,
  MemoryScopeSchema,
  MemorySourceSchema,
  PolicySurfaceSchema,
  PromptSurfaceSchema,
  ResolveApprovalInputSchema,
  SetActivePersonaInputSchema,
  SetGlobalActivePersonaInputSchema,
  TaskRecordSchema,
  TaskStatusSchema,
  UpdateSessionInputSchema,
  UsageCaptureSchema,
  UsageWindowSchema,
} from "@secretaryos/core";
import {
  OrchestratorError,
  SecretaryOrchestrator,
  createInMemoryRuntimeState,
} from "@secretaryos/orchestrator";
import {
  importSkillPack,
  listAvailableSkills,
  listImportedSkillPacks,
} from "@secretaryos/skills";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiConfig } from "./config.js";

class ValidationError extends Error {
  constructor(readonly details: unknown) {
    super("Request validation failed.");
    this.name = "ValidationError";
  }
}

class AuthenticationError extends Error {
  constructor(message = "Invalid internal API key.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

const IdParamSchema = z.object({
  id: IdSchema,
});

const SessionMessageQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const SkillImportSchema = z.object({
  sourceDir: z.string().min(1),
});

const MemoryQuerySchema = z.object({
  text: z.string().min(1).optional(),
  kind: MemoryKindSchema.optional(),
  scope: MemoryScopeSchema.optional(),
  source: MemorySourceSchema.optional(),
  projectId: IdSchema.optional(),
  personaId: IdSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const InternalTaskUpdateSchema = z.object({
  task: TaskRecordSchema,
});

const InternalTaskCompletionSchema = z.object({
  task: TaskRecordSchema,
  outputText: z.string().optional(),
  usage: UsageCaptureSchema.optional(),
});

const InternalMemoryWriteSchema = z.object({
  kind: z.literal("memory.write"),
  taskId: IdSchema,
  content: z.string().min(1),
  memoryKind: MemoryKindSchema.optional(),
  scope: MemoryScopeSchema,
  requestedAt: z.string().datetime(),
});

const ImprovementCandidateInputSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  targetSurface: z.string().min(1),
  proposedBy: z.string().min(1),
  status: z
    .enum([
      "proposed",
      "experimental",
      "submitted_for_approval",
      "adopted",
      "rejected",
    ])
    .optional(),
});

const ExperimentInputSchema = z.object({
  candidateId: IdSchema.optional(),
  variantName: z.string().min(1),
  configJson: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["queued", "running", "completed", "failed"]).optional(),
});

const PromptVersionInputSchema = z.object({
  scope: PromptSurfaceSchema,
  name: z.string().min(1),
  content: z.string().min(1),
  version: z.number().int().positive(),
  active: z.boolean().optional(),
});

const PolicyVersionInputSchema = z.object({
  surface: PolicySurfaceSchema,
  configJson: z.record(z.string(), z.unknown()).default({}),
  version: z.number().int().positive(),
  active: z.boolean().optional(),
});

const ExperimentResultInputSchema = z.object({
  experimentId: IdSchema,
  metricName: z.string().min(1),
  metricValue: z.number(),
  notes: z.string().optional(),
});

const PersonaCreateInputSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  basePrompt: z.string().min(1),
  fullPrompt: z.string().min(1),
  definitionMarkdown: z.string().optional(),
  voice: z.string().default(""),
  traits: z.array(z.string()).default([]),
  formattingPreferences: z.array(z.string()).default([]),
  memoryScopePolicy: MemoryScopeSchema.default("global"),
  enabled: z.boolean().default(true),
});

type PersonaCreatePayload = z.infer<typeof PersonaCreateInputSchema> & {
  profileImage?: {
    fileName: string;
    data: Buffer;
  };
  galleryImages: Array<{
    fileName: string;
    data: Buffer;
  }>;
};

type MultipartPart = {
  type: "file" | "field";
  fieldname: string;
  value?: string;
  filename?: string;
  mimetype?: string;
  toBuffer?: () => Promise<Buffer>;
};

function parseWithSchema<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false; error: unknown };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new ValidationError(parsed.error);
  }

  return parsed.data;
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePersonaBody(value: unknown): PersonaCreatePayload {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const parsed = parseWithSchema(PersonaCreateInputSchema, {
    slug: raw.slug,
    name: raw.name,
    description: raw.description ?? "",
    basePrompt: raw.basePrompt,
    fullPrompt: raw.fullPrompt,
    definitionMarkdown: raw.definitionMarkdown,
    voice: raw.voice ?? "",
    traits: splitList(raw.traits),
    formattingPreferences: splitList(raw.formattingPreferences),
    memoryScopePolicy: raw.memoryScopePolicy ?? "global",
    enabled:
      typeof raw.enabled === "boolean"
        ? raw.enabled
        : String(raw.enabled ?? "true") !== "false",
  });

  return {
    ...parsed,
    galleryImages: [],
  };
}

function getPersonaPackRoot(config: ApiConfig): string {
  return resolve(process.cwd(), config.personaPackRoot);
}

function getSkillPackRoot(config: ApiConfig): string {
  return resolve(process.cwd(), config.skillPackRoot);
}

function getFileContentType(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
}

async function readPersonaCreateMultipart(request: {
  parts: () => AsyncIterable<MultipartPart>;
}): Promise<PersonaCreatePayload> {
  const fields: Record<string, unknown> = {};
  let profileImage:
    | {
        fileName: string;
        data: Buffer;
      }
    | undefined;
  const galleryImages: Array<{
    fileName: string;
    data: Buffer;
  }> = [];

  for await (const part of request.parts()) {
    if (part.type === "field") {
      const current = fields[part.fieldname];

      if (current === undefined) {
        fields[part.fieldname] = part.value;
      } else if (Array.isArray(current)) {
        current.push(part.value ?? "");
      } else {
        fields[part.fieldname] = [current, part.value ?? ""];
      }
      continue;
    }

    if (!part.filename || !part.toBuffer) {
      continue;
    }

    const buffer = await part.toBuffer();

    if (part.fieldname === "profileImage") {
      profileImage = {
        fileName: part.filename,
        data: buffer,
      };
      continue;
    }

    if (part.fieldname === "galleryImages") {
      galleryImages.push({
        fileName: part.filename,
        data: buffer,
      });
    }
  }

  const normalized = normalizePersonaBody(fields);

  return {
    ...normalized,
    profileImage,
    galleryImages,
  };
}

function readInternalApiKey(
  headers: Record<string, unknown>,
): string | undefined {
  const headerValue = headers["x-internal-api-key"];

  return typeof headerValue === "string" ? headerValue : undefined;
}

export function buildApiApp(options: {
  config: ApiConfig;
  runtime?: SecretaryOrchestrator;
}): FastifyInstance {
  const app = Fastify({
    logger: false,
  });
  const runtime =
    options.runtime ??
    new SecretaryOrchestrator(
      createInMemoryRuntimeState({
        personaPackRoot: options.config.personaPackRoot,
        activePersonaStorePath: options.config.activeCharacterPath,
      }),
      {
        personaPackRoot: options.config.personaPackRoot,
        activePersonaStorePath: options.config.activeCharacterPath,
      },
    );

  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });
  app.register(cors, {
    origin: true,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: "validation_error",
        message: error.message,
        details: error.details,
      });
      return;
    }

    if (error instanceof AuthenticationError) {
      reply.status(401).send({
        error: "authentication_error",
        message: error.message,
      });
      return;
    }

    if (error instanceof OrchestratorError) {
      reply.status(error.statusCode).send({
        error: "orchestrator_error",
        message: error.message,
      });
      return;
    }

    reply.status(500).send({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error.",
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
    config: {
      host: options.config.apiHost,
      port: options.config.apiPort,
    },
    stats: runtime.getStats(),
  }));

  app.get("/sessions", async () => ({
    items: runtime.listSessions(),
  }));

  app.post("/sessions", async (request, reply) => {
    const body = parseWithSchema(CreateSessionInputSchema, request.body);
    const session = runtime.createSession(body);

    reply.status(201).send(session);
  });

  app.get("/sessions/:id", async (request) => {
    const params = parseWithSchema(IdParamSchema, request.params);

    return runtime.getSession(params.id);
  });

  app.get("/sessions/:id/messages", async (request) => {
    const params = parseWithSchema(IdParamSchema, request.params);
    const query = parseWithSchema(
      SessionMessageQuerySchema,
      request.query ?? {},
    );
    const messages = runtime.listSessionMessages(params.id);

    return {
      items: query.limit ? messages.slice(-query.limit) : messages,
    };
  });

  app.get("/skills", async () => ({
    items: await listAvailableSkills({
      codexSkillRoot: options.config.codexSkillRoot,
    }),
  }));

  app.get("/skills/packs", async () => ({
    items: await listImportedSkillPacks(getSkillPackRoot(options.config), {
      codexSkillRoot: options.config.codexSkillRoot,
    }),
  }));

  app.post("/skills/import", async (request, reply) => {
    const body = parseWithSchema(SkillImportSchema, request.body);
    const manifest = await importSkillPack(
      resolve(process.cwd(), body.sourceDir),
      getSkillPackRoot(options.config),
      {
        codexSkillRoot: options.config.codexSkillRoot,
      },
    );

    reply.status(201).send(manifest);
  });

  app.get("/sessions/:id/stream", async (request, reply) => {
    const params = parseWithSchema(IdParamSchema, request.params);
    const session = runtime.getSession(params.id);

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });

    const writeEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent("session", session);
    writeEvent("messages", runtime.listSessionMessages(session.id));

    let lastMessageCount = runtime.listSessionMessages(session.id).length;
    let lastTaskSnapshot = runtime
      .listTasks()
      .filter((task) => task.sessionId === session.id)
      .map((task) => `${task.id}:${task.status}`)
      .join("|");

    const interval = setInterval(() => {
      const messages = runtime.listSessionMessages(session.id);
      const taskSnapshot = runtime
        .listTasks()
        .filter((task) => task.sessionId === session.id)
        .map((task) => `${task.id}:${task.status}`)
        .join("|");

      if (messages.length !== lastMessageCount) {
        lastMessageCount = messages.length;
        writeEvent("messages", messages);
      }

      if (taskSnapshot !== lastTaskSnapshot) {
        lastTaskSnapshot = taskSnapshot;
        writeEvent(
          "tasks",
          runtime.listTasks().filter((task) => task.sessionId === session.id),
        );
      }
    }, 1000);

    request.raw.on("close", () => {
      clearInterval(interval);
    });
  });

  app.patch("/sessions/:id", async (request) => {
    const params = parseWithSchema(IdParamSchema, request.params);
    const body = parseWithSchema(UpdateSessionInputSchema, request.body);

    return runtime.updateSession(params.id, body);
  });

  app.post("/messages", async (request, reply) => {
    const body = parseWithSchema(CreateMessageInputSchema, request.body);
    const result = await runtime.receiveMessage(body);

    reply.status(201).send(result);
  });

  app.get("/tasks", async (request) => {
    const status =
      typeof (request.query as { status?: string }).status === "string"
        ? parseWithSchema(
            TaskStatusSchema,
            (request.query as { status?: string }).status,
          )
        : undefined;

    return {
      items: runtime.listTasks(status),
    };
  });

  app.post("/tasks", async (request, reply) => {
    const body = parseWithSchema(CreateTaskInputSchema, request.body);
    const result = await runtime.createTask(body);

    reply.status(201).send(result);
  });

  app.get("/tasks/:id", async (request) => {
    const params = parseWithSchema(IdParamSchema, request.params);

    return runtime.getTask(params.id);
  });

  app.get("/approvals", async (request) => {
    const status =
      typeof (request.query as { status?: string }).status === "string"
        ? parseWithSchema(
            ApprovalStatusSchema,
            (request.query as { status?: string }).status,
          )
        : undefined;

    return {
      items: runtime.listApprovals(status),
    };
  });

  app.get("/approvals/:id", async (request) => {
    const params = parseWithSchema(IdParamSchema, request.params);

    return runtime.getApproval(params.id);
  });

  app.post("/approvals/:id/resolve", async (request) => {
    const params = parseWithSchema(IdParamSchema, request.params);
    const body = parseWithSchema(ResolveApprovalInputSchema, request.body);

    return runtime.resolveApproval(params.id, body.status);
  });

  app.get("/memory", async (request) => {
    const query = parseWithSchema(MemoryQuerySchema, request.query ?? {});

    return {
      items: runtime.listMemory(query),
    };
  });

  app.get("/usage/summary", async (request) => {
    const window =
      typeof (request.query as { window?: string }).window === "string"
        ? parseWithSchema(
            UsageWindowSchema,
            (request.query as { window?: string }).window,
          )
        : "today";

    return runtime.getUsageSummary(window);
  });

  app.get("/personas", async () => ({
    items: runtime.listPersonas(),
  }));

  app.get("/personas/global-active", async () => runtime.getActivePersona());

  app.post("/personas", async (request, reply) => {
    const payload = request.isMultipart()
      ? await readPersonaCreateMultipart(
          request as unknown as { parts: () => AsyncIterable<MultipartPart> },
        )
      : normalizePersonaBody(request.body);
    const persona = runtime.createPersona({
      slug: payload.slug,
      name: payload.name,
      description: payload.description,
      basePrompt: payload.basePrompt,
      fullPrompt: payload.fullPrompt,
      definitionMarkdown: payload.definitionMarkdown,
      voice: payload.voice,
      traits: payload.traits,
      formattingPreferences: payload.formattingPreferences,
      memoryScopePolicy: payload.memoryScopePolicy,
      enabled: payload.enabled,
      profileImage: payload.profileImage,
      galleryImages: payload.galleryImages,
    });

    reply.status(201).send(persona);
  });

  app.get("/replays", async () => ({
    items: runtime.listReplayCases(),
  }));

  app.get("/evals", async () => ({
    items: runtime.listEvalRuns(),
  }));

  app.get("/improvement/candidates", async () => ({
    items: runtime.listImprovementCandidates(),
  }));

  app.post("/improvement/candidates", async (request, reply) => {
    const body = parseWithSchema(ImprovementCandidateInputSchema, request.body);
    const candidate = runtime.createImprovementCandidate(body);

    reply.status(201).send(candidate);
  });

  app.get("/experiments", async () => ({
    items: runtime.listExperiments(),
  }));

  app.post("/experiments", async (request, reply) => {
    const body = parseWithSchema(ExperimentInputSchema, request.body);
    const experiment = runtime.createExperiment(body);

    reply.status(201).send(experiment);
  });

  app.get("/experiment-results", async () => ({
    items: runtime.listExperimentResults(),
  }));

  app.post("/experiment-results", async (request, reply) => {
    const body = parseWithSchema(ExperimentResultInputSchema, request.body);
    const result = runtime.createExperimentResult(body);

    reply.status(201).send(result);
  });

  app.get("/incidents", async () => ({
    items: runtime.listSystemIncidents(),
  }));

  app.get("/prompt-versions", async () => ({
    items: runtime.listPromptVersions(),
  }));

  app.post("/prompt-versions", async (request, reply) => {
    const body = parseWithSchema(PromptVersionInputSchema, request.body);
    const promptVersion = runtime.createPromptVersion(body);

    reply.status(201).send(promptVersion);
  });

  app.get("/policy-versions", async () => ({
    items: runtime.listPolicyVersions(),
  }));

  app.post("/policy-versions", async (request, reply) => {
    const body = parseWithSchema(PolicyVersionInputSchema, request.body);
    const policyVersion = runtime.createPolicyVersion(body);

    reply.status(201).send(policyVersion);
  });

  app.get("/personas/:id", async (request) => {
    const params = parseWithSchema(IdParamSchema, request.params);

    return runtime.getPersona(params.id);
  });

  app.get("/personas/:slug/assets/:fileName", async (request, reply) => {
    const params = parseWithSchema(
      z.object({
        slug: z.string().min(1),
        fileName: z.string().min(1),
      }),
      request.params,
    );
    const filePath = join(
      getPersonaPackRoot(options.config),
      params.slug,
      "assets",
      sanitizeFileName(params.fileName),
    );

    if (!existsSync(filePath)) {
      reply.status(404).send({
        error: "not_found",
        message: `Persona asset '${params.fileName}' was not found.`,
      });
      return;
    }

    reply.header("content-type", getFileContentType(params.fileName));
    reply.header("cache-control", "public, max-age=31536000, immutable");

    return readFileSync(filePath);
  });

  app.post("/personas/active", async (request) => {
    const body = parseWithSchema(SetActivePersonaInputSchema, request.body);

    return runtime.setActivePersona(body.sessionId, body.personaId);
  });

  app.post("/personas/global-active", async (request) => {
    const body = parseWithSchema(
      SetGlobalActivePersonaInputSchema,
      request.body,
    );

    return runtime.setGlobalActivePersona(body.personaId);
  });

  app.post("/internal/tasks/update", async (request) => {
    const internalApiKey = readInternalApiKey(
      request.headers as Record<string, unknown>,
    );

    if (internalApiKey !== options.config.internalApiKey) {
      throw new AuthenticationError();
    }

    const body = parseWithSchema(InternalTaskUpdateSchema, request.body);

    return runtime.recordTaskUpdate(body.task);
  });

  app.post("/internal/tasks/completion", async (request) => {
    const internalApiKey = readInternalApiKey(
      request.headers as Record<string, unknown>,
    );

    if (internalApiKey !== options.config.internalApiKey) {
      throw new AuthenticationError();
    }

    const body = parseWithSchema(InternalTaskCompletionSchema, request.body);

    return runtime.recordTaskCompletion(body);
  });

  app.post("/internal/memory/write", async (request) => {
    const internalApiKey = readInternalApiKey(
      request.headers as Record<string, unknown>,
    );

    if (internalApiKey !== options.config.internalApiKey) {
      throw new AuthenticationError();
    }

    const body = parseWithSchema(InternalMemoryWriteSchema, request.body);

    return runtime.recordMemoryWrite(body);
  });

  return app;
}
