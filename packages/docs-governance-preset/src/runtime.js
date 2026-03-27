import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  collectInScopeMarkdownFiles,
  isDocsPathInScope,
  isMarkdownPath,
  loadDocsPolicy,
  matchesDocsPolicyPattern,
  normalizePath,
} from "@recallnet/docs-governance-policy";

import {
  createAgentsSection,
  createIndexSource,
  createRemarkConfigSource,
  defaultDocsPolicy,
  defaultFrontmatterSchema,
} from "./templates.js";

export const LINT_FAILURE_EXIT_CODE = 1;
export const FATAL_FAILURE_EXIT_CODE = 2;

function ensureDirectory(pathValue) {
  mkdirSync(dirname(pathValue), { recursive: true });
}

function writeFileIfMissing(pathValue, contents, force = false) {
  if (!force && existsSync(pathValue)) {
    return false;
  }

  ensureDirectory(pathValue);
  writeFileSync(pathValue, contents, "utf8");
  return true;
}

function upsertPackageScripts(cwd) {
  const packageJsonPath = resolve(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.scripts ??= {};
  packageJson.scripts["docs:lint"] ??= "recall-docs-governance lint";
  packageJson.scripts["docs:lint:changed"] ??= "recall-docs-governance lint --changed";
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  return true;
}

function ensureAgentsGuidance(cwd) {
  const agentsPath = resolve(cwd, "AGENTS.md");
  const section = createAgentsSection();

  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, `# AGENTS\n\n${section}`, "utf8");
    return true;
  }

  const current = readFileSync(agentsPath, "utf8");
  if (current.includes("## Docs Governance")) {
    return false;
  }

  writeFileSync(agentsPath, `${current.replace(/\s*$/, "")}\n\n${section}`, "utf8");
  return true;
}

export function initDocsGovernanceRepo(options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const force = options.force === true;
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  const created = [];

  const docsPolicyPath = resolve(cwd, "docs", "docs-policy.json");
  if (
    writeFileIfMissing(docsPolicyPath, `${JSON.stringify(defaultDocsPolicy, null, 2)}\n`, force)
  ) {
    created.push("docs/docs-policy.json");
  }

  const schemaPath = resolve(cwd, "docs", "docs-frontmatter.schema.json");
  if (
    writeFileIfMissing(schemaPath, `${JSON.stringify(defaultFrontmatterSchema, null, 2)}\n`, force)
  ) {
    created.push("docs/docs-frontmatter.schema.json");
  }

  const remarkConfigPath = resolve(cwd, ".remarkrc.mjs");
  if (writeFileIfMissing(remarkConfigPath, createRemarkConfigSource(), force)) {
    created.push(".remarkrc.mjs");
  }

  const indexPath = resolve(cwd, "docs", "INDEX.md");
  if (writeFileIfMissing(indexPath, createIndexSource(today), force)) {
    created.push("docs/INDEX.md");
  }

  if (upsertPackageScripts(cwd)) {
    created.push("package.json#scripts");
  }

  if (ensureAgentsGuidance(cwd)) {
    created.push("AGENTS.md");
  }

  return {
    cwd,
    created,
  };
}

function resolveRemarkCliCommand(cwd) {
  const candidatePaths = [
    resolve(cwd, "node_modules", ".bin", "remark"),
    resolve(import.meta.dirname, "..", "node_modules", ".bin", "remark"),
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return "remark";
}

function collectChangedFiles(cwd, mode = "staged") {
  const args =
    mode === "head"
      ? ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]
      : ["diff", "--cached", "--name-only", "--diff-filter=ACMR"];

  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function parseFileList(text, separatorPattern) {
  return text
    .split(separatorPattern)
    .map((entry) => normalizePath(entry.trim()))
    .filter(Boolean);
}

function resolveRequestedFiles(cwd, options) {
  if (Array.isArray(options.files)) {
    return options.files.map((entry) => normalizePath(entry)).filter(Boolean);
  }

  if (typeof options.fileListText === "string") {
    return parseFileList(options.fileListText, options.stdin0 ? "\0" : /\r?\n/u);
  }

  if (typeof options.filesFrom === "string") {
    const fileListText = readFileSync(resolve(cwd, options.filesFrom), "utf8");
    return parseFileList(fileListText, /\r?\n/u);
  }

  return null;
}

function stripAnsi(text) {
  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (current === "\u001B" && next === "[") {
      index += 2;
      while (index < text.length && text[index] !== "m") {
        index += 1;
      }
      continue;
    }

    result += current;
  }

  return result;
}

function filterQuietOutput(output) {
  return output
    .split(/\r?\n/u)
    .filter((line) => !stripAnsi(line).includes(": no issues found"))
    .join("\n")
    .replace(/\n+$/u, "\n");
}

function writeOutput(stream, output) {
  if (output) {
    stream.write(output.endsWith("\n") ? output : `${output}\n`);
  }
}

function isRemarkFatalFailure(output) {
  const normalized = stripAnsi(output);
  return (
    normalized.includes("Cannot process file") ||
    normalized.includes("Cannot parse file") ||
    normalized.includes("[cause]")
  );
}

function runRemarkLint(cwd, files, options = {}) {
  const remarkCliCommand = resolveRemarkCliCommand(cwd);
  const result = spawnSync(remarkCliCommand, [...files, "--frail"], {
    cwd,
    encoding: "utf8",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combinedOutput = `${stdout}${stderr}`;
  const renderedStdout = options.quiet ? filterQuietOutput(stdout) : stdout;
  const renderedStderr = options.quiet ? filterQuietOutput(stderr) : stderr;

  writeOutput(process.stdout, renderedStdout);
  writeOutput(process.stderr, renderedStderr);

  if (options.quiet) {
    const summary =
      result.status === 0
        ? `[docs-governance] summary files=${files.length} status=clean\n`
        : `[docs-governance] summary files=${files.length} status=issues\n`;
    process.stdout.write(summary);
  }

  if (result.error) {
    const error = new Error(result.error.message);
    error.name = "DocsGovernanceFatalError";
    error.exitCode = FATAL_FAILURE_EXIT_CODE;
    error.cause = result.error;
    throw error;
  }

  if ((result.status ?? 0) !== 0) {
    const error = new Error("remark lint failed");
    error.name = "DocsGovernanceRemarkError";
    error.exitCode = isRemarkFatalFailure(combinedOutput)
      ? FATAL_FAILURE_EXIT_CODE
      : LINT_FAILURE_EXIT_CODE;
    error.status = result.status;
    throw error;
  }
}

function filterChangedInScopeFiles(changedFiles, policy) {
  const frontmatterExcludeGlobs = Array.isArray(policy?.frontmatter_exclude_globs)
    ? policy.frontmatter_exclude_globs
    : [];

  return changedFiles
    .filter(isMarkdownPath)
    .filter((pathValue) => isDocsPathInScope(pathValue, policy))
    .filter(
      (pathValue) =>
        !frontmatterExcludeGlobs.some((pattern) => matchesDocsPolicyPattern(pathValue, pattern))
    )
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function lintDocsGovernance(options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const { policy } = loadDocsPolicy({
    cwd,
    policyPath: options.policyPath ?? "docs/docs-policy.json",
  });

  const requestedFiles = resolveRequestedFiles(cwd, options);
  const files = requestedFiles
    ? filterChangedInScopeFiles(requestedFiles, policy)
    : options.changed
      ? filterChangedInScopeFiles(collectChangedFiles(cwd, options.gitMode) ?? [], policy)
      : collectInScopeMarkdownFiles(cwd, policy);
  if (files.length === 0) {
    return { status: 0, files: [] };
  }

  // @context requirement !high [verified:2026-03-27] — CLI wrappers need stable semantics for hook runners.
  // Pre-commit integrations depend on staged-file scope, quiet clean output, and distinct fatal-vs-lint exit codes; changing this behavior would break downstream gate routing and error handling.
  runRemarkLint(cwd, files, options);

  return { status: 0, files };
}
