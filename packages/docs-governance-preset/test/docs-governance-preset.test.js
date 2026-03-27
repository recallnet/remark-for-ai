import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDocsGovernanceConfig,
  initDocsGovernanceRepo,
  lintDocsGovernance,
} from "../src/index.js";

const cliPath = new URL("../src/cli.js", import.meta.url);

function initLintRepo() {
  const repoDir = mkdtempSync(join(tmpdir(), "docs-governance-lint-"));
  mkdirSync(join(repoDir, "docs"), { recursive: true });
  writeFileSync(
    join(repoDir, "package.json"),
    JSON.stringify({ name: "fixture", private: true, scripts: {} }, null, 2)
  );
  initDocsGovernanceRepo({ cwd: repoDir, today: "2026-03-25" });
  return repoDir;
}

function installFakeRemark(repoDir, scriptSource) {
  const binDir = join(repoDir, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  const binaryPath = join(binDir, "remark");
  writeFileSync(binaryPath, scriptSource, "utf8");
  chmodSync(binaryPath, 0o755);
  return binaryPath;
}

test("createDocsGovernanceConfig wires the expected plugin stack", () => {
  const config = createDocsGovernanceConfig();

  assert.equal(Array.isArray(config.plugins), true);
  assert.equal(config.plugins.length, 5);
});

test("initDocsGovernanceRepo writes default files and package scripts", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "docs-governance-preset-"));
  mkdirSync(join(repoDir, "docs"), { recursive: true });
  writeFileSync(
    join(repoDir, "package.json"),
    JSON.stringify({ name: "fixture", private: true, scripts: {} }, null, 2)
  );

  const result = initDocsGovernanceRepo({ cwd: repoDir, today: "2026-03-25" });

  assert.match(readFileSync(join(repoDir, ".remarkrc.mjs"), "utf8"), /createDocsGovernanceConfig/);
  assert.match(readFileSync(join(repoDir, "docs", "INDEX.md"), "utf8"), /reviewed: 2026-03-25/);
  assert.match(
    readFileSync(join(repoDir, "docs", "docs-frontmatter.schema.json"), "utf8"),
    /"\$schema": "http:\/\/json-schema.org\/draft-07\/schema#"/
  );
  assert.match(
    readFileSync(join(repoDir, "package.json"), "utf8"),
    /"docs:lint": "recall-docs-governance lint"/
  );
  assert.equal(result.created.includes("docs/docs-policy.json"), true);
});

test("lintDocsGovernance does not depend on remark-cli/package.json exports", () => {
  const repoDir = initLintRepo();
  writeFileSync(
    join(repoDir, "docs", "docs-policy.json"),
    JSON.stringify(
      {
        "docs_policy/v1": {
          in_scope_paths: [],
        },
      },
      null,
      2
    )
  );

  const result = lintDocsGovernance({ cwd: repoDir });

  assert.deepEqual(result, { status: 0, files: [] });
});

test("lintDocsGovernance --changed ignores non-doc git changes", () => {
  const repoDir = initLintRepo();
  writeFileSync(
    join(repoDir, "docs", "keep.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Keep\n"
  );
  writeFileSync(
    join(repoDir, "docs", "skip.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Skip\n"
  );

  execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoDir,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "."], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir, stdio: "ignore" });

  writeFileSync(
    join(repoDir, "package.json"),
    JSON.stringify({ name: "fixture", private: true, scripts: { test: "node --test" } }, null, 2)
  );

  const result = lintDocsGovernance({ cwd: repoDir, changed: true });

  assert.deepEqual(result, { status: 0, files: [] });
});

test("lintDocsGovernance --changed uses staged git diff by default", () => {
  const repoDir = initLintRepo();
  const argvPath = join(repoDir, "remark-argv.json");
  installFakeRemark(
    repoDir,
    `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(process.argv.slice(2)));
`
  );
  writeFileSync(
    join(repoDir, "docs", "keep.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Keep\n"
  );
  writeFileSync(
    join(repoDir, "docs", "skip.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Skip\n"
  );

  execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoDir,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "."], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir, stdio: "ignore" });

  writeFileSync(
    join(repoDir, "docs", "keep.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Keep staged\n"
  );
  writeFileSync(
    join(repoDir, "docs", "skip.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Skip unstaged\n"
  );
  execFileSync("git", ["add", "docs/keep.md"], { cwd: repoDir, stdio: "ignore" });
  writeFileSync(
    join(repoDir, "docs", "skip.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Skip unstaged twice\n"
  );

  const result = lintDocsGovernance({ cwd: repoDir, changed: true });

  assert.deepEqual(result, { status: 0, files: ["docs/keep.md"] });
  assert.deepEqual(JSON.parse(readFileSync(argvPath, "utf8")), ["docs/keep.md", "--frail"]);
});

test("lintDocsGovernance accepts explicit file lists", () => {
  const repoDir = initLintRepo();
  const argvPath = join(repoDir, "remark-argv.json");
  installFakeRemark(
    repoDir,
    `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(process.argv.slice(2)));
`
  );
  writeFileSync(
    join(repoDir, "docs", "keep.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Keep\n"
  );
  writeFileSync(join(repoDir, "README.md"), "# Root\n");

  const result = lintDocsGovernance({
    cwd: repoDir,
    files: ["docs/keep.md", "README.md"],
  });

  assert.deepEqual(result, { status: 0, files: ["docs/keep.md"] });
  assert.deepEqual(JSON.parse(readFileSync(argvPath, "utf8")), ["docs/keep.md", "--frail"]);
});

test("cli returns exit code 2 for tool crashes", () => {
  const repoDir = initLintRepo();
  installFakeRemark(
    repoDir,
    `#!/usr/bin/env node
process.stderr.write("docs/file.md\\n  error Cannot process file\\n");
process.exit(1);
`
  );
  writeFileSync(
    join(repoDir, "docs", "file.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# File\n"
  );
  writeFileSync(join(repoDir, "docs-file-list.txt"), "docs/file.md\n");

  let error;
  try {
    execFileSync(
      "node",
      [cliPath.pathname, "lint", "--dir", repoDir, "--files-from", "docs-file-list.txt"],
      {
        cwd: repoDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
  } catch (caught) {
    error = caught;
  }

  assert.equal(error.status, 2);
  assert.match(error.stderr, /\[docs-governance\] fatal=/);
});

test("cli quiet mode suppresses clean-file noise and prints summary", () => {
  const repoDir = initLintRepo();
  installFakeRemark(
    repoDir,
    `#!/usr/bin/env node
process.stdout.write("\\u001B[4m\\u001B[32mdocs/clean.md\\u001B[39m\\u001B[24m: no issues found\\n");
process.stdout.write("\\u001B[4m\\u001B[33mdocs/bad.md\\u001B[39m\\u001B[24m\\n");
process.stderr.write(" warning broken link\\n");
process.exit(1);
`
  );
  const fileListPath = join(repoDir, "docs-file-list.txt");
  writeFileSync(fileListPath, "docs/clean.md\ndocs/bad.md\n");
  writeFileSync(
    join(repoDir, "docs", "clean.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Clean\n"
  );
  writeFileSync(
    join(repoDir, "docs", "bad.md"),
    "---\nreview_policy: historical\nreviewed: 2026-03-25\n---\n\n# Bad\n"
  );

  let error;
  try {
    execFileSync(
      "node",
      [cliPath.pathname, "lint", "--dir", repoDir, "--files-from", "docs-file-list.txt", "--quiet"],
      {
        cwd: repoDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
  } catch (caught) {
    error = caught;
  }

  assert.equal(error.status, 1);
  assert.doesNotMatch(error.stdout, /no issues found/);
  assert.match(error.stdout, /docs\/bad\.md/);
  assert.match(error.stdout, /\[docs-governance\] summary files=2 status=issues/);
});
