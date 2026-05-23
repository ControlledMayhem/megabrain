/**
 * Simple YAML frontmatter parser for Obsidian notes.
 * Handles the --- delimited block at the top of .md files.
 */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, content: raw };
  }

  const yamlBlock = match[1];
  const content = match[2];
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Parse YAML arrays: [item1, item2] or - item
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, content };
}
