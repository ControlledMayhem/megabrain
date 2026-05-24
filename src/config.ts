import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Which driver backs the vault. "local" (default) reads a folder of Markdown on
// disk; "github" reads/writes a GitHub repo. GitHub vars are only required when
// the github driver is selected, so the app boots with no GitHub vars in local mode.
const vaultSource = (process.env.VAULT_SOURCE ?? "local").toLowerCase();
const isGithub = vaultSource === "github";

export const config = {
  neonDatabaseUrl: required("NEON_DATABASE_URL"),
  openaiApiKey: required("OPENAI_API_KEY"),

  // --- Vault source ---
  vaultSource: isGithub ? "github" : "local",
  // Local driver: folder of Markdown on disk. Defaults to ./vault.
  vaultPath: path.resolve(process.env.MEGABRAIN_VAULT_PATH ?? "vault"),

  // --- GitHub (only required when VAULT_SOURCE=github) ---
  githubToken: isGithub ? required("GITHUB_TOKEN") : (process.env.GITHUB_TOKEN ?? ""),
  githubRepo: isGithub ? required("GITHUB_REPO") : (process.env.GITHUB_REPO ?? ""), // "owner/repo"
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",

  apiKey: process.env.API_KEY ?? "",
  port: parseInt(process.env.PORT ?? "3000", 10),
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, ""),

  get githubOwner() {
    return this.githubRepo.split("/")[0];
  },
  get githubRepoName() {
    return this.githubRepo.split("/")[1];
  },
} as const;
