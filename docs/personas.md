# Personas

## Concept
Modes define operational behavior. Personas define style and identity. Persona selection must never weaken safety or override workflow controls.

Modes do not own personas. A persona is the character; the mode chooses which prompt variant to use for that character.

Prompt behavior:
- `assistant` uses the persona's watered-down base prompt plus the assistant mode instruction.
- `planner` uses the same watered-down base prompt plus the planner mode instruction.
- `after_hours` uses the full persona prompt.

## Persona structure
Each persona definition should include:
- stable id
- display name
- short base prompt for assistant/planner
- full character prompt for after-hours
- voice and style rules
- traits
- formatting preferences
- memory scope policy
- optional profile image and gallery images
- optional markdown definition source

## Rules
- Personas are swappable at runtime.
- Personas do not change approval logic.
- After-hours personas use isolated memory scope by default.
- Persona packs belong in `data/persona-packs/`.
- The dashboard is allowed to create persona packs and upload their assets.

## Initial persona set
- `secretary-default`: organized, direct, efficient
- `planner-analyst`: structured, high-signal, architecture-first
- `after-hours-companion`: conversational, immersive, non-operational by default
