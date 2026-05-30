import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "./env.js";

const originalCwd = process.cwd();
const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
const originalGoogleKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
const tempDirs: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  restoreEnv("DEEPSEEK_API_KEY", originalDeepSeekKey);
  restoreEnv("GOOGLE_CLOUD_VISION_API_KEY", originalGoogleKey);
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadLocalEnv", () => {
  it("loads ignored local API credentials before the server is created", () => {
    const dir = mkdtempSync(join(tmpdir(), "correction-api-env-"));
    tempDirs.push(dir);
    process.chdir(dir);
    writeFileSync(".env", "DEEPSEEK_API_KEY='local-deepseek-key'\nGOOGLE_CLOUD_VISION_API_KEY=local-google-key\n");
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GOOGLE_CLOUD_VISION_API_KEY;

    loadLocalEnv();

    expect(process.env.DEEPSEEK_API_KEY).toBe("local-deepseek-key");
    expect(process.env.GOOGLE_CLOUD_VISION_API_KEY).toBe("local-google-key");
  });

  it("does not override environment variables already set by the shell", () => {
    const dir = mkdtempSync(join(tmpdir(), "correction-api-env-"));
    tempDirs.push(dir);
    process.chdir(dir);
    writeFileSync(".env", "DEEPSEEK_API_KEY=file-key\n");
    process.env.DEEPSEEK_API_KEY = "shell-key";

    loadLocalEnv();

    expect(process.env.DEEPSEEK_API_KEY).toBe("shell-key");
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
