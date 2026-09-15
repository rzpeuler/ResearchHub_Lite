# Industry Alias Evidence Routing

Date: 2026-09-15

## Change

The Industry workflow now considers the target's bounded aliases during
evidence routing. Explicit module hints remain authoritative; the change only
extends the existing fallback text-match terms from the primary target name to
the supplied aliases and design search terms. Qualification, source limits,
provider composition, and the Gateway/Writer boundary are unchanged.

## Verification

- `node --import tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`: 44/44 passed.
- `npm run typecheck`: passed.
- The alias regression uses a `PCB` alias with a bounded non-official source
  whose primary name does not match, and confirms all eight module calls receive
  the routed evidence.
- Fresh TEST-054 was rerun after the change. It remained a truthful completed
  workflow with two waves, MIIT definition evidence, one Gateway/Writer path,
  canonical reload, and a sixteen-section report; the live public portfolio
  still lacked qualified evidence for seven modules.

## Boundary

This is a routing correctness fix, not a claim that the live Industry
product-quality gate passed. No provider was added, no evidence rule was
relaxed, and no raw source body or credential was recorded.
