import assert from "node:assert/strict";
import test from "node:test";

import { createEvalRun, scoreEvalRun } from "./index.js";

test("scoreEvalRun stays in range", () => {
  const score = scoreEvalRun({
    passed: true,
    retries: 1,
    toolErrors: 1,
    latencyMs: 2000,
    memoryUsefulness: 2,
  });

  assert.ok(score >= 0 && score <= 1);
});

test("createEvalRun generates ids", () => {
  const run = createEvalRun({
    evalName: "planner-quality",
    score: 0.9,
    passed: true,
  });

  assert.match(run.id, /^eval_/);
});
