# RHL-POST-W4-001 Wave 5 Roadmap Recommendation

Status: `AUDIT_COMPLETE / SOL REVIEW PENDING`

## Recommended Wave 5

### Wave name

`High-Confidence Comparable Valuation and Cross-Workflow Quality Gate`

### Scope

1. Promote only `comps_valuation` as the canonical semantic capability.
2. Build the missing peer-set evidence contract around the existing
   deterministic comparable arithmetic.
3. Reclassify and implement `research_qc` as a Workflow-owned terminal gate;
   it is not a new canonical Skill.
4. Keep `valuation_crosscheck` as Workflow-owned composition and make its
   inputs/diagnostics explicit; do not promote it as a standalone Skill.

### Why this is the best next slice

It closes the most visible current valuation gap using an existing arithmetic
foundation, has medium but demonstrated free-data feasibility, and improves
quality across valuation, company research, thesis and daily outputs. It is a
small dependency-coherent slice rather than a broad catalog expansion.

### Recommended acceptance boundary

- Peer identity, exchange, period, unit, source reference and retrieval basis
  are explicit and validated.
- Peer selection is attributable and deterministic; no synthetic peers or
  invented metrics are allowed.
- Comparable methods expose accepted inputs, rejected peers, reasons for
  rejection, and calculation basis.
- PIT rules prevent post-cutoff data from entering a historical valuation.
- Implied equity/value arithmetic remains code-owned and finite-number
  checked.
- Workflow-owned QC checks source references, PIT/period/unit compatibility,
  forecast-to-valuation compatibility, expectation-to-thesis/catalyst
  consistency, and report/Knowledge proposal integrity.
- Missing or conflicting evidence produces typed fail-closed diagnostics.
- No new Agent Runtime, Planner, generic Provider layer, vector database,
  Knowledge Schema, frontend canonical write path, or synthetic success.
- Fixture tests, provider diagnostics, and authenticated external readiness
  are reported separately.

### Expected catalog effect

This audit recommends, but does not perform, the following governance change:

- `comps_valuation`: `PARTIAL` -> `IMPLEMENTED` after acceptance.
- `research_qc`: remain a catalog reference only or be removed from the
  canonical Skill list after formal reclassification to Workflow.
- `valuation_crosscheck`: formal reclassification to Workflow.
- `evidence_normalization`: formal reclassification to infrastructure.

The canonical Skill count should not increase by counting QC or cross-checking
as new semantic Skills.

## Alternative Wave 5

### Earnings Context and Versioned Evidence (conditional)

Issue this alternative only if a stable, permitted transcript/Q&A source is
available and can provide attributable publication timestamps, company
identity, transcript boundaries, and deterministic unavailable behavior.

- `earnings_call_analysis`: retain as a Skill and implement bounded transcript
  extraction, question/answer attribution, and evidence references.
- `document_change_analysis`: add only if paired official versions have stable
  identity and comparable publication metadata; otherwise defer it.
- Keep `research_qc` as the Workflow terminal gate regardless of the chosen
  alternative.

Without the source trigger, this alternative is not ready for an execution
taskbook. Existing filings, guidance, estimate revisions and actual-vs-
expectation analysis are useful substitutes but do not constitute transcript
analysis.

## Explicit deferrals

- Do not build a full three-statement financial model in Wave 5.
- Do not build `model_audit` before a durable model graph exists.
- Do not build a generic document crawler/diff engine without paired-source
  evidence.
- Do not add a transcript Skill without an accepted source and rights boundary.
- Do not promote normalization, cross-checking, or QC into independent
  semantic catalog entries merely to increase implementation counts.

