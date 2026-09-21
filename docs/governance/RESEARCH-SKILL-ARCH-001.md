# RHL-SKILL-ARCH-001 Governance State

Updated: 2026-09-21  
Status: `IMPLEMENTED / SOL ACCEPTANCE PENDING`  
Implementation HEAD before closure documentation: `28a7b8f`

## Scope

Research Skills now have one canonical flat layer. Composite product missions
remain existing Workflows. The 29-item catalog records `IMPLEMENTED`, `PARTIAL`,
and `PLANNED` status; the runtime registry registers only implemented built-in
canonical entries. Knowledge Schema and the Gateway/ChangeSet/Writer boundary
are unchanged.

## Accepted engineering facts

- Canonical catalog: 29 entries; 10 runtime-registered, 13 partial, 6 planned
  after the first Wave 3 checkpoint promoted business-driver analysis.
- Runtime entries are classified as `SEMANTIC_EXECUTABLE` or
  `DETERMINISTIC_EXECUTABLE`; deterministic entries must expose a direct
  callable binding to the authoritative calculation implementation.
- Runtime canonical entries expose purpose, Invocation Match, inputs, produces,
  methodology path, and complete SKILL.md contract sections.
- Earnings, valuation, Company Economics, and Thesis Red Team narrow intents
  have explicit collision-aware routing tests.
- Existing composite Workflow IDs remain product-compatible and are no longer
  registered as canonical Research Skills. Workflow metadata maps peer
  canonical methods and filters unavailable planned methods.
- External onboarded Skills remain in the existing plugin onboarding boundary
  and are marked as external extensions rather than built-in catalog entries.
- No Agent, Planner, Capability layer, Provider abstraction, Knowledge Schema,
  or unrelated UI/runtime change was introduced.
- Semantic Workflow decisions reject mapped Skills that are absent, disabled,
  non-research, or canonical but not `IMPLEMENTED`; automatic Workflow
  selection uses the same executable subset.

## Evidence

- `docs/architecture/RESEARCH_SKILL_ARCHITECTURE_V1.md`
- `docs/architecture/RESEARCH_SKILL_CATALOG_V1.md`
- `docs/engineering/specs/2026-09-21-research-skill-migration.md`
- `docs/superpowers/specs/2026-09-21-single-level-research-skill-architecture-design.md`
- `tests/app/services/research-skill-architecture.test.ts`
- Full repository tests and build commands recorded in the RHL acceptance report.

## Remaining acceptance boundary

Sol acceptance remains pending. PARTIAL/PLANNED capabilities must not be
represented as implemented in future routing or reports. Authenticated external
provider/model E2E remains environment-dependent and is not upgraded by the
fixture-backed architecture tests.
