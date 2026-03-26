# remark-for-ai

Docs governance for coding-agent workflows, built on the remark ecosystem
instead of hand-rolled markdown parsing.

This repo exists for one reason: agents are great at writing docs and terrible
at governing them.

Agents are excellent at capturing context in markdown. Give them a blank
directory and they will happily produce plans, design notes, migration docs,
debug diaries, and architecture writeups all day.

What they are bad at is the maintenance discipline humans tend to postpone but
eventually do:

- updating an old doc instead of writing a new one
- deleting a stale doc instead of preserving it forever
- linking a new doc into a navigable graph
- keeping metadata structured and truthful
- noticing when a review date has quietly become fiction

Left alone, they generate the same failure pattern over and over:

- stale docs that still sound authoritative
- duplicate docs that disagree with each other
- docs that no one links to but no one deletes
- frontmatter that drifts from repo policy
- review dates that become fiction instead of signal

The result is worse than missing docs. You get a tree full of plausible,
high-confidence lies.

This repo is the enforcement layer for that problem.

It gives you simple deterministic tooling that forces agents to do the annoying
but correct things:

- all in-scope markdown docs are structured
- all live docs are catalogued into a rooted graph
- optional review windows expire deterministically
- stale and orphaned docs fail in lint and hooks
- repo policy lives in versioned config, not vibes
- existing remark plugins handle markdown semantics
- we only add the missing governance rules on top

Some of this friction is annoying for humans.

That is exactly why it is useful for agents.

Agents need deterministic pressure to update, consolidate, link, or delete
docs instead of endlessly adding more surface area.

---

## The Problem With Agent-Written Docs

A team asks an agent to document a system. It does exactly that.

It writes:

- `docs/cache-strategy.md`
- `docs/cache-strategy-v2.md`
- `docs/new-cache-design.md`
- `docs/redis-notes.md`

All four are coherent. Two are half obsolete. One was never linked from
anywhere. All still have confident prose.

Six weeks later, another agent needs to change caching behavior. It reads the
wrong doc first, updates code based on dead assumptions, and then writes a
fifth document trying to reconcile the mess instead of fixing the existing
ones.

Tests may still pass. Reviews may still pass. The docs tree is what failed.

That is the problem this repo solves.

The core insight is simple:

agents do not need help writing more markdown.

They need guardrails that make them update existing docs, keep the docs tree
navigable, and remove dead material.

The standard we want is much harsher and much simpler:

- if a doc is important, keep it fresh
- if a doc is not important enough to keep fresh, make it historical or delete
  it
- if a doc is live, it should be reachable from a rooted docs graph
- if a doc is orphaned, remove it or link it properly
- git history is already the archive; the live docs tree should describe the
  current repo, not every thought anyone ever had

`rm` is a governance feature.

## Why This Works Well For Agents

Humans often resist strict docs governance because it feels nitpicky.

Agents are the opposite case. They respond well to deterministic rules:

- if frontmatter is missing, fail
- if the doc is orphaned, fail
- if the review date expired, fail
- if the doc should be historical or deleted, make that the shortest path to
  green

This repo is designed around that asymmetry.

The job is not to politely remind contributors to clean things up later. The
job is to make the correct docs behavior the path of least resistance for an
agent operating in a loop of edit, lint, fix, repeat.

## Why Remark, Not Another Custom Parser

The markdown ecosystem already solved most of the hard, boring parts:

- frontmatter parsing
- markdown AST construction
- link parsing
- heading / anchor handling
- cross-file link validation

Trying to rebuild that with regexes is a maintenance debt factory.

So this repo does not compete with remark. It composes with it.

We rely on existing packages for generic markdown concerns:

- `remark-frontmatter`
- `remark-lint-frontmatter-schema`
- `remark-validate-links`

And we add the missing governance pieces:

- `@recallnet/remark-lint-docs-freshness`
- `@recallnet/remark-lint-docs-reachability`
- `@recallnet/docs-governance-policy`
- `@recallnet/docs-governance-preset`

That is the design philosophy of this repo in one sentence:

**use the ecosystem for markdown semantics; add only the smallest novel surface
area needed to make docs self-describing, expiring, and enforceable.**

## What This Actually Enforces

### 1. Frontmatter is not optional metadata sludge

Docs declare what they are, who owns them, how they should be reviewed, and
when they were last reviewed.

Example:

```yaml
---
doc_type: design
owner: platform
review_policy: periodic-7
reviewed: 2026-03-25
status: active
summary: Redis cache invalidation rules for writes and backfills.
tags:
  - cache
  - redis
written: 2026-03-25
---
```

If a repo wants active docs, it has to tell the truth about them.

### 2. Review windows expire

If a doc says it follows `periodic-7`, then seven days later it must be
reviewed again, marked historical, switched to a more appropriate policy, or
deleted.

That gives you a live docs tree whose timestamps mean something.

### 3. Orphans fail

Important docs should not exist as disconnected markdown blobs.

This repo enforces a rooted docs graph, typically from `docs/INDEX.md`. If an
in-scope doc is not reachable from the declared roots, lint fails.

That keeps navigation intentional and forces teams to answer a useful question:
if this doc matters, where do readers discover it?

### 4. Repo policy is explicit

Governance lives in `docs/docs-policy.json`, not in tribal memory.

That policy decides:

- which paths are in scope
- which review policies exist
- which paths get which default review policy
- which docs are graph roots
- which docs or globs are temporarily excluded

## Why Other Approaches Fall Short

### Commit history

Commit history is a good archive. It is a bad live navigation system and a bad
source of freshness guarantees.

Git tells you what changed. It does not enforce that a stale doc gets reviewed
or deleted.

### Wikis and Notion pages

External docs are almost never part of the merge path. They drift because they
are optional at exactly the moment rigor matters most.

This repo keeps docs governance inside the repo, inside hooks, inside CI.

### "We’ll just tell people to clean docs up"

That fails for the same reason "just be careful" fails in codebases. Standards
without enforcement decay into vibes.

Agents amplify that failure because they can generate bad-but-convincing docs
faster than humans notice the damage.

## Recommended Default Operating Model

These defaults are deliberately opinionated.

- active docs default to `periodic-7`
- `docs/INDEX.md` is the canonical root
- `docs/templates/**` is excluded from freshness and orphan checks
- historical docs are allowed, but should be rare and explicit
- generated or codebound docs should only be used when truly correct
- if seven-day review feels too aggressive, the first question should be
  whether the repo has too many active docs

The bias here is intentional:

keep fewer docs, keep them fresher, and delete aggressively.

## Quick Start

Install the preset:

```bash
pnpm add -D @recallnet/docs-governance-preset
```

Bootstrap a repo:

```bash
pnpm exec recall-docs-governance init
```

Lint docs:

```bash
pnpm docs:lint
```

That generates:

- `docs/docs-policy.json`
- `docs/docs-frontmatter.schema.json`
- `.remarkrc.mjs`
- `docs/INDEX.md`
- package scripts for docs linting
- `AGENTS.md` guidance for repo contributors

After that, the repo has a deterministic docs contract that agents can operate
against instead of a loose social expectation that they will "keep docs tidy."

## Recommended Config

```js
import { createDocsGovernanceConfig } from "@recallnet/docs-governance-preset";

export default createDocsGovernanceConfig({
  policyPath: "./docs/docs-policy.json",
  frontmatterSchemaPath: "./docs/docs-frontmatter.schema.json",
});
```

## Packages

### `@recallnet/docs-governance-policy`

Shared policy loader and repo-policy semantics:

- loads `docs/docs-policy.json`
- resolves review-policy defaults
- computes graph roots and allowlists
- enumerates in-scope markdown files

### `@recallnet/docs-governance-preset`

The easiest adoption path:

- exports the recommended remark config
- provides `recall-docs-governance init`
- provides `recall-docs-governance lint`
- bootstraps the default repo policy and schema files

### `@recallnet/remark-lint-docs-freshness`

Fails docs whose declared review window has expired.

### `@recallnet/remark-lint-docs-reachability`

Fails docs that are in scope but not reachable from declared roots.

## What This Repo Does Not Try To Do

It does not try to be a full docs platform.

It does not replace:

- architecture docs
- onboarding guides
- ADRs
- project management
- search
- wikis

It does one narrower job:

**make repo-native docs auditable, reachable, and fresh enough to trust.**

## QA and Release Model

This repo uses the standard Recall Labs release path:

- Changesets for versioning
- npmjs trusted publishing through GitHub Actions
- Husky hooks for pre-commit and pre-push gates
- ESLint, Prettier, tests, `jscpd`, and `knip`
- `codecontext` enforcement for non-obvious repo constraints

To ship:

1. `pnpm install`
2. `pnpm check`
3. add a `.changeset/*.md`
4. merge to `main`
5. let `.github/workflows/publish-packages.yml` publish

## The Pitch In One Line

If `codecontext` governs code decisions, this governs docs decisions.

Same philosophy:

- repo-native
- frontmatter-based
- enforceable in hooks
- hostile to drift

Different target:

- not code intent
- docs truthfulness
