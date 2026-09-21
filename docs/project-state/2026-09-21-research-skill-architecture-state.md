# Research Skill Architecture — Current State

Date: 2026-09-21

## Implemented

- A canonical 29-entry flat Research Skill catalog is maintained in
  `app/services/research-skill-catalog.ts` and documented in
  `docs/architecture/RESEARCH_SKILL_CATALOG_V1.md`.
- The existing Research Skill Registry now validates canonical descriptor
  metadata and required SKILL.md sections at registration time.
- Twelve evidence-gated methods are runtime registered: business model map,
  business driver analysis, unit economics, consensus expectations, earnings
  variance, guidance, estimate revisions, DCF, reverse DCF, scenario valuation,
  valuation cross-check, and thesis red team.
- Composite research missions remain existing Workflows. Workflow definitions
  expose peer canonical skill mappings and dispatch refuses semantic Skill IDs
  outside the selected Workflow mapping.
- Deterministic narrow-intent fallback covers the required valuation, earnings,
  Company Economics, and Thesis Red Team collision cases; ambiguous requests
  still fall back safely.
- Existing external Skill onboarding remains compatible and is distinguished
  from built-in canonical catalog registration.

## Status ledger

| State | Count | Runtime |
| --- | ---: | --- |
| IMPLEMENTED | 12 | yes |
| PARTIAL | 11 | no |
| PLANNED | 6 | no |

## Boundaries preserved

Workflow remains responsible for lifecycle, composition, report assembly, and
Knowledge projection. Skills do not mutate canonical Knowledge or call another
Skill. Knowledge Schema, Gateway, ChangeSet validation, Writer, Pi host, and
local-first runtime boundaries are unchanged.

## Validation snapshot

- Client tests: 28 passed.
- Node tests: 1,210 passed.
- Root typecheck, client typecheck, client build, and `git diff --check`: pass.
- Full provider/model acceptance remains separately environment-dependent.
