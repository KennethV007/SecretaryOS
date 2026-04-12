import assert from "node:assert/strict";
import test from "node:test";

import { captureReplayCase, createReplayStore } from "./index.js";

test("replay store captures cases", () => {
  const store = createReplayStore();
  const replayCase = store.addCase({
    name: "discord planning replay",
    category: "conversation",
    inputPayload: { channel: "discord" },
    expectedTraits: ["concise"],
  });

  assert.match(replayCase.id, /^replay_/);
  assert.equal(store.listCases().length, 1);
});

test("captureReplayCase returns normalized payload", () => {
  const replayCase = captureReplayCase({
    name: "task replay",
    category: "task",
    inputPayload: {},
    expectedTraits: [],
  });

  assert.equal(replayCase.name, "task replay");
});
