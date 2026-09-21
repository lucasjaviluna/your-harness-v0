import assert from "node:assert/strict";
import test from "node:test";
import { buildPiArgs, helpText, parseCliArgs } from "../bin/yh-pi.js";

test("parsea opciones de yh-pi y conserva opciones de Pi tras --", () => {
  assert.deepEqual(parseCliArgs(["--profile", "product-owner", "--mode", "task", "--", "--print"]), {
    mode: "task", profile: "product-owner", passthrough: ["--print"], help: false, version: false,
  });
});

test("rechaza modos y perfiles inválidos", () => {
  assert.throws(() => parseCliArgs(["--mode", "unknown"]), /Modo inválido/);
  assert.throws(() => parseCliArgs(["--profile", "unknown"]), /Perfil inválido/);
});

test("construye el arranque de Pi con la extensión de harness", () => {
  const options = parseCliArgs(["--", "--no-tools"]);
  assert.deepEqual(buildPiArgs(options, "C:/pkg/extensions/harness.ts"), ["-e", "C:/pkg/extensions/harness.ts", "--no-tools"]);
  assert.match(helpText(), /yh-pi/);
});
