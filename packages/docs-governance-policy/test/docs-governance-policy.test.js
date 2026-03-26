import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectInScopeMarkdownFiles,
  deriveTraversalRoots,
  listRepositoryFiles,
} from "../src/index.js";

test("deriveTraversalRoots narrows traversal to static policy prefixes", () => {
  const roots = deriveTraversalRoots({
    in_scope_paths: ["docs/**", "docs/INDEX.md", "docs/guides/*.md"],
  });

  assert.deepEqual(roots, ["docs"]);
});

test("collectInScopeMarkdownFiles avoids traversing unrelated repo trees", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "docs-governance-policy-"));
  mkdirSync(join(repoDir, "docs"), { recursive: true });
  mkdirSync(join(repoDir, ".hatch", "logs"), { recursive: true });
  writeFileSync(join(repoDir, "docs", "INDEX.md"), "# Docs\n");
  writeFileSync(join(repoDir, ".hatch", "logs", "run.md"), "# Ignore me\n");

  const policy = {
    in_scope_paths: ["docs/**"],
    frontmatter_exclude_globs: [],
  };

  assert.deepEqual(collectInScopeMarkdownFiles(repoDir, policy), ["docs/INDEX.md"]);
  assert.deepEqual(listRepositoryFiles(repoDir, { roots: deriveTraversalRoots(policy) }), [
    "docs/INDEX.md",
  ]);
});

test("collectInScopeMarkdownFiles supports exact file scope paths", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "docs-governance-policy-file-"));
  mkdirSync(join(repoDir, "docs"), { recursive: true });
  writeFileSync(join(repoDir, "docs", "INDEX.md"), "# Index\n");
  writeFileSync(join(repoDir, "docs", "guide.md"), "# Guide\n");

  const policy = {
    in_scope_paths: ["docs/INDEX.md"],
    frontmatter_exclude_globs: [],
  };

  assert.deepEqual(collectInScopeMarkdownFiles(repoDir, policy), ["docs/INDEX.md"]);
});
