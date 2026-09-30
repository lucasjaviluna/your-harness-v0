import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--experimental-transform-types", "--test", "tests/e2e.test.ts"], {
  env: { ...process.env, PI_HARNESS_E2E_REQUIRE_INSTALL: "1" },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
