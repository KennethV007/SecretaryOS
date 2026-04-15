export type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OllamaChatRequest = {
  model: string;
  messages: OllamaMessage[];
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
};

type OllamaChatResponse = {
  message: {
    role: "assistant";
    content: string;
  };
  done: boolean;
};

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export interface OllamaClient {
  chat(messages: OllamaMessage[]): Promise<string>;
}

export function createOllamaClient(config: {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}): OllamaClient {
  return {
    async chat(messages: OllamaMessage[]): Promise<string> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);

      const body: OllamaChatRequest = {
        model: config.model,
        messages,
        stream: false,
        options: {
          temperature: 0.85,
          num_predict: 256,
        },
      };

      let response: Response;
      try {
        response = await fetch(`${config.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const message =
          err instanceof Error && err.name === "AbortError"
            ? `Ollama request timed out after ${config.timeoutMs}ms`
            : `Ollama network error: ${err instanceof Error ? err.message : String(err)}`;
        throw new OllamaError(message);
      }

      clearTimeout(timer);

      if (!response.ok) {
        const snippet = await response.text().catch(() => "");
        throw new OllamaError(
          `Ollama returned HTTP ${response.status}: ${snippet.slice(0, 200)}`,
          response.status,
        );
      }

      let data: OllamaChatResponse;
      try {
        data = (await response.json()) as OllamaChatResponse;
      } catch {
        throw new OllamaError("Ollama returned malformed JSON");
      }

      if (!data.message?.content) {
        throw new OllamaError("Ollama response missing message content");
      }

      return data.message.content;
    },
  };
}
