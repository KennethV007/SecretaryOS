import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import type { ClientUser } from "discord.js";

import type { DiscordApiClient, GatewayPersona } from "./api-client.js";

export class CharacterCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterCommandError";
  }
}

function getImageMimeType(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

export function buildCharacterChoices(personas: GatewayPersona[]) {
  return personas.slice(0, 25).map((persona) => ({
    name: persona.name.slice(0, 100),
    value: persona.id,
  }));
}

export function filterCharacterChoices(
  personas: GatewayPersona[],
  query: string,
): Array<{
  name: string;
  value: string;
}> {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? personas.filter((persona) => {
        const haystacks = [persona.name, persona.slug, persona.id].map(
          (value) => value.toLowerCase(),
        );

        return haystacks.some((value) => value.includes(normalizedQuery));
      })
    : personas;

  return buildCharacterChoices(filtered);
}

export async function personaAvatarToDataUri(
  persona: GatewayPersona,
): Promise<string> {
  if (!persona.profileImageFileName) {
    throw new CharacterCommandError(
      `Character '${persona.name}' does not have a profile image configured.`,
    );
  }

  const avatarPath = join(
    persona.packPath,
    "assets",
    persona.profileImageFileName,
  );

  let file: Buffer;
  try {
    file = await readFile(avatarPath);
  } catch (error) {
    throw new CharacterCommandError(
      `Avatar file is missing for '${persona.name}': ${avatarPath}`,
    );
  }

  return `data:${getImageMimeType(persona.profileImageFileName)};base64,${file.toString("base64")}`;
}

export async function switchGlobalCharacter(input: {
  apiClient: DiscordApiClient;
  clientUser: ClientUser | null;
  personaId: string;
}): Promise<GatewayPersona> {
  const personas = await input.apiClient.listPersonas();
  const persona = personas.find(
    (candidate) => candidate.id === input.personaId,
  );

  if (!persona) {
    throw new CharacterCommandError(
      `Character '${input.personaId}' was not found.`,
    );
  }

  if (!input.clientUser) {
    throw new CharacterCommandError("Discord client user is not ready yet.");
  }

  const avatar = await personaAvatarToDataUri(persona);

  try {
    await input.clientUser.edit({
      username: persona.name,
      avatar,
    });
  } catch (error) {
    throw new CharacterCommandError(
      `Discord profile update failed for '${persona.name}'.`,
    );
  }

  try {
    return await input.apiClient.setGlobalActivePersona(persona.id);
  } catch (error) {
    throw new CharacterCommandError(
      `Discord profile was updated, but persisting '${persona.name}' failed.`,
    );
  }
}
