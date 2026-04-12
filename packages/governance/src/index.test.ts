import assert from "node:assert/strict";
import test from "node:test";

import { classifyCandidate } from "./index.js";

test("governance marks routing changes as approval required", () => {
  const decision = classifyCandidate({
    id: "candidate_1",
    createdAt: new Date().toISOString(),
    type: "routing",
    title: "Change planner trigger",
    description: "Adjust planner trigger threshold",
    targetSurface: "routing",
    proposedBy: "critic",
    status: "proposed",
  });

  assert.equal(decision.approvalRequired, true);
});
