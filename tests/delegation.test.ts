import assert from "node:assert/strict";
import test from "node:test";
import { checkDelegationLimits, isTerminalDelegatedTaskStatus } from "../src/delegation.ts";

test("clasifica estados terminales de delegación sin asumir éxito", () => {
  assert.equal(isTerminalDelegatedTaskStatus("succeeded"), true);
  assert.equal(isTerminalDelegatedTaskStatus("lost"), true);
  assert.equal(isTerminalDelegatedTaskStatus("running"), false);
});

test("aplica límites de profundidad y cantidad antes de crear un hijo", () => {
  assert.deepEqual(checkDelegationLimits(0, 1), { allowed: true });
  assert.match(checkDelegationLimits(0, 2).reason, /profundidad máxima/);
  assert.match(checkDelegationLimits(4, 1).reason, /cantidad máxima/);
});
