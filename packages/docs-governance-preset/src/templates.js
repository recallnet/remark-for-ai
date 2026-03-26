export const defaultDocsPolicy = {
  "docs_policy/v1": {
    freshness: {
      default_review_policy: "periodic-7",
      review_policies: [
        {
          id: "codebound",
          mode: "codebound",
        },
        {
          id: "generated",
          mode: "generated",
        },
        {
          id: "historical",
          mode: "historical",
        },
        {
          id: "periodic-7",
          mode: "periodic",
          max_age_days: 7,
        },
      ],
      path_defaults: [
        {
          path: "docs/**",
          review_policy: "periodic-7",
        },
        {
          path: "docs/INDEX.md",
          review_policy: "generated",
        },
      ],
    },
    in_scope_paths: ["docs/**"],
    frontmatter_exclude_globs: ["docs/templates/**"],
    required_doc_types: [],
    root_docs_allowlist: ["docs/INDEX.md"],
    root_level_exceptions: [],
    orphan_exclude_globs: ["docs/templates/**"],
    migration_debt: {
      legacy_in_scope_allowlist: [],
    },
  },
};

export const defaultFrontmatterSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: true,
  properties: {
    doc_type: { type: "string", minLength: 1 },
    owner: { type: "string", minLength: 1 },
    review_policy: { type: "string", minLength: 1 },
    reviewed: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    status: {
      type: "string",
      enum: ["active", "historical", "draft"],
    },
    summary: { type: "string", minLength: 1 },
    tags: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    written: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  required: [
    "doc_type",
    "owner",
    "review_policy",
    "reviewed",
    "status",
    "summary",
    "tags",
    "written",
  ],
};

export function createRemarkConfigSource(options = {}) {
  const policyPath = options.policyPath ?? "./docs/docs-policy.json";
  const frontmatterSchemaPath =
    options.frontmatterSchemaPath ?? "./docs/docs-frontmatter.schema.json";

  return `import { createDocsGovernanceConfig } from "@recallnet/docs-governance-preset";

export default createDocsGovernanceConfig({
  policyPath: ${JSON.stringify(policyPath)},
  frontmatterSchemaPath: ${JSON.stringify(frontmatterSchemaPath)}
});
`;
}

export function createIndexSource(today = new Date().toISOString().slice(0, 10)) {
  return `---
doc_type: index
owner: docs-stewards
review_policy: generated
reviewed: ${today}
status: active
summary: Canonical root for docs reachability and navigation.
tags:
  - docs
  - index
written: ${today}
---

# Docs Index

Start here. Every in-scope doc should be reachable from this index or another rooted doc.
`;
}

export function createAgentsSection() {
  return `## Docs Governance

- Use the repo docs governance stack instead of hand-rolled markdown parsing.
- Keep docs frontmatter valid and review dates current.
- Default active docs to \`periodic-7\`. This is the recommended default because active docs drift quickly; if a repo cannot sustain 7-day review, it usually has too many docs.
- Use \`generated\`, \`codebound\`, or \`historical\` only when they are genuinely correct, not as an escape hatch from freshness enforcement.
- Add new docs to the rooted docs graph so orphan checks stay clean.
- Root the graph from \`docs/INDEX.md\` unless the repo has a stronger canonical entrypoint.
- Prefer deleting stale docs over re-dating them. Git history already preserves old text; the live docs tree should describe current reality, not accumulate dead docs.
- Removing stale or duplicate docs is a good default behavior. \`rm\` is often the right answer.
- Run \`pnpm docs:lint\` before merging doc structure or policy changes.
`;
}
