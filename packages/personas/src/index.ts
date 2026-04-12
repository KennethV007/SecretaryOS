import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { MemoryScope, Mode } from "@secretaryos/core";
import { createId } from "@secretaryos/core";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");
export const DEFAULT_PERSONA_PACK_ROOT = resolve(
  REPO_ROOT,
  "data",
  "persona-packs",
);
export const DEFAULT_ACTIVE_CHARACTER_PATH = resolve(
  REPO_ROOT,
  "data",
  "active-character.json",
);

export const DEFAULT_PERSONA_ID = "secretary-default";

export type PersonaAsset = {
  fileName: string;
  url: string;
};

export type PersonaDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  basePrompt: string;
  fullPrompt: string;
  definitionMarkdown: string;
  voice: string;
  traits: string[];
  formattingPreferences: string[];
  memoryScopePolicy: MemoryScope;
  enabled: boolean;
  profileImageFileName?: string;
  galleryImageFileNames: string[];
  packPath: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonaPackAssetInput = {
  fileName: string;
  data: Buffer;
};

export type PersonaPackInput = {
  slug: string;
  name: string;
  description?: string;
  basePrompt: string;
  fullPrompt: string;
  definitionMarkdown?: string;
  voice?: string;
  traits?: string[];
  formattingPreferences?: string[];
  memoryScopePolicy?: MemoryScope;
  enabled?: boolean;
  profileImage?: PersonaPackAssetInput;
  galleryImages?: PersonaPackAssetInput[];
};

export type PersonaCatalogOptions = {
  rootDir?: string;
};

export type ActiveCharacterStoreOptions = {
  filePath?: string;
};

function now(): string {
  return new Date().toISOString();
}

export function normalizePersonaSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensurePersonaRoot(rootDir: string): string {
  const normalized = resolve(rootDir);

  if (!existsSync(normalized)) {
    mkdirSync(normalized, { recursive: true });
  }

  return normalized;
}

function ensureActiveCharacterStore(filePath: string): string {
  const normalized = resolve(filePath);
  const parentDir = resolve(normalized, "..");

  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  return normalized;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildAssetUrl(slug: string, fileName: string): string {
  return `/personas/${slug}/assets/${encodeURIComponent(fileName)}`;
}

function createPersonaFromPack(options: {
  rootDir: string;
  slug: string;
  data: {
    id: string;
    slug: string;
    name: string;
    description: string;
    basePrompt: string;
    fullPrompt: string;
    definitionMarkdown: string;
    voice: string;
    traits: string[];
    formattingPreferences: string[];
    memoryScopePolicy: MemoryScope;
    enabled: boolean;
    profileImageFileName?: string;
    galleryImageFileNames: string[];
    createdAt: string;
    updatedAt: string;
  };
}): PersonaDefinition {
  const packPath = resolve(options.rootDir, options.slug);

  return {
    ...options.data,
    packPath,
  };
}

export function readPersonaPack(
  slug: string,
  options: PersonaCatalogOptions = {},
): PersonaDefinition | undefined {
  const rootDir = ensurePersonaRoot(
    options.rootDir ?? DEFAULT_PERSONA_PACK_ROOT,
  );
  const packDir = resolve(rootDir, slug);
  const jsonPath = join(packDir, "persona.json");

  if (!existsSync(jsonPath)) {
    return undefined;
  }

  const raw = readJsonFile<{
    id: string;
    slug: string;
    name: string;
    description?: string;
    basePrompt: string;
    fullPrompt: string;
    definitionMarkdown?: string;
    voice?: string;
    traits?: string[];
    formattingPreferences?: string[];
    memoryScopePolicy?: MemoryScope;
    enabled?: boolean;
    profileImageFileName?: string;
    galleryImageFileNames?: string[];
    createdAt?: string;
    updatedAt?: string;
  }>(jsonPath);

  const definitionMarkdownPath = join(packDir, "definition.md");
  const definitionMarkdown =
    raw.definitionMarkdown ??
    (existsSync(definitionMarkdownPath)
      ? readFileSync(definitionMarkdownPath, "utf8")
      : raw.fullPrompt);

  return createPersonaFromPack({
    rootDir,
    slug,
    data: {
      id: raw.id,
      slug: raw.slug,
      name: raw.name,
      description: raw.description ?? "",
      basePrompt: raw.basePrompt,
      fullPrompt: raw.fullPrompt,
      definitionMarkdown,
      voice: raw.voice ?? "",
      traits: raw.traits ?? [],
      formattingPreferences: raw.formattingPreferences ?? [],
      memoryScopePolicy: raw.memoryScopePolicy ?? "global",
      enabled: raw.enabled ?? true,
      profileImageFileName: raw.profileImageFileName,
      galleryImageFileNames: raw.galleryImageFileNames ?? [],
      createdAt: raw.createdAt ?? now(),
      updatedAt: raw.updatedAt ?? now(),
    },
  });
}

export function loadPersonaCatalog(
  options: PersonaCatalogOptions = {},
): PersonaDefinition[] {
  const rootDir = ensurePersonaRoot(
    options.rootDir ?? DEFAULT_PERSONA_PACK_ROOT,
  );

  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPersonaPack(entry.name, { rootDir }))
    .filter((persona): persona is PersonaDefinition => Boolean(persona))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function getDefaultPersona(
  personas: PersonaDefinition[] = PERSONAS,
  rootDir: string = DEFAULT_PERSONA_PACK_ROOT,
): PersonaDefinition {
  return (
    personas.find((persona) => persona.id === DEFAULT_PERSONA_ID) ??
    personas[0] ?? {
      id: DEFAULT_PERSONA_ID,
      slug: DEFAULT_PERSONA_ID,
      name: "Secretary Default",
      description: "",
      basePrompt: "Be concise, organized, and safe.",
      fullPrompt: "Be concise, organized, and safe.",
      definitionMarkdown: "Be concise, organized, and safe.",
      voice: "",
      traits: [],
      formattingPreferences: [],
      memoryScopePolicy: "global",
      enabled: true,
      galleryImageFileNames: [],
      packPath: resolve(rootDir, DEFAULT_PERSONA_ID),
      createdAt: now(),
      updatedAt: now(),
    }
  );
}

export function getPersonaProfileImagePath(
  persona: PersonaDefinition,
): string | undefined {
  if (!persona.profileImageFileName) {
    return undefined;
  }

  return resolve(persona.packPath, "assets", persona.profileImageFileName);
}

export function getActivePersona(
  personas: PersonaDefinition[] = PERSONAS,
  options: ActiveCharacterStoreOptions = {},
): PersonaDefinition {
  const storePath = resolve(options.filePath ?? DEFAULT_ACTIVE_CHARACTER_PATH);

  if (!existsSync(storePath)) {
    return getDefaultPersona(personas);
  }

  try {
    const raw = readJsonFile<{
      personaId?: string;
    }>(storePath);
    const activePersona = personas.find(
      (persona) => persona.id === raw.personaId,
    );

    return activePersona ?? getDefaultPersona(personas);
  } catch {
    return getDefaultPersona(personas);
  }
}

export function setActivePersona(
  personaId: string,
  personas: PersonaDefinition[] = PERSONAS,
  options: ActiveCharacterStoreOptions = {},
): PersonaDefinition {
  const persona =
    personas.find((candidate) => candidate.id === personaId) ??
    getDefaultPersona(personas);

  if (persona.id !== personaId) {
    throw new Error(`Persona '${personaId}' was not found.`);
  }

  const storePath = ensureActiveCharacterStore(
    options.filePath ?? DEFAULT_ACTIVE_CHARACTER_PATH,
  );

  writeJsonFile(storePath, {
    personaId: persona.id,
  });

  return persona;
}

export const getActiveCharacter = getActivePersona;
export const setActiveCharacter = setActivePersona;

export function resolvePersonaForMode(
  _mode: Mode,
  requestedPersonaId?: string,
  personas: PersonaDefinition[] = PERSONAS,
): PersonaDefinition {
  if (requestedPersonaId) {
    const requested = personas.find(
      (persona) => persona.id === requestedPersonaId,
    );

    if (requested) {
      return requested;
    }
  }

  return getDefaultPersona(personas);
}

export function getPersonaAssetPath(
  slug: string,
  fileName: string,
  options: PersonaCatalogOptions = {},
): string {
  const rootDir = ensurePersonaRoot(
    options.rootDir ?? DEFAULT_PERSONA_PACK_ROOT,
  );
  return resolve(rootDir, slug, "assets", sanitizeFileName(fileName));
}

export function listPersonaAssetUrls(
  persona: PersonaDefinition,
): PersonaAsset[] {
  const assets: PersonaAsset[] = [];

  if (persona.profileImageFileName) {
    assets.push({
      fileName: persona.profileImageFileName,
      url: buildAssetUrl(persona.slug, persona.profileImageFileName),
    });
  }

  for (const fileName of persona.galleryImageFileNames) {
    assets.push({
      fileName,
      url: buildAssetUrl(persona.slug, fileName),
    });
  }

  return assets;
}

export function savePersonaPack(
  input: PersonaPackInput,
  options: PersonaCatalogOptions = {},
): PersonaDefinition {
  const rootDir = ensurePersonaRoot(
    options.rootDir ?? DEFAULT_PERSONA_PACK_ROOT,
  );
  const slug = normalizePersonaSlug(input.slug);

  if (!slug) {
    throw new Error("Persona slug is required.");
  }

  const packDir = resolve(rootDir, slug);
  const jsonPath = join(packDir, "persona.json");

  if (existsSync(jsonPath)) {
    throw new Error(`Persona pack '${slug}' already exists.`);
  }

  mkdirSync(join(packDir, "assets"), { recursive: true });

  const createdAt = now();
  const updatedAt = createdAt;
  const id = createId("persona");
  const definitionMarkdown = input.definitionMarkdown ?? input.fullPrompt;

  let profileImageFileName: string | undefined;
  if (input.profileImage) {
    profileImageFileName = sanitizeFileName(input.profileImage.fileName);
    writeFileSync(
      join(packDir, "assets", profileImageFileName),
      input.profileImage.data,
    );
  }

  const galleryImageFileNames = (input.galleryImages ?? []).map(
    (asset, index) => {
      const originalName = sanitizeFileName(asset.fileName);
      const extension = originalName.includes(".")
        ? originalName.slice(originalName.lastIndexOf("."))
        : "";
      const fileName = `gallery-${index + 1}${extension}`;

      writeFileSync(join(packDir, "assets", fileName), asset.data);

      return fileName;
    },
  );

  writeJsonFile(jsonPath, {
    id,
    slug,
    name: input.name,
    description: input.description ?? "",
    basePrompt: input.basePrompt,
    fullPrompt: input.fullPrompt,
    definitionMarkdown,
    voice: input.voice ?? "",
    traits: input.traits ?? [],
    formattingPreferences: input.formattingPreferences ?? [],
    memoryScopePolicy: input.memoryScopePolicy ?? "global",
    enabled: input.enabled ?? true,
    profileImageFileName,
    galleryImageFileNames,
    createdAt,
    updatedAt,
  });

  writeFileSync(join(packDir, "definition.md"), definitionMarkdown, "utf8");

  const persona = readPersonaPack(slug, { rootDir });

  if (!persona) {
    throw new Error(`Failed to load persona pack '${slug}' after writing it.`);
  }

  return persona;
}

export function getPersonaById(
  personaId: string,
  personas: PersonaDefinition[] = PERSONAS,
): PersonaDefinition | undefined {
  return personas.find((persona) => persona.id === personaId);
}

export const PERSONAS = loadPersonaCatalog();
