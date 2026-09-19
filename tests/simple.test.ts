import assert from "node:assert/strict";
import test from "node:test";
import { buildSimpleWorkflowPrompt, parseSimpleAgentResult, reviewChangedFiles } from "../src/simple.ts";
import { createTask } from "../src/task.ts";

test("parsea el resultado estructurado del workflow simple", () => {
  const result = parseSimpleAgentResult(`<HARNESS_RESULT>
summary: Cambié el literal del botón.
changed_files: src/button.ts
checks:
- [passed] npm test :: 12 tests passed
risks:
- none
route: simple
</HARNESS_RESULT>`);
  assert.equal(result?.summary, "Cambié el literal del botón.");
  assert.deepEqual(result?.changedFiles, ["src/button.ts"]);
  assert.equal(result?.checks[0].status, "passed");
  assert.deepEqual(result?.risks, []);
});

test("detecta archivos nuevos fuera del reporte del agente", () => {
  const review = reviewChangedFiles(
    { available: true, status: [" M README.md"], files: ["README.md"] },
    { available: true, status: [" M README.md", " M src/app.ts", "?? tmp.log"], files: ["README.md", "src/app.ts", "tmp.log"] },
    ["src/app.ts"],
  );
  assert.deepEqual(review.changedFiles, ["src/app.ts", "tmp.log"]);
  assert.deepEqual(review.unexpectedFiles, ["tmp.log"]);
});

test("el prompt del workflow simple exige revisión y reencaminamiento", () => {
  const task = createTask({ prompt: "Cambiar el texto del botón", cwd: ".", requestedMode: "simple", analyzeOnly: false });
  const prompt = buildSimpleWorkflowPrompt(task, { available: true, status: [], files: [] });
  assert.match(prompt, /Revisar diff/);
  assert.match(prompt, /HARNESS_RESULT/);
  assert.match(prompt, /reencaminar a sdd/);
});
