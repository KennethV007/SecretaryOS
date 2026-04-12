import type {
  ImprovementCandidate,
  PolicySurface,
  PromotionTier,
  PromptSurface,
} from "@secretaryos/core";

const lockedSurfaces = new Set<PolicySurface>([
  "routing",
  "memory",
  "workflow",
]);
const approvalSurfaces = new Set<PromptSurface>([
  "system",
  "assistant_mode",
  "planner_mode",
  "after_hours_mode",
  "workflow",
  "memory_injection",
]);

export function getPromotionTier(surface: string): PromotionTier {
  if (surface === "auth" || surface === "secrets") {
    return "locked";
  }

  if (lockedSurfaces.has(surface as PolicySurface)) {
    return "approval_required";
  }

  return "auto_adopt";
}

export function requiresApprovalForPromotion(surface: string): boolean {
  return (
    approvalSurfaces.has(surface as PromptSurface) ||
    lockedSurfaces.has(surface as PolicySurface)
  );
}

export function classifyCandidate(candidate: ImprovementCandidate): {
  tier: PromotionTier;
  approvalRequired: boolean;
} {
  const tier = getPromotionTier(candidate.targetSurface);
  return {
    tier,
    approvalRequired:
      tier !== "auto_adopt" ||
      requiresApprovalForPromotion(candidate.targetSurface),
  };
}
