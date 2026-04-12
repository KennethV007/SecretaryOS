import assert from "node:assert/strict";
import test from "node:test";

import { detectIncident, proposeCandidate } from "./index.js";

test("detectIncident creates an incident payload", () => {
  const incident = detectIncident({
    category: "workflow",
    severity: "medium",
    summary: "Task required extra clarification",
  });

  assert.match(incident.id, /^incident_/);
});

test("proposeCandidate classifies promotion tier", () => {
  const candidate = proposeCandidate({
    type: "prompt",
    title: "Tighten planner prompt",
    description: "Reduce output verbosity",
    targetSurface: "planner_mode",
    proposedBy: "critic",
  });

  assert.equal(candidate.approvalRequired, true);
});
