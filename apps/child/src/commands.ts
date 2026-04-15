import { SlashCommandBuilder } from "discord.js";

import type { ChildConfig } from "./config.js";
import { isBedtime } from "./index.js";
import type { ChildMemoryStore } from "./memory.js";
import type { ProactiveScheduler } from "./proactive.js";

export type ChildSlashCommandName =
  | "child-status"
  | "child-remember"
  | "child-forget"
  | "child-wakeup";

export type CommandHandlerDeps = {
  config: ChildConfig;
  memory: ChildMemoryStore;
  proactive: ProactiveScheduler;
};

export function buildChildSlashCommands(): ReturnType<
  SlashCommandBuilder["toJSON"]
>[] {
  return [
    new SlashCommandBuilder()
      .setName("child-status")
      .setDescription("Check the child bot's current status.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("child-remember")
      .setDescription("Teach the child a new fact to remember.")
      .addStringOption((option) =>
        option
          .setName("fact")
          .setDescription("The fact to remember")
          .setRequired(true),
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("child-forget")
      .setDescription("Clear all facts from the child's memory.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("child-wakeup")
      .setDescription("Force the child to send a proactive message now.")
      .toJSON(),
  ];
}

export async function handleChildSlashCommand(
  name: ChildSlashCommandName,
  options: Record<string, string | undefined>,
  deps: CommandHandlerDeps,
): Promise<{ content: string; ephemeral: boolean }> {
  const { config, memory, proactive } = deps;

  switch (name) {
    case "child-status": {
      const turns = memory.loadConversations();
      const facts = memory.loadFacts();
      const sleeping = isBedtime({
        bedtimeHour: config.proactive.bedtimeHour,
        wakeupHour: config.proactive.wakeupHour,
      });

      return {
        content: [
          `**${config.persona.name}** (age ${config.persona.age})`,
          `Model: \`${config.ollama.model}\` @ ${config.ollama.baseUrl}`,
          `Memory: ${turns.length} conversation turns · ${facts.length} facts stored`,
          `Proactive: ${config.proactive.enabled ? "enabled" : "disabled"} (every ${Math.round(config.proactive.intervalMs / 60000)}min)`,
          `Status: ${sleeping ? "💤 bedtime" : "🌞 awake"}`,
        ].join("\n"),
        ephemeral: true,
      };
    }

    case "child-remember": {
      const fact = options["fact"];
      if (!fact) {
        return { content: "You need to tell me what to remember!", ephemeral: true };
      }
      await memory.addFact(fact, "manual");
      const acks = [
        `Okay Mom I'll remember that!! I wrote it down in my brain.`,
        `Got it!! "${fact}" — I won't forget, I promise!!`,
        `I'm remembering it right now. "${fact}". Did I do it right?`,
        `Okay okay okay I wrote it down. "${fact}". Is that right Mom?`,
      ];
      const ack = acks[Math.floor(Math.random() * acks.length)] ?? acks[0]!;
      return { content: ack, ephemeral: false };
    }

    case "child-forget": {
      const facts = memory.loadFacts();
      const count = facts.length;
      // Prune to 0 by setting max to 0
      await memory.pruneFacts(0);
      return {
        content: `Okay... I forgot ${count} thing${count === 1 ? "" : "s"}. My brain is empty now. 😶`,
        ephemeral: true,
      };
    }

    case "child-wakeup": {
      await proactive.fireOnce();
      return {
        content: "Woke the child up! A message should appear shortly.",
        ephemeral: true,
      };
    }

    default: {
      return { content: "Unknown command.", ephemeral: true };
    }
  }
}
