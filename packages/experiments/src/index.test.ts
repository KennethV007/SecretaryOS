import assert from "node:assert/strict";
import test from "node:test";

import { compareExperimentResults } from "./index.js";

test("compareExperimentResults maps metrics", () => {
  const metrics = compareExperimentResults([
    { id: "r1", experimentId: "e1", metricName: "quality", metricValue: 0.9 },
  ]);

  assert.equal(metrics.quality, 0.9);
});
