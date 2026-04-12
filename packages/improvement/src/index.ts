import {
  type ImprovementCandidate,
  type SystemIncident,
  createId,
} from "@secretaryos/core";
import { classifyCandidate } from "@secretaryos/governance";

export function detectIncident(input: {
  taskId?: string;
  category: string;
  severity: SystemIncident["severity"];
  summary: string;
  rootCauseGuess?: string;
}): SystemIncident {
  return {
    id: createId("incident"),
    createdAt: new Date().toISOString(),
    ...input,
  };
}

export function proposeCandidate(input: {
  type: string;
  title: string;
  description: string;
  targetSurface: string;
  proposedBy: string;
}): ImprovementCandidate & {
  tier: ReturnType<typeof classifyCandidate>["tier"];
  approvalRequired: boolean;
} {
  const candidate: ImprovementCandidate = {
    id: createId("candidate"),
    createdAt: new Date().toISOString(),
    status: "proposed",
    ...input,
  };

  const decision = classifyCandidate(candidate);

  return {
    ...candidate,
    ...decision,
  };
}
