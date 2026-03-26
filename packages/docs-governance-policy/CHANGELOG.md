# @recallnet/docs-governance-policy

## 0.2.2

### Patch Changes

- Avoid whole-repo traversal for docs collection by deriving traversal roots from `in_scope_paths` and skipping common runtime/cache directories during descent.

## 0.2.1

### Patch Changes

- Skip broken symlinks that raise ENOENT during repository scans so docs linting does not crash on invalid repo-local skill links.

## 0.2.0

### Minor Changes

- cdbb6ff: Initial public release of the docs governance packages.
  - add shared docs policy loader and path matching helpers
  - add one-command preset and bootstrap CLI for internal repo adoption
  - add remark lint rule for review-policy freshness enforcement
  - add remark lint rule for docs reachability and orphan detection
  - add Changesets-based npmjs publishing and repo QA baseline
