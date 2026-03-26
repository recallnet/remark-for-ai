# @recallnet/docs-governance-preset

## 0.2.4

### Patch Changes

- Avoid whole-repo traversal for docs collection by deriving traversal roots from `in_scope_paths` and skipping common runtime/cache directories during descent.
- Updated dependencies
  - @recallnet/docs-governance-policy@0.2.2
  - @recallnet/remark-lint-docs-reachability@0.2.2
  - @recallnet/remark-lint-docs-freshness@0.2.2

## 0.2.3

### Patch Changes

- Generate the default docs frontmatter schema as draft-07 so it is compatible with `remark-lint-frontmatter-schema`.

## 0.2.2

### Patch Changes

- Stop resolving `remark-cli/package.json` directly during `recall-docs-governance lint`, and invoke the `remark` executable in an exports-safe way instead.

## 0.2.1

### Patch Changes

- Skip broken symlinks that raise ENOENT during repository scans so docs linting does not crash on invalid repo-local skill links.
- Updated dependencies
  - @recallnet/docs-governance-policy@0.2.1
  - @recallnet/remark-lint-docs-reachability@0.2.1
  - @recallnet/remark-lint-docs-freshness@0.2.1

## 0.2.0

### Minor Changes

- cdbb6ff: Initial public release of the docs governance packages.
  - add shared docs policy loader and path matching helpers
  - add one-command preset and bootstrap CLI for internal repo adoption
  - add remark lint rule for review-policy freshness enforcement
  - add remark lint rule for docs reachability and orphan detection
  - add Changesets-based npmjs publishing and repo QA baseline

### Patch Changes

- 82f1de7: Fix published package manifests to use real semver dependency ranges instead of `workspace:*`.
- Updated dependencies [cdbb6ff]
- Updated dependencies [82f1de7]
  - @recallnet/docs-governance-policy@0.2.0
  - @recallnet/remark-lint-docs-freshness@0.2.0
  - @recallnet/remark-lint-docs-reachability@0.2.0
