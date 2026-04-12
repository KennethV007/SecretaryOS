import type { Mode, PromptSurface } from "@secretaryos/core";
import type { PersonaDefinition } from "@secretaryos/personas";

export function buildModeInstruction(mode: Mode): string {
  switch (mode) {
    case "planner":
      return "Use the watered-down persona prompt, then sharpen it for structured planning and clear decomposition.";
    case "after_hours":
      return "Use the full persona prompt and preserve after-hours memory isolation.";
    default:
      return "Use the watered-down persona prompt and act as the default operational assistant with concise, safe execution.";
  }
}

export function buildPersonaPrompt(
  persona: PersonaDefinition,
  mode: Mode,
): string {
  if (mode === "after_hours") {
    return persona.fullPrompt.trim();
  }

  return [persona.basePrompt.trim(), buildModeInstruction(mode)]
    .filter(Boolean)
    .join("\n\n");
}

export function buildPromptSurfaceLabel(surface: PromptSurface): string {
  switch (surface) {
    case "system":
      return "System";
    case "assistant_mode":
      return "Assistant mode";
    case "planner_mode":
      return "Planner mode";
    case "after_hours_mode":
      return "After hours mode";
    case "workflow":
      return "Workflow";
    case "memory_injection":
      return "Memory injection";
  }
}
