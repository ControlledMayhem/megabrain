import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalFolderSource } from "../../src/vault/local.js";

let root: string;
let src: LocalFolderSource;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "mb-vault-test-"));
  src = new LocalFolderSource(root);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** Write a file under the vault root, creating parent dirs. */
async function seed(rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

test("list() returns .md files as POSIX relative paths, skipping dotdirs and non-md", async () => {
  await seed("note.md", "# a");
  await seed("sub/deep.md", "# b");
  await seed("notes.txt", "ignore me");
  await seed(".obsidian/workspace.json", "{}");
  await seed(".git/config", "x");

  const files = await src.list();
  const paths = files.map((f) => f.path).sort();

  assert.deepEqual(paths, ["note.md", "sub/deep.md"]);
  assert.ok(files.every((f) => f.lastModified instanceof Date));
});

test("list() returns [] when the root folder does not exist", async () => {
  const missing = new LocalFolderSource(path.join(root, "does-not-exist"));
  assert.deepEqual(await missing.list(), []);
});

test("read() returns file content and rejects for a missing file", async () => {
  await seed("a.md", "hello world");
  assert.equal(await src.read("a.md"), "hello world");
  await assert.rejects(() => src.read("missing.md"));
});

test("write() creates nested directories and overwrites existing files", async () => {
  await src.write("inbox/new.md", "v1");
  assert.equal(await src.read("inbox/new.md"), "v1");

  await src.write("inbox/new.md", "v2");
  assert.equal(await src.read("inbox/new.md"), "v2");
});

test("delete() removes the file and is idempotent (no throw on missing)", async () => {
  await src.write("x.md", "x");
  await src.delete("x.md");
  await assert.rejects(() => src.read("x.md"));
  await src.delete("x.md"); // second delete must not throw
});

test("read/write/delete reject paths that escape the vault root", async () => {
  await assert.rejects(() => src.read("../escape.md"), /escapes vault root/);
  await assert.rejects(() => src.write("../escape.md", "x"), /escapes vault root/);
  await assert.rejects(() => src.delete("../../escape.md"), /escapes vault root/);
});

test("changedFiles() returns all paths with no argument", async () => {
  await seed("a.md", "a");
  await seed("b/c.md", "c");
  const { changed, removed } = await src.changedFiles();
  assert.deepEqual(changed.sort(), ["a.md", "b/c.md"]);
  assert.deepEqual(removed, []);
});

test("changedFiles(since) returns only files modified after the cutoff", async () => {
  await seed("old.md", "old");
  const past = new Date(Date.now() - 60_000);
  await fs.utimes(path.join(root, "old.md"), past, past);

  await seed("new.md", "new"); // mtime ~ now

  const cutoff = new Date(Date.now() - 30_000);
  const { changed, removed } = await src.changedFiles(cutoff);

  assert.deepEqual(changed, ["new.md"]);
  assert.deepEqual(removed, []);
});
