import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _constitution: string | null = null;

export function getConstitution(): string {
  if (_constitution) return _constitution;

  const path = resolve(__dirname, "../../../admin_constitution.md");
  try {
    _constitution = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(
      `admin_constitution.md not found at ${path} — every admin prompt depends on it`,
      { cause: err }
    );
  }

  return _constitution;
}

export function buildAdminPrompt(
  rolePrompt: string,
  includeConstitution = true
): string {
  if (!includeConstitution) return rolePrompt;

  return `# Epistemic Graph Administrator Constitution

${getConstitution()}

---

# Your Specific Role

${rolePrompt}`;
}
