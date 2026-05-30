import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnv(): void {
  for (const filePath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "services/api/.env")]) {
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed || process.env[parsed.key] !== undefined) continue;
      process.env[parsed.key] = parsed.value;
    }
  }
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const index = trimmed.indexOf("=");
  if (index <= 0) return undefined;

  const key = trimmed.slice(0, index).trim();
  const rawValue = trimmed.slice(index + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;
  return { key, value: unquoteEnvValue(rawValue) };
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
