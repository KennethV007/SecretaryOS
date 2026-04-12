import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { DiscordApiClient, GatewayPersona } from "./api-client.js";
import {
  CharacterCommandError,
  buildCharacterChoices,
  filterCharacterChoices,
  personaAvatarToDataUri,
  switchGlobalCharacter,
} from "./character.js";

function createPersona(rootDir: string): GatewayPersona {
  const packPath = join(rootDir, "night-operator");
  mkdirSync(join(packPath, "assets"), { recursive: true });
  writeFileSync(join(packPath, "assets", "avatar.png"), Buffer.from("avatar"));

  return {
    id: "persona_night_operator",
    slug: "night-operator",
    name: "Night Operator",
    packPath,
    profileImageFileName: "avatar.png",
  };
}

function createApiClient(persona: GatewayPersona): DiscordApiClient {
  return {
    async ensureSession() {
      throw new Error("not used");
    },
    async sendMessage() {
      throw new Error("not used");
    },
    async listPersonas() {
      return [persona];
    },
    async getGlobalActivePersona() {
      return persona;
    },
    async setGlobalActivePersona() {
      return persona;
    },
    async setActivePersona() {
      throw new Error("not used");
    },
    async getUsageSummary() {
      throw new Error("not used");
    },
    async resolveApproval() {
      throw new Error("not used");
    },
  };
}

test("buildCharacterChoices truncates to the Discord choice limit", () => {
  const choices = buildCharacterChoices(
    Array.from({ length: 30 }, (_, index) => ({
      id: `persona_${index}`,
      slug: `persona-${index}`,
      name: `Persona ${index}`,
      packPath: `/tmp/persona-${index}`,
      profileImageFileName: "avatar.png",
    })),
  );

  assert.equal(choices.length, 25);
  assert.deepEqual(choices[0], {
    name: "Persona 0",
    value: "persona_0",
  });
});

test("filterCharacterChoices matches against name, slug, and id", () => {
  const choices = filterCharacterChoices(
    [
      {
        id: "persona_night_operator",
        slug: "night-operator",
        name: "Night Operator",
        packPath: "/tmp/night-operator",
        profileImageFileName: "avatar.png",
      },
      {
        id: "persona_secretary_default",
        slug: "secretary-default",
        name: "Secretary Default",
        packPath: "/tmp/secretary-default",
        profileImageFileName: "avatar.png",
      },
    ],
    "night",
  );

  assert.deepEqual(choices, [
    {
      name: "Night Operator",
      value: "persona_night_operator",
    },
  ]);
});

test("personaAvatarToDataUri reads the persona pack profile image", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-discord-character-"));
  const persona = createPersona(rootDir);

  const dataUri = await personaAvatarToDataUri(persona);

  assert.match(dataUri, /^data:image\/png;base64,/);
});

test("switchGlobalCharacter updates Discord first and then persists state", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-discord-character-"));
  const persona = createPersona(rootDir);
  const edits: Array<{ username?: string; avatar?: string }> = [];

  const result = await switchGlobalCharacter({
    apiClient: createApiClient(persona),
    clientUser: {
      edit(payload: { username?: string; avatar?: string }) {
        edits.push(payload);
        return Promise.resolve(this);
      },
    } as never,
    personaId: persona.id,
  });

  assert.equal(result.id, persona.id);
  assert.equal(edits.length, 1);
  assert.equal(edits[0]?.username, "Night Operator");
  assert.match(edits[0]?.avatar ?? "", /^data:image\/png;base64,/);
});

test("switchGlobalCharacter fails helpfully when the profile image is missing", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-discord-character-"));
  const persona: GatewayPersona = {
    id: "persona_missing",
    slug: "missing",
    name: "Missing",
    packPath: join(rootDir, "missing"),
    profileImageFileName: "avatar.png",
  };

  await assert.rejects(
    switchGlobalCharacter({
      apiClient: createApiClient(persona),
      clientUser: {
        edit() {
          return Promise.resolve(this);
        },
      } as never,
      personaId: persona.id,
    }),
    (error: unknown) =>
      error instanceof CharacterCommandError &&
      /Avatar file is missing/.test(error.message),
  );
});
