import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  TextChannel,
} from "discord.js";

import { loadChildConfig } from "./config.js";
import {
  type ChildSlashCommandName,
  buildChildSlashCommands,
  handleChildSlashCommand,
} from "./commands.js";
import {
  buildOllamaErrorReply,
  buildOllamaMessages,
  isAllowedUser,
  stripBotMention,
} from "./index.js";
import { createChildMemoryStore } from "./memory.js";
import { createOllamaClient } from "./ollama.js";
import { buildChildSystemPrompt } from "./persona.js";
import { createProactiveScheduler } from "./proactive.js";

const config = loadChildConfig();
const memory = createChildMemoryStore(config.memory.dir);
const ollamaClient = createOllamaClient(config.ollama);

const proactive = createProactiveScheduler({
  intervalMs: config.proactive.intervalMs,
  bedtimeHour: config.proactive.bedtimeHour,
  wakeupHour: config.proactive.wakeupHour,
  childName: config.persona.name,
  childAge: config.persona.age,
  onMessage: async (content: string) => {
    const channel = await client.channels.fetch(config.discord.channelId);
    if (channel instanceof TextChannel) {
      await channel.send(content);
    }
  },
  ollamaClient: config.proactive.useOllama ? ollamaClient : undefined,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discord.token);
  const body = buildChildSlashCommands();

  if (config.discord.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(
        config.discord.clientId,
        config.discord.guildId,
      ),
      { body },
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body,
    });
  }
}

client.once(Events.ClientReady, async () => {
  console.log(
    `[child] Logged in as ${client.user?.tag}. Persona: ${config.persona.name} (age ${config.persona.age}), model: ${config.ollama.model}`,
  );
  await registerSlashCommands();
  if (config.proactive.enabled) {
    proactive.start();
    console.log(
      `[child] Proactive scheduler started (interval: ${config.proactive.intervalMs}ms)`,
    );
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!isAllowedUser(message.author.id, config.discord.allowedUserIds)) return;
  if (
    message.channelId !== config.discord.channelId &&
    !message.channel.isDMBased()
  ) {
    return;
  }

  const userContent = stripBotMention(message.content);
  if (!userContent) return;

  const facts = memory.getFactsForContext();
  const systemPrompt = buildChildSystemPrompt({
    name: config.persona.name,
    age: config.persona.age,
    facts,
  });

  const recentTurns = memory.getRecentTurnsForContext(
    config.memory.conversationMaxTurns,
  );

  const ollamaMessages = buildOllamaMessages({
    systemPrompt,
    recentTurns,
    userMessage: userContent,
  });

  let reply: string;
  try {
    reply = await ollamaClient.chat(ollamaMessages);
  } catch (err) {
    console.error("[child] Ollama error:", err);
    reply = buildOllamaErrorReply(config.persona.name);
  }

  await Promise.all([
    memory.appendTurn({ role: "user", content: userContent }),
    memory.appendTurn({ role: "assistant", content: reply }),
  ]);

  await memory.pruneConversations(config.memory.conversationMaxTurns);

  await message.reply(reply);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!isAllowedUser(interaction.user.id, config.discord.allowedUserIds)) {
    await interaction.reply({
      content: "You are not allowed to use this bot.",
      ephemeral: true,
    });
    return;
  }

  const name = interaction.commandName as ChildSlashCommandName;
  const factOption = interaction.options.getString("fact") ?? undefined;

  const result = await handleChildSlashCommand(
    name,
    { fact: factOption },
    { config, memory, proactive },
  );

  await interaction.reply({
    content: result.content,
    ephemeral: result.ephemeral,
  });
});

process.on("SIGINT", () => {
  console.log("[child] Shutting down...");
  proactive.stop();
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[child] Shutting down...");
  proactive.stop();
  client.destroy();
  process.exit(0);
});

await client.login(config.discord.token);
