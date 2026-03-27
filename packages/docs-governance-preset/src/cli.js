#!/usr/bin/env node
import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {
    command,
    changed: false,
    force: false,
    gitMode: "staged",
    quiet: false,
    stdin0: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--changed") {
      options.changed = true;
      continue;
    }

    if (value === "--force") {
      options.force = true;
      continue;
    }

    if (value === "--quiet") {
      options.quiet = true;
      continue;
    }

    if (value === "--stdin0") {
      options.stdin0 = true;
      continue;
    }

    if (value === "--dir") {
      options.cwd = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === "--files-from") {
      options.filesFrom = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === "--git-mode") {
      const gitMode = rest[index + 1];
      if (gitMode !== "staged" && gitMode !== "head") {
        throw new Error(`Unknown git mode: ${gitMode}`);
      }

      options.gitMode = gitMode;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return options;
}

function printHelp() {
  process.stdout.write(`Usage:
  recall-docs-governance init [--dir <path>] [--force]
  recall-docs-governance lint [--dir <path>] [--changed] [--git-mode staged|head]
    [--files-from <path> | --stdin0] [--quiet]
`);
}

try {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "help" || options.command === "--help" || options.command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (options.command === "init") {
    const { initDocsGovernanceRepo } = await import("./runtime.js");
    const result = initDocsGovernanceRepo({ cwd: options.cwd, force: options.force });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  }

  if (options.command === "lint") {
    const { lintDocsGovernance } = await import("./runtime.js");
    const fileListText = options.stdin0 ? readFileSync(0, "utf8") : undefined;
    lintDocsGovernance({
      cwd: options.cwd,
      changed: options.changed,
      filesFrom: options.filesFrom,
      fileListText,
      gitMode: options.gitMode,
      quiet: options.quiet,
      stdin0: options.stdin0,
    });
    process.exit(0);
  }

  throw new Error(`Unknown command: ${options.command}`);
} catch (error) {
  process.stderr.write(`[docs-governance] fatal=${JSON.stringify({ message: error.message })}\n`);
  process.exit(error.exitCode ?? 2);
}
