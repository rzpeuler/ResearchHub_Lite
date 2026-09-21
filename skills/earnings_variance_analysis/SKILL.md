# Earnings Variance Analysis

## Purpose

Explain how reported actual results differed from eligible expectations or the
prior comparable period.

## Invocation Match

Use this Skill when the question asks why revenue, profit, or a KPI beat/missed
consensus or changed versus the prior comparable period. Do not use it for
forward management guidance or for historical estimate revisions.

## Typical Intents

- “Why did this quarter’s revenue beat consensus?”
- “Which segment caused the earnings surprise?”

## Inputs

Exact fiscal period, reported actuals, prior comparable actuals, eligible
point-in-time consensus, segment/KPI values, units, publication cutoff, and
source references.

## Produces

Metric-level variance results, segment/KPI contribution diagnostics, evidence
bindings, availability status, and bounded report material.

## Methodology

Align actual, prior, and consensus to the same metric and fiscal period; compute
absolute and percentage deltas deterministically; attribute only supplied
segment/KPI movements; separate unknown drivers from negative findings; and
preserve the distinction between reported fact and interpretation.

## Evidence Requirements

Actuals require attributable period evidence. Consensus must satisfy the
point-in-time rules of `consensus_expectations_analysis`; segment evidence must
bind to the reported period.

## Deterministic / Model Boundary

Code owns matching, arithmetic, sign conventions, and reference validation. The
model may synthesize causal language only from accepted deltas and evidence.

## Missing Data

Missing actual, prior, or consensus data is `unavailable`; it is not zero or an
inferred surprise. Unsupported driver attribution is a research gap.

## Validation / QC

Check period identity, units, finite values, source refs, and that a reported
variance does not use a later consensus snapshot.

## Related Skills

`consensus_expectations_analysis`, `guidance_analysis`, and
`financial_quality_analysis` are peer Workflow steps, not nested calls.
