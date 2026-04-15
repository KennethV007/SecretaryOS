import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type ConversationsFile = {
  schemaVersion: 1;
  turns: ConversationTurn[];
};

export type ChildFact = {
  id: string;
  content: string;
  learnedAt: string;
  source: "conversation" | "proactive" | "manual";
};

type FactsFile = {
  schemaVersion: 1;
  facts: ChildFact[];
};

export interface ChildMemoryStore {
  loadConversations(): ConversationTurn[];
  appendTurn(turn: Omit<ConversationTurn, "timestamp">): Promise<void>;
  pruneConversations(maxTurns: number): Promise<void>;
  loadFacts(): ChildFact[];
  addFact(
    content: string,
    source: ChildFact["source"],
  ): Promise<ChildFact>;
  pruneFacts(maxFacts: number): Promise<void>;
  getRecentTurnsForContext(limit: number): ConversationTurn[];
  getFactsForContext(): string[];
}

export function createChildMemoryStore(memoryDir: string): ChildMemoryStore {
  mkdirSync(memoryDir, { recursive: true });

  const conversationsPath = join(memoryDir, "conversations.json");
  const factsPath = join(memoryDir, "facts.json");

  function readConversations(): ConversationsFile {
    if (!existsSync(conversationsPath)) {
      return { schemaVersion: 1, turns: [] };
    }
    try {
      return JSON.parse(readFileSync(conversationsPath, "utf-8")) as ConversationsFile;
    } catch {
      return { schemaVersion: 1, turns: [] };
    }
  }

  function readFacts(): FactsFile {
    if (!existsSync(factsPath)) {
      return { schemaVersion: 1, facts: [] };
    }
    try {
      return JSON.parse(readFileSync(factsPath, "utf-8")) as FactsFile;
    } catch {
      return { schemaVersion: 1, facts: [] };
    }
  }

  async function saveConversations(data: ConversationsFile): Promise<void> {
    await writeFile(conversationsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async function saveFacts(data: FactsFile): Promise<void> {
    await writeFile(factsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    loadConversations(): ConversationTurn[] {
      return readConversations().turns;
    },

    async appendTurn(
      turn: Omit<ConversationTurn, "timestamp">,
    ): Promise<void> {
      const data = readConversations();
      data.turns.push({ ...turn, timestamp: new Date().toISOString() });
      await saveConversations(data);
    },

    async pruneConversations(maxTurns: number): Promise<void> {
      const data = readConversations();
      if (data.turns.length > maxTurns) {
        data.turns = data.turns.slice(data.turns.length - maxTurns);
        await saveConversations(data);
      }
    },

    loadFacts(): ChildFact[] {
      return readFacts().facts;
    },

    async addFact(
      content: string,
      source: ChildFact["source"],
    ): Promise<ChildFact> {
      const data = readFacts();
      const fact: ChildFact = {
        id: crypto.randomUUID(),
        content,
        learnedAt: new Date().toISOString(),
        source,
      };
      data.facts.push(fact);
      await saveFacts(data);
      return fact;
    },

    async pruneFacts(maxFacts: number): Promise<void> {
      const data = readFacts();
      if (data.facts.length > maxFacts) {
        data.facts = data.facts.slice(data.facts.length - maxFacts);
        await saveFacts(data);
      }
    },

    getRecentTurnsForContext(limit: number): ConversationTurn[] {
      const turns = readConversations().turns;
      return turns.slice(Math.max(0, turns.length - limit));
    },

    getFactsForContext(): string[] {
      return readFacts().facts.map((f) => f.content);
    },
  };
}
