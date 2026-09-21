# RHL-POST-W4-001 Product Readiness Matrix

Status: `AUDIT_COMPLETE / SOL REVIEW PENDING`

## Scope and baseline

This is a read-only product and architecture audit from accepted ancestor
`4691ee82368cd66c35dd2f0ebcd337ef6fb1c678`. No runtime, Skill, Workflow,
Knowledge Schema, Provider, Agent, Planner, Capability, or UI implementation
was changed.

The authoritative runtime catalog at the audit baseline contains 29 entries:

| Status | Count | Meaning |
|---|---:|---|
| `IMPLEMENTED` | 21 | Runtime-backed or accepted executable capability |
| `PARTIAL` | 4 | Meaningful foundation exists, but the canonical contract or binding is incomplete |
| `PLANNED` | 4 | No accepted runtime implementation |

The eight remaining entries are `evidence_normalization`,
`document_change_analysis`, `earnings_call_analysis`,
`financial_model_build_update`, `model_audit`, `comps_valuation`,
`valuation_crosscheck`, and `research_qc`.

`docs/product/` and `docs/project-management/` are absent in this checkout.
They are treated as missing governance inputs, not invented product
requirements. The project-state ledger also contains an older 17/7/5 catalog
snapshot; the executable catalog and accepted W4 reports are authoritative for
this audit.

## Product mission matrix

Ratings below describe implementation readiness at the accepted baseline. They
do not imply authenticated provider, model, transcript, or continuously fresh
external-data readiness.

| Mission | Rating | Evidence | Material gap | External readiness |
|---|---|---|---|---|
| Company Research | `USABLE_WITH_GAPS` | Company/industry depth, expectation gap, thesis formalization, Gateway and deterministic replay are covered by the focused company suites. | The company Workflow does not compose valuation, red-team, catalyst, and full lifecycle outputs into one complete research mission. | Provider-dependent; authenticated external acceptance remains separate. |
| Earnings Review | `USABLE_WITH_GAPS` | PIT expectations, actual-vs-expectation, guidance, revisions, financial quality, durable gates, and degradation are covered. | No transcript/Q&A acquisition or `earnings_call_analysis` implementation exists, limiting qualitative “why” analysis. | Eastmoney expectation-source track is closed with real evidence, but rolling forecast horizon and unavailable consensus cases remain explicit. |
| Industry Research | `CORE_READY` | Eight-module industry workflow, structure/cycle/competition semantics, bounded evidence, replay, contradiction handling, and Gateway tests pass. | Provider coverage and authenticated external freshness remain operational concerns, not a missing core contract. | `USABLE_WITH_GAPS` until provider-specific acceptance is exercised in the target environment. |
| Valuation | `USABLE_WITH_GAPS` | PE/PB/EV/EBITDA, scenario and reverse-DCF arithmetic, PIT basis, report sections, and rejection diagnostics are implemented. | DCF remains deferred in the v1 product path; comparable-set identity/evidence binding is incomplete; cross-check logic is Workflow composition rather than a standalone canonical Skill. | Structured market/financial inputs are feasible; provider/schema instability must remain fail-closed. |
| Event Research | `CORE_READY` | CNINFO/GDELT company-bound event workflow, two-stage bounded synthesis, source roles, strict dates, refs, Gateway behavior, and cancellation are covered. | Generic version-to-version document change is not available; it is not required for the anchored event path. | Source availability and coverage remain explicit per run. |
| Thesis Lifecycle | `USABLE_WITH_GAPS` | Formalize, expectation gap, red-team, catalyst map, refresh, deterministic lifecycle, and bounded proposals are implemented. | Continuous monitoring needs stronger cross-domain QC and versioned evidence acquisition; it is not equivalent to a scheduled autonomous monitor. | Freshness depends on source acquisition and is not guaranteed by the lifecycle contract. |
| Daily Intelligence | `USABLE_WITH_GAPS` | Bounded signals, deduplication, ranking, unavailable sections, catalyst/expectation/thesis integration, and report durability are covered. | Cross-domain QC and provider coverage are not yet one terminal, reusable quality contract. | Community coverage is intentionally noncanonical and provider gaps remain explicit. |

## Evidence used

Focused audit suites passed with zero failures:

| Area | Tests passed | Coverage represented |
|---|---:|---|
| Company | 19 | Company Skill, deep research Workflow, application services, deterministic replay and bounded Knowledge/report behavior |
| Earnings | 114 | Expectations, financial quality, guidance, earnings Workflow, expectation integration and durable gates |
| Industry | 92 | Industry Skill, supply/demand cycle, competitive map, deep research Workflow, application integration |
| Valuation | 91 | Deterministic calculations, valuation Workflow, valuation runtime route |
| Event | 49 | Event Skill/Workflow and runtime route |
| Thesis and Daily | 52 | W4 semantic ownership, thesis lifecycle, red-team, daily intelligence and plugin bounds |
| **Total** | **417** | All commands passed; the full regression was not re-run by this audit |

Accepted W4 and expectation-source reports additionally provide the previous
full regression and real-source evidence. Fixture/offline tests are not
presented as authenticated model or provider E2E.

## Cross-domain quality risks

1. A report can contain strong local Skill outputs while the selected company
   Workflow still omits valuation, red-team, catalyst, or full lifecycle
   composition.
2. Comparable arithmetic is deterministic, but peer identity, period, unit,
   source, and rejection evidence are not yet a single canonical input/output
   contract.
3. `research_qc` appears in Workflow mappings, but its current meaning is
   distributed across validators, Gateway checks, report validation, and
   terminal gates rather than one reusable canonical Skill.
4. Forecast, PIT, source attribution, and unit compatibility can be checked
   locally without proving that expectation, valuation, thesis, catalyst, and
   report artifacts agree across a complete run.
5. External provider emptiness and schema drift are correctly modeled in many
   paths, but no new capability may convert unavailable data into synthetic
   success.

## Data feasibility

| Candidate | Feasibility | Evidence-based conclusion |
|---|---|---|
| Comparable valuation | `MEDIUM` | AKShare/Eastmoney market and financial inputs plus deterministic arithmetic exist; peer selection, PIT comparability, source refs, and rejection contract are missing. |
| Research QC | `HIGH` for deterministic checks | Existing validators, PIT checks, source refs, Gateway, Writer and report gates are reusable; the missing work is composition and typed diagnostics. |
| Document change analysis | `MEDIUM/LOW` | Parsers and raw/provenance inputs exist, but stable paired-version identity and comparable publication history are not guaranteed. |
| Earnings call analysis | `LOW/BLOCKED` | No transcript/Q&A source implementation or transcript source contract exists in the current provider stack. |
| Financial model build/update | `MEDIUM/LOW` | Historical and point-in-time inputs exist, but a complete three-statement forecast/model graph is not present and free-source completeness is uncertain. |
| Model audit | `LOW now` | It depends on a durable model graph and model-build contract that do not exist yet. |

## Current architecture decision

The next useful slice is not a new Agent Runtime, Planner, generic Provider
layer, vector store, or Knowledge Schema. Workflow remains the deterministic
composition and terminal-gate owner; Skill remains professional methodology;
Plugin remains external capability integration; Gateway/Writer remain the only
canonical Knowledge mutation path.

