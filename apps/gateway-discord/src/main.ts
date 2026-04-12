import {
  type AutocompleteInteraction,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import { createDiscordApiClient } from "./api-client.js";
import { filterCharacterChoices, switchGlobalCharacter } from "./character.js";
import { loadDiscordGatewayConfig } from "./config.js";
import {
  handleDiscordMessage,
  handleDiscordSlashCommand,
  isAllowedDiscordUser,
} from "./index.js";

const config = loadDiscordGatewayConfig();
const apiClient = createDiscordApiClient({
  apiBaseUrl: config.apiBaseUrl,
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

async function buildSlashCommands(): Promise<
  ReturnType<SlashCommandBuilder["toJSON"]>[]
> {
  return [
    new SlashCommandBuilder()
      .setName("mode")
      .setDescription("Set the active mode for this channel.")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Mode name")
          .setRequired(true)
          .addChoices(
            { name: "assistant", value: "assistant" },
            { name: "planner", value: "planner" },
            { name: "after_hours", value: "after_hours" },
          ),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("persona")
      .setDescription("Set the active persona for this channel.")
      .addStringOption((option) =>
        option
          .setName("persona")
          .setDescription("Persona id")
          .setRequired(true),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("character")
      .setDescription("Switch the bot's active global character.")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Character to switch to")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("usage")
      .setDescription("Show usage for a time window.")
      .addStringOption((option) =>
        option
          .setName("window")
          .setDescription("Usage window")
          .addChoices(
            { name: "today", value: "today" },
            { name: "week", value: "week" },
            { name: "all", value: "all" },
          ),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("approve")
      .setDescription("Approve a pending action.")
      .addStringOption((option) =>
        option
          .setName("approvalid")
          .setDescription("Approval id")
          .setRequired(true),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("deny")
      .setDescription("Deny a pending action.")
      .addStringOption((option) =>
        option
          .setName("approvalid")
          .setDescription("Approval id")
          .setRequired(true),
      )
      .toJSON(),
  ];
}

async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = await buildSlashCommands();

  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      {
        body,
      },
    );
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), {
    body,
  });
}

function getApprovalOption(
  interaction: ChatInputCommandInteraction,
): string | undefined {
  return interaction.options.getString("approvalid") ?? undefined;
}

async function handleCharacterInteraction(
  interaction: ChatInputCommandInteraction,
) {
  const personaId = interaction.options.getString("name", true);

  await interaction.deferReply({
    ephemeral: true,
  });

  try {
    const persona = await switchGlobalCharacter({
      apiClient,
      clientUser: interaction.client.user,
      personaId,
    });

    await interaction.editReply(
      `Global character switched to \`${persona.name}\`.`,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to switch the global character.";

    await interaction.editReply(message);
  }
}

async function handleCharacterAutocomplete(
  interaction: AutocompleteInteraction,
) {
  const focused = interaction.options.getFocused(true);

  if (interaction.commandName !== "character" || focused.name !== "name") {
    await interaction.respond([]);
    return;
  }

  const personas = await apiClient.listPersonas().catch(() => []);
  const choices = filterCharacterChoices(
    personas,
    typeof focused.value === "string" ? focused.value : "",
  );

  await interaction.respond(choices);
}

client.once(Events.ClientReady, async () => {
  await registerSlashCommands();
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    return;
  }

  if (!isAllowedDiscordUser(message.author.id, config.allowedUserIds)) {
    return;
  }

  const reply = await handleDiscordMessage(
    {
      channelId: message.channelId,
      guildId: message.guildId ?? undefined,
      authorId: message.author.id,
      messageId: message.id,
      content: message.content,
    },
    apiClient,
  );

  if (reply?.content) {
    await message.reply(reply.content);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (!isAllowedDiscordUser(interaction.user.id, config.allowedUserIds)) {
      await interaction.respond([]);
      return;
    }

    await handleCharacterAutocomplete(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (!isAllowedDiscordUser(interaction.user.id, config.allowedUserIds)) {
    await interaction.reply({
      content: "You are not allowed to use this gateway.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "character") {
    await handleCharacterInteraction(interaction);
    return;
  }

  const reply = await handleDiscordSlashCommand(
    {
      name: interaction.commandName as
        | "mode"
        | "persona"
        | "usage"
        | "approve"
        | "deny",
      channelId: interaction.channelId,
      guildId: interaction.guildId ?? undefined,
      userId: interaction.user.id,
      options: {
        mode: interaction.options.getString("mode") ?? undefined,
        persona: interaction.options.getString("persona") ?? undefined,
        window: interaction.options.getString("window") ?? undefined,
        approvalId: getApprovalOption(interaction),
      },
    },
    apiClient,
  );

  await interaction.reply({
    content: reply.content,
    ephemeral: reply.ephemeral ?? true,
  });
});

await client.login(config.token);
