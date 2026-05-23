import { Octokit } from "octokit";
import { config } from "./config.js";

const octokit = new Octokit({ auth: config.githubToken });

const owner = config.githubOwner;
const repo = config.githubRepoName;

export interface VaultFile {
  path: string;
  sha: string;
  lastModified: Date;
}

/**
 * List all .md files in the vault repo with their last commit date.
 */
export async function listVaultFiles(): Promise<VaultFile[]> {
  const files: VaultFile[] = [];

  // Get the full file tree
  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: "HEAD",
    recursive: "true",
  });

  const mdFiles = tree.tree.filter(
    (item) => item.type === "blob" && item.path?.endsWith(".md")
  );

  // Get last commit date for each file (batch via commits API)
  for (const file of mdFiles) {
    if (!file.path || !file.sha) continue;

    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      path: file.path,
      per_page: 1,
    });

    const lastModified = commits[0]?.commit?.committer?.date
      ? new Date(commits[0].commit.committer.date)
      : new Date();

    files.push({
      path: file.path,
      sha: file.sha,
      lastModified,
    });
  }

  return files;
}

/**
 * Get the content of a file from the vault repo.
 */
export async function getFileContent(path: string): Promise<string> {
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  });

  if ("content" in data && data.content) {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  throw new Error(`Could not read file: ${path}`);
}

/**
 * Create or update a file in the vault repo.
 */
export async function writeFile(
  path: string,
  content: string,
  message: string
): Promise<void> {
  // Check if file exists to get its SHA
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if ("sha" in data) sha = data.sha;
  } catch {
    // File doesn't exist yet, that's fine
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha,
  });
}

/**
 * Delete a file from the vault repo.
 */
export async function deleteFile(path: string, message: string): Promise<void> {
  const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
  if (!("sha" in data)) throw new Error(`File not found: ${path}`);

  await octokit.rest.repos.deleteFile({
    owner,
    repo,
    path,
    message,
    sha: data.sha,
  });
}

/**
 * Get files changed in a push event (from webhook payload).
 */
export function getChangedFiles(payload: {
  commits?: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>;
}): { changed: string[]; removed: string[] } {
  const changed = new Set<string>();
  const removed = new Set<string>();

  for (const commit of payload.commits ?? []) {
    for (const f of commit.added ?? []) if (f.endsWith(".md")) changed.add(f);
    for (const f of commit.modified ?? []) if (f.endsWith(".md")) changed.add(f);
    for (const f of commit.removed ?? []) if (f.endsWith(".md")) removed.add(f);
  }

  // If a file was both changed and removed, only remove
  for (const f of removed) changed.delete(f);

  return { changed: [...changed], removed: [...removed] };
}
