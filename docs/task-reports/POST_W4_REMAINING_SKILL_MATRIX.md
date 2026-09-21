# RHL-POST-W4-001 Remaining Skill Matrix and Dependency Map

Status: `AUDIT_COMPLETE / SOL REVIEW PENDING`

## Remaining Skill evaluation

| Entry | User value | Reuse | Error risk | Data feasibility | Cost | Recommendation |
|---|---|---|---|---|---|---|
| `evidence_normalization` | High, but infrastructural | Very high | High if PIT/source identity is lost | High; acquisition normalizers already exist | S/M | `RECLASSIFY_TO_INFRASTRUCTURE` |
| `document_change_analysis` | High for event, earnings, daily and thesis freshness | High | High when versions are incomparable | Medium/Low | M/L | P1 only as a narrow paired-disclosure capability |
| `earnings_call_analysis` | High for qualitative earnings explanation | Medium/high in earnings season | High if transcript provenance is weak | Low/blocked | L/XL | P1 data-gated; do not issue without a stable source |
| `financial_model_build_update` | High for advanced valuation | Reusable after model foundation | Very high | Medium/Low | XL | P2 / defer |
| `model_audit` | Medium/high after a model exists | Reusable across model workflows | High | Low now | M/L | P2 / depends on model build |
| `comps_valuation` | High and frequent in valuation | High across valuation and company research | High | Medium | M | P0 |
| `valuation_crosscheck` | Medium/high as a quality step | High, but inherently compositional | Medium/high | High using existing outputs | S/M | `RECLASSIFY_TO_WORKFLOW` |
| `research_qc` | Critical across every mission | Very high | High | High for deterministic checks | M/L | `RECLASSIFY_TO_WORKFLOW` |

## Reclassification review

### `evidence_normalization`

The repository already has acquisition contracts, normalized source
structures, provider outcomes, content hashes, timestamps, rights metadata and
source diagnostics. Treating normalization as a canonical research Skill would
blur the Plugin/Workflow boundary and make the catalog claim a semantic
capability where the durable value is shared infrastructure. Recommendation:
`RECLASSIFY_TO_INFRASTRUCTURE`; do not promote it as a standalone Skill.

### `valuation_crosscheck`

Cross-checking consumes DCF, reverse-DCF, scenario and comparable outputs. The
valuation Workflow already renders a secondary-method cross-check section and
owns the deterministic comparison. Recommendation:
`RECLASSIFY_TO_WORKFLOW`; retain it as a Workflow-owned composition and
quality step, not an independently executable semantic Skill.

### `research_qc`

QC is mapped into all major Workflows and is already partly implemented by
validators, PIT checks, source references, Gateway validation, report
validation and terminal gates. A standalone Skill would duplicate ownership
and weaken the deterministic Workflow boundary. Recommendation:
`RECLASSIFY_TO_WORKFLOW` as a reusable terminal gate with typed diagnostics.
This is a P0 quality workstream without increasing the canonical Skill count.

## Dependency graph

```text
Plugin acquisition / normalized sources
              |
              +--> PIT, period, unit and source-reference validators
              |                  |
              |                  +--> comps_valuation (peer set + arithmetic)
              |                  |          |
              |                  |          +--> valuation_crosscheck [Workflow]
              |                  |
              |                  +--> document_change_analysis [conditional]
              |                  |          +--> event / earnings / daily / thesis
              |                  |
              |                  +--> earnings_call_analysis [source-gated]
              |
              +--> financial_model_build_update [deferred]
                                     |
                                     +--> model_audit [deferred]

All Workflow outputs
        |
        +--> research_qc [Workflow terminal gate]
                 |
                 +--> report / Knowledge proposal / Writer eligibility
```

`comps_valuation` can proceed with the QC gate in one bounded Wave 5 because
its arithmetic foundation exists and the gate supplies the required evidence
and compatibility checks. `earnings_call_analysis` is independent in code but
blocked by source availability. `model_audit` cannot be meaningfully started
before `financial_model_build_update`. The three reclassification candidates
should be decided before adding more catalog entries.

## Priority classification

### P0

- `comps_valuation`: close the peer-set evidence contract around existing
  deterministic calculations.
- Workflow-owned `research_qc`: establish one reusable terminal gate for
  evidence refs, PIT/period/unit compatibility, forecast-to-valuation basis,
  expectation-to-thesis/catalyst consistency, and final artifact integrity.

### P1

- `document_change_analysis`, only for attributable and comparable pairs of
  official disclosures.
- `earnings_call_analysis`, only after a stable transcript/Q&A source,
  rights/provenance contract, and deterministic unavailability behavior are
  accepted.

### P2 / defer

- `financial_model_build_update` until a bounded model scope and sufficient
  complete inputs are approved.
- `model_audit` until the model graph and build/update contract exist.

### Reclassify / drop as canonical Skill

- `evidence_normalization` -> infrastructure.
- `valuation_crosscheck` -> Workflow composition.
- `research_qc` -> Workflow terminal gate.

