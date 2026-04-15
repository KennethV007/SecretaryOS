import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  Mode,
} from "@secretaryos/core";

const execFileAsync = promisify(execFile);

export type MemoryQuery = {
  text: string;
  scope: MemoryScope;
  projectId?: string;
  personaId?: string;
  limit?: number;
};

export type MemorySearchResult = {
  content: string;
  score?: number;
};

export type MemorySearchResponse = {
  query: string;
  results: MemorySearchResult[];
  rawOutput: string;
};

export type MemoryRetrievalInput = {
  text: string;
  scope: MemoryScope;
  mode: Mode;
  projectId?: string;
  personaId?: string;
  structuredMemories: MemoryRecord[];
  limit?: number;
};

export type MemoryRetrievalEntry = {
  source: "structured" | "mempalace";
  content: string;
  kind?: MemoryKind;
  scope?: MemoryScope;
  projectId?: string;
  personaId?: string;
  score?: number;
};

export type MemoryRetrievalResult = {
  entries: MemoryRetrievalEntry[];
  text?: string;
};

export type MemoryImportResponse = {
  sourcePath: string;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{
  stdout: string;
  stderr: string;
}>;

export interface MemoryClient {
  search(query: MemoryQuery): Promise<MemorySearchResponse>;
  ingestConversationExport(sourcePath: string): Promise<MemoryImportResponse>;
  status(): Promise<{ available: boolean }>;
}

async function defaultCommandRunner(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseSearchOutput(rawOutput: string): MemorySearchResult[] {
  return rawOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((content) => ({
      content,
    }));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(/[^a-z0-9]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length > 2),
    ),
  );
}

function textMatches(query: string, candidate: string): boolean {
  const queryTokens = new Set(tokenize(query));

  return tokenize(candidate).some((token) => queryTokens.has(token));
}

function summarizeMemoryRecord(memory: MemoryRecord): string {
  return memory.summary ?? memory.content;
}

function selectStructuredMemoryScopes(
  input: MemoryRetrievalInput,
): MemoryScope[] {
  if (input.scope === "after_hours_only") {
    return ["after_hours_only"];
  }

  const scopes: MemoryScope[] = ["global"];

  if (input.projectId) {
    scopes.unshift("project");
  }

  scopes.push("persona");

  return scopes;
}

function dedupeMemoryEntries(
  entries: MemoryRetrievalEntry[],
): MemoryRetrievalEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = normalizeText(entry.content);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function formatMemoryContext(
  entries: MemoryRetrievalEntry[],
): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const structuredEntries = entries.filter(
    (entry) => entry.source === "structured",
  );
  const semanticEntries = entries.filter(
    (entry) => entry.source === "mempalace",
  );
  const sections: string[] = [
    "Relevant memory context:",
    "Use these memories only when they are relevant to the current task.",
  ];

  if (structuredEntries.length > 0) {
    sections.push("Structured facts:");
    sections.push(
      ...structuredEntries.map(
        (entry) =>
          `- [${entry.kind ?? "memory"}${entry.scope ? `/${entry.scope}` : ""}] ${entry.content}`,
      ),
    );
  }

  if (semanticEntries.length > 0) {
    sections.push("MemPalace recall:");
    sections.push(
      ...semanticEntries.map(
        (entry) =>
          `- ${entry.content}${entry.score !== undefined ? ` (score ${entry.score.toFixed(2)})` : ""}`,
      ),
    );
  }

  return sections.join("\n");
}

export async function retrieveMemoryContext(
  client: MemoryClient,
  input: MemoryRetrievalInput,
): Promise<MemoryRetrievalResult> {
  const normalizedQuery = input.text.trim();
  if (!normalizedQuery) {
    return { entries: [] };
  }

  const structuredLimit = input.limit ?? 8;
  const structuredScopes = selectStructuredMemoryScopes(input);
  const normalizedProjectId = input.projectId?.trim();
  const normalizedPersonaId = input.personaId?.trim();
  const normalizedQueryText = normalizeText(normalizedQuery);

  const structuredEntries = input.structuredMemories
    .filter((memory) => structuredScopes.includes(memory.scope))
    .filter((memory) =>
      normalizedProjectId && memory.projectId
        ? memory.projectId === normalizedProjectId
        : true,
    )
    .filter((memory) =>
      normalizedPersonaId && memory.personaId
        ? memory.personaId === normalizedPersonaId
        : true,
    )
    .filter((memory) => {
      if (!normalizedQueryText) {
        return true;
      }

      return [memory.content, memory.summary]
        .filter(Boolean)
        .some((value) => textMatches(normalizedQueryText, value ?? ""));
    })
    .slice(0, structuredLimit)
    .map<MemoryRetrievalEntry>((memory) => ({
      source: "structured",
      content: summarizeMemoryRecord(memory),
      kind: memory.kind,
      scope: memory.scope,
      projectId: memory.projectId,
      personaId: memory.personaId,
    }));

  const semanticResponse = await client.search({
    text: normalizedQuery,
    scope: input.scope,
    projectId: input.projectId,
    personaId: input.personaId,
    limit: input.limit,
  });

  const semanticEntries = semanticResponse.results
    .slice(0, input.limit ?? 8)
    .map<MemoryRetrievalEntry>((result) => ({
      source: "mempalace",
      content: result.content,
      score: result.score,
    }));

  const entries = dedupeMemoryEntries([
    ...structuredEntries,
    ...semanticEntries,
  ]);
  const text = formatMemoryContext(entries);

  return {
    entries,
    text,
  };
}

export class MemPalaceCliClient implements MemoryClient {
  constructor(
    private readonly command = process.env.MEMPALACE_COMMAND || "mempalace",
    private readonly args = parseCommandArgs(process.env.MEMPALACE_ARGS),
    private readonly runner: CommandRunner = defaultCommandRunner,
  ) {}

  async search(query: MemoryQuery): Promise<MemorySearchResponse> {
    const args = [...this.args, "search", query.text];

    if (query.projectId || query.personaId) {
      args.push(`--wing=${query.projectId ?? query.personaId}`);
    }

    const { stdout } = await this.runner(this.command, args);

    return {
      query: query.text,
      results: parseSearchOutput(stdout).slice(
        0,
        query.limit ?? Number.POSITIVE_INFINITY,
      ),
      rawOutput: stdout,
    };
  }

  async ingestConversationExport(
    sourcePath: string,
  ): Promise<MemoryImportResponse> {
    const { stdout, stderr } = await this.runner(this.command, [
      ...this.args,
      "mine",
      "conversations",
      sourcePath,
    ]);

    return {
      sourcePath,
      stdout,
      stderr,
    };
  }

  async status(): Promise<{ available: boolean }> {
    try {
      await this.runner(this.command, [...this.args, "--help"]);

      return {
        available: true,
      };
    } catch {
      return {
        available: false,
      };
    }
  }
}

export function createMemoryClient(
  env: NodeJS.ProcessEnv = process.env,
): MemoryClient {
  return new MemPalaceCliClient(
    env.MEMPALACE_COMMAND || "mempalace",
    parseCommandArgs(env.MEMPALACE_ARGS),
  );
}

export function parseCommandArgs(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
