import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_PERSONA_ID,
  getActivePersona,
  getPersonaProfileImagePath,
  loadPersonaCatalog,
  resolvePersonaForMode,
  savePersonaPack,
  setActivePersona,
} from "./index.js";

test("resolvePersonaForMode keeps the default persona regardless of mode", () => {
  const personas = [
    {
      id: DEFAULT_PERSONA_ID,
      slug: DEFAULT_PERSONA_ID,
      name: "Secretary Default",
      description: "",
      basePrompt: "Default base prompt.",
      fullPrompt: "Default full prompt.",
      definitionMarkdown: "Default full prompt.",
      voice: "",
      traits: [],
      formattingPreferences: [],
      memoryScopePolicy: "global" as const,
      enabled: true,
      galleryImageFileNames: [],
      packPath: "/tmp/secretary-default",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    },
  ];

  assert.equal(
    resolvePersonaForMode("planner", undefined, personas).id,
    DEFAULT_PERSONA_ID,
  );
  assert.equal(
    resolvePersonaForMode("after_hours", undefined, personas).id,
    DEFAULT_PERSONA_ID,
  );
});

test("savePersonaPack writes a pack that loadPersonaCatalog can read back", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-persona-pack-"));

  try {
    const persona = savePersonaPack(
      {
        slug: "night-operator",
        name: "Night Operator",
        description: "Calm late-night persona.",
        basePrompt: "Use a calm, concise tone.",
        fullPrompt: "Use a calm, immersive tone.",
        definitionMarkdown: "# Night Operator",
        traits: ["calm"],
        formattingPreferences: ["concise"],
      },
      {
        rootDir,
      },
    );

    const catalog = loadPersonaCatalog({ rootDir });

    assert.equal(persona.slug, "night-operator");
    assert.equal(catalog[0]?.slug, "night-operator");
    assert.match(catalog[0]?.definitionMarkdown ?? "", /Night Operator/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("active persona store persists the selected persona", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-persona-pack-"));
  const storePath = join(rootDir, "active-character.json");

  try {
    const persona = savePersonaPack(
      {
        slug: "night-operator",
        name: "Night Operator",
        description: "Calm late-night persona.",
        basePrompt: "Use a calm, concise tone.",
        fullPrompt: "Use a calm, immersive tone.",
        definitionMarkdown: "# Night Operator",
      },
      {
        rootDir,
      },
    );
    const personas = loadPersonaCatalog({ rootDir });

    const activePersona = setActivePersona(persona.id, personas, {
      filePath: storePath,
    });

    assert.equal(activePersona.id, persona.id);
    assert.equal(
      getActivePersona(personas, {
        filePath: storePath,
      }).id,
      persona.id,
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("getPersonaProfileImagePath returns the saved profile image path", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-persona-pack-"));

  try {
    const persona = savePersonaPack(
      {
        slug: "night-operator",
        name: "Night Operator",
        description: "Calm late-night persona.",
        basePrompt: "Use a calm, concise tone.",
        fullPrompt: "Use a calm, immersive tone.",
        definitionMarkdown: "# Night Operator",
        profileImage: {
          fileName: "avatar.png",
          data: Buffer.from("avatar"),
        },
      },
      {
        rootDir,
      },
    );

    assert.match(getPersonaProfileImagePath(persona) ?? "", /avatar\.png$/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
