import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const DOCS_POLICY_KEY = "docs_policy/v1";
export const DEFAULT_POLICY_PATH = "docs/docs-policy.json";

export function normalizePath(pathValue) {
  return String(pathValue).replaceAll("\\", "/").replace(/^\.\//, "");
}

// @context decision !high [verified:2026-03-25] — Keep policy loading deliberately thin in the shared package.
// Schema-heavy validation can layer on later, but the portable core should just load stable repo policy semantics.
export function loadDocsPolicy(options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const policyPath = options.policyPath ?? DEFAULT_POLICY_PATH;
  const absolutePolicyPath = resolve(cwd, policyPath);
  const document = JSON.parse(readFileSync(absolutePolicyPath, "utf8"));
  const policy = document?.[DOCS_POLICY_KEY];

  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error(`Expected '${DOCS_POLICY_KEY}' object in ${policyPath}.`);
  }

  return {
    cwd,
    policyPath: absolutePolicyPath,
    policy,
  };
}

function wildcardPatternToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchesDocsPolicyPattern(pathValue, pattern) {
  if (pattern === "*") {
    return true;
  }

  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return pathValue === prefix || pathValue.startsWith(`${prefix}/`);
  }

  if (pattern.includes("*")) {
    return wildcardPatternToRegex(pattern).test(pathValue);
  }

  return pathValue === pattern;
}

export function isDocsPathInScope(pathValue, policy) {
  const normalizedPath = normalizePath(pathValue);
  const inScopePaths = Array.isArray(policy?.in_scope_paths) ? policy.in_scope_paths : [];
  return inScopePaths.some((pattern) => matchesDocsPolicyPattern(normalizedPath, pattern));
}

export function isMarkdownPath(pathValue) {
  return normalizePath(pathValue).toLowerCase().endsWith(".md");
}

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".hatch",
  ".hatch-worktrees",
  ".hook-logs",
  ".next",
  ".tmp",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "temp",
  "tmp",
]);

// @context decision:tradeoff !high [verified:2026-03-25] — Path defaults use longest-match wins.
// That preserves the old docs policy behavior without forcing every consumer to hand-order special cases.
export function resolveDocsReviewPolicy(pathValue, policy) {
  const freshness = policy?.freshness;
  if (!freshness || !Array.isArray(freshness.path_defaults)) {
    return typeof freshness?.default_review_policy === "string"
      ? freshness.default_review_policy
      : null;
  }

  let bestMatch = null;
  for (const entry of freshness.path_defaults) {
    if (!entry || typeof entry.path !== "string" || typeof entry.review_policy !== "string") {
      continue;
    }

    if (!matchesDocsPolicyPattern(pathValue, entry.path)) {
      continue;
    }

    if (!bestMatch || entry.path.length > bestMatch.path.length) {
      bestMatch = entry;
    }
  }

  return bestMatch?.review_policy ?? freshness.default_review_policy ?? null;
}

export function resolveReviewPolicyConfig(reviewPolicyId, policy) {
  const reviewPolicies = Array.isArray(policy?.freshness?.review_policies)
    ? policy.freshness.review_policies
    : [];

  return reviewPolicies.find((entry) => entry?.id === reviewPolicyId) ?? null;
}

function deriveStaticTraversalRoot(pattern) {
  const normalizedPattern = normalizePath(pattern);
  if (!normalizedPattern || normalizedPattern === "*") {
    return null;
  }

  const wildcardIndex = normalizedPattern.search(/\*/);
  if (wildcardIndex === 0) {
    return null;
  }

  if (wildcardIndex === -1) {
    return normalizedPattern;
  }

  return normalizedPattern.slice(0, wildcardIndex).replace(/\/+$/, "") || null;
}

// @context decision:tradeoff !high [verified:2026-03-26] — In-scope collection derives traversal roots from policy paths.
// Whole-repo scans made docs hooks look runaway in repos with large runtime residue; derive the narrowest static prefix first and only fall back to repo-wide traversal for broad wildcard patterns.
export function deriveTraversalRoots(policy) {
  const inScopePaths = Array.isArray(policy?.in_scope_paths) ? policy.in_scope_paths : [];
  if (inScopePaths.length === 0) {
    return [];
  }

  const derivedRoots = [];
  for (const pattern of inScopePaths) {
    if (typeof pattern !== "string") {
      continue;
    }

    const root = deriveStaticTraversalRoot(pattern);
    if (root === null) {
      return [""];
    }

    derivedRoots.push(root);
  }

  const uniqueRoots = [...new Set(derivedRoots)].sort(
    (left, right) => left.length - right.length || left.localeCompare(right, "en")
  );

  return uniqueRoots.filter((candidate, index) => {
    return !uniqueRoots.some((other, otherIndex) => {
      if (index === otherIndex || other === candidate) {
        return false;
      }

      return candidate.startsWith(`${other}/`);
    });
  });
}

// @context requirement !high [verified:2026-03-26] — Repo scans should start from in-scope roots and skip runtime residue.
// Governance checks need deterministic source files, not VCS internals, dependency trees, or cache/log directories unrelated to policy scope.
export function listRepositoryFiles(cwd, options = {}) {
  const files = [];
  const requestedRoots =
    Array.isArray(options.roots) && options.roots.length > 0 ? options.roots : [""];
  const queue = [...new Set(requestedRoots.map((root) => normalizePath(root)))];

  while (queue.length > 0) {
    const relDir = queue.shift();
    const absolutePath = resolve(cwd, relDir);
    let currentStat;
    try {
      currentStat = statSync(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    if (currentStat.isFile()) {
      files.push(normalizePath(relDir));
      continue;
    }

    if (!currentStat.isDirectory()) {
      continue;
    }

    const entries = readdirSync(absolutePath, { withFileTypes: true })
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));

    for (const name of entries) {
      if (DEFAULT_EXCLUDED_DIRECTORIES.has(name)) {
        continue;
      }

      const childRel = relDir ? `${relDir}/${name}` : name;
      const childAbs = resolve(cwd, childRel);
      let entryStat;
      try {
        entryStat = statSync(childAbs);
      } catch (error) {
        if (error?.code === "ENOENT") {
          continue;
        }

        throw error;
      }

      if (entryStat.isDirectory()) {
        queue.push(childRel);
        continue;
      }

      if (entryStat.isFile()) {
        files.push(normalizePath(childRel));
      }
    }
  }

  return files;
}

export function collectInScopeMarkdownFiles(cwd, policy) {
  const frontmatterExcludeGlobs = Array.isArray(policy?.frontmatter_exclude_globs)
    ? policy.frontmatter_exclude_globs
    : [];
  const traversalRoots = deriveTraversalRoots(policy);

  return listRepositoryFiles(cwd, { roots: traversalRoots })
    .filter(isMarkdownPath)
    .filter((pathValue) => isDocsPathInScope(pathValue, policy))
    .filter(
      (pathValue) =>
        !frontmatterExcludeGlobs.some((pattern) => matchesDocsPolicyPattern(pathValue, pattern))
    )
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function computeReachabilityRoots(policy, inScopeMarkdownSet) {
  const fromRequiredDocTypes = Array.isArray(policy?.required_doc_types)
    ? policy.required_doc_types.map((entry) => normalizePath(entry?.path ?? ""))
    : [];
  const fromRootAllowlist = Array.isArray(policy?.root_docs_allowlist)
    ? policy.root_docs_allowlist.map(normalizePath)
    : [];

  return [...new Set([...fromRequiredDocTypes, ...fromRootAllowlist])]
    .filter(isMarkdownPath)
    .filter((pathValue) => inScopeMarkdownSet.has(pathValue))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function matchesGlob(pathValue, pattern) {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*");
  return new RegExp(`^${regexStr}$`).test(pathValue);
}

// @context history !high [verified:2026-03-25] — Orphan allowlisting mirrors the legacy checker.
// Root exceptions, migration debt, and orphan-exclude globs stay combined so reachability can roll out incrementally.
export function computeOrphanAllowlist(policy, inScopeMarkdownSet) {
  const fromRootLevelExceptions = Array.isArray(policy?.root_level_exceptions)
    ? policy.root_level_exceptions.map(normalizePath)
    : [];
  const fromLegacyAllowlist = Array.isArray(policy?.migration_debt?.legacy_in_scope_allowlist)
    ? policy.migration_debt.legacy_in_scope_allowlist.map(normalizePath)
    : [];
  const orphanExcludeGlobs = Array.isArray(policy?.orphan_exclude_globs)
    ? policy.orphan_exclude_globs
    : [];
  const fromGlobExcludes =
    orphanExcludeGlobs.length > 0
      ? [...inScopeMarkdownSet].filter((pathValue) =>
          orphanExcludeGlobs.some((pattern) => matchesGlob(pathValue, pattern))
        )
      : [];

  return [...new Set([...fromRootLevelExceptions, ...fromLegacyAllowlist, ...fromGlobExcludes])]
    .filter(isMarkdownPath)
    .filter((pathValue) => inScopeMarkdownSet.has(pathValue))
    .sort((left, right) => left.localeCompare(right, "en"));
}
