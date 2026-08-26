# Architecture decision records

This directory is **empty of historical decisions on purpose.**

Ringee had no ADRs when this documentation was written. The reasoning behind past
decisions — Telnyx over another carrier, Clerk over self-hosted auth, Temporal
over a job queue, a running balance alongside a ledger — is not recorded anywhere
that could be verified, and inventing plausible-sounding rationale after the fact
would be worse than having none: it reads as authoritative and is unfalsifiable.

So: **do not write retrospective ADRs.** If you know why a past decision was made
because you were there, or you can point at an issue or PR that says so, that is
a fine ADR — cite the source.

## When to write one

When a decision will outlive the pull request that makes it and a future reader
would otherwise have to guess. Typically:

- adding or replacing an external provider
- changing how tenancy, billing or call state works
- a new persistence or messaging technology
- deliberately accepting a trade-off someone will later want to "fix"
- reversing something in [ARCHITECTURE_DEBT.md](../ARCHITECTURE_DEBT.md)

Not for: library bumps, refactors that preserve behaviour, or anything a code
comment covers.

## Format

`NNNN-short-kebab-title.md`, numbered sequentially from `0001`.

```markdown
# 0001 — Short title

Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by 000X

## Context

The forces at play. What made a decision necessary? Constraints, alternatives
actually considered, and what was unknown at the time.

## Decision

What was decided, in the active voice. "We will …"

## Consequences

What becomes easier, what becomes harder, what is now load-bearing, and what has
to be revisited if an assumption changes. Include the bad consequences — they are
the reason anyone reads an ADR years later.
```

Keep it short. An ADR that needs a table of contents is a design document.

## Linking

Reference business rules by ID (`BILL-006`) and debt items by ID (`DEBT-001`).
When an ADR resolves a debt item, say so in both places.
