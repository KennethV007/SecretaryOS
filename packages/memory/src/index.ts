import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { MemoryScope } from "@secretaryos/core";

const execFileAsync = promisify(execFile);

export type MemoryQuery = {
  text: string;
  scope: MemoryScope;
  projectId?: string;
  personaId?: string;
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

export class MemPalaceCliClient implements MemoryClient {
  constructor(
    private readonly command = process.env.MEMPALACE_COMMAND || "mempalace",
    private readonly args = parseCommandArgs(process.env.MEMPALACE_ARGS),
    private readonly runner: CommandRunner = defaultCommandRunner,
  ) {}

  async search(query: MemoryQuery): Promise<MemorySearchResponse> {
    const args = [...this.args, "search", query.text];

    if (query.projectId) {
      args.push(`--wing=${query.projectId}`);
    }

    const { stdout } = await this.runner(this.command, args);

    return {
      query: query.text,
      results: parseSearchOutput(stdout),
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
