import { readFileSync, existsSync } from "node:fs";
import { runVerification } from "./phase2c-verify.mjs";

if (existsSync(".env.phase2c")) {
  const envText = readFileSync(".env.phase2c", "utf8");
  for (const line of envText.split("\n")) {
    const match = line.match(/^\s*([^#][^=]*)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

process.env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
process.env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

try {
  const { exitCode } = await runVerification();
  process.exit(exitCode);
} catch (e) {
  console.error("Verification failed:", e);
  process.exit(1);
}
