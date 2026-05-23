function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  neonDatabaseUrl: required("NEON_DATABASE_URL"),
  openaiApiKey: required("OPENAI_API_KEY"),
  githubToken: required("GITHUB_TOKEN"),
  githubRepo: required("GITHUB_REPO"), // "owner/repo"
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
