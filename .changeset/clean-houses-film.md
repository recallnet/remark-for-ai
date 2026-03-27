---
"@recallnet/docs-governance-preset": patch
---

Improve pre-commit integration by making `lint --changed` use staged
git changes by default, adding explicit file-list input support,
returning a distinct fatal exit code for tool crashes, and providing a
quiet summary mode that suppresses clean-file noise.
