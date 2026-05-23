function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Parse "name:key,name:key,..." into structured entries. Bare keys get a numbered name. */
function parseApiKeys(raw: string): { name: string; key: string }[] {
  let anon = 0;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.indexOf(":");
      if (i === -1) {
        anon += 1;
        return { name: anon === 1 ? "user" : `user-${anon}`, key: entry };
      }
      return { name: entry.slice(0, i), key: entry.slice(i + 1) };
    });
}

// API_KEYS format: "andrea:abc123,bob:def456"  (multi-user)
// API_KEY format:  "abc123"                    (legacy single-user, becomes "default:abc123")
const _rawKeys = [
  process.env.API_KEYS ?? "",
  process.env.API_KEY ? `default:${process.env.API_KEY}` : "",
].join(",");

export const config = {
  neonDatabaseUrl: required("NEON_DATABASE_URL"),
  openaiApiKey: required("OPENAI_API_KEY"),
  githubToken: required("GITHUB_TOKEN"),
  githubRepo: required("GITHUB_REPO"), // "owner/repo"
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
  /** All configured API keys with their owner names. Empty array = auth disabled (dev). */
  apiKeys: parseApiKeys(_rawKeys),
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  port: parseInt(process.env.PORT ?? "3000", 10),

  get githubOwner() { return this.githubRepo.split("/")[0]; },
  get githubRepoName() { return this.githubRepo.split("/")[1]; },
};
