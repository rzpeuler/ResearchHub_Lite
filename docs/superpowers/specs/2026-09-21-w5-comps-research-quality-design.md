# RHL-W5-001 Comparable Valuation and Research Quality Gate Design

Date: 2026-09-21  
Baseline: `d589bf15e9830fe57f73a6fdad9441c50d30abe5`  
Status: `APPROVED TASKBOOK DESIGN / IMPLEMENTATION IN PROGRESS`

## Goal

Wave 5 closes the accepted Post-W4 product gap by making comparable valuation
independently executable and by adding one reusable, Workflow-owned terminal
quality gate. It also corrects three catalog ownership errors without deleting
their useful behavior:

- evidence normalization remains acquisition/shared evidence infrastructure;
- valuation cross-check remains Valuation Workflow composition;
- research QC becomes a reusable Workflow terminal gate, not a Skill.

## Architecture

The canonical catalog becomes 26 entries. Only `comps_valuation` is promoted
from `PARTIAL`; the four planned Skills remain unchanged. The existing flat
ResearchSkillRegistry remains the only Skill registry. No Agent, Planner,
Capability layer, generic Provider abstraction, or Knowledge Schema kind is
introduced.

`comps_valuation` receives bounded candidate peer evidence, validates stable
identity, source references, PIT cutoff, period basis, units, currency and
metric applicability, then delegates arithmetic to the existing comparable
calculation helpers. The result exposes accepted and rejected peers,
reason-coded diagnostics, distributions, selected-multiple provenance and
code-owned implied valuation.

The quality gate is a pure Workflow-layer helper. It consumes already-produced
Workflow outputs and does not reacquire sources or invoke Skills. Profiles
select applicable deterministic checks for valuation, company, earnings,
industry, event, thesis lifecycle and daily intelligence. It returns
`PASS`, `PASS_WITH_WARNINGS`, or `FAIL` with typed `ERROR`, `WARNING`, and
`INFO` diagnostics. Gateway/Writer remains the canonical Knowledge boundary.

Valuation keeps method cross-checks in the Workflow. It reports available and
unavailable methods, basis compatibility, conflicts and dispersion without
implicit averaging.

## Data flow

```text
bounded sources / existing Workflow outputs
  -> comps identity/evidence/PIT/period/unit validation
  -> existing deterministic comparable arithmetic
  -> accepted/rejected peer result
  -> valuation Workflow cross-check
  -> ResearchQualityGate profile
  -> report and Gateway eligibility
  -> Gateway / Writer when explicitly enabled
```

The gate runs before Gateway submission. Optional unavailable sections produce
nonfatal diagnostics; future contamination, forged/dangling source references,
material unit/currency mismatch, unresolved proposition links, and other
structural contradictions block eligibility.

## Compatibility

The three reclassified IDs are removed from canonical metadata and no longer
advertised as callable Skills. Workflow definitions use owner-neutral gate
metadata and retain existing behavior through Workflow helpers. If any public
input still names a removed ID, dispatch resolves it to the relevant Workflow
or rejects it as a non-callable internal capability; it never presents the ID
as a canonical Skill.

## Validation

Focused tests cover catalog and routing cleanup, comparable identity and
metric-specific rejection, PIT/period/unit/currency rules, insufficient peers,
median-to-implied-value arithmetic, QC severity/status and cross-domain
contradictions, Workflow-specific profiles, cross-check behavior, and Gateway
separation. Existing Company, Earnings, Industry, Event, Thesis, Daily,
Knowledge and full repository checks are then run without weakening the
accepted `VAL-HTTP-001` policy.

