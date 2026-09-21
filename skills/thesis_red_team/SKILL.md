# Thesis Red Team

## Purpose

Adversarially test one active thesis using bounded supporting and disconfirming
evidence, explicit failure conditions, and evidence-qualified challenges.

## Invocation Match

Use this Skill when the user asks where an investment thesis may be wrong, what
would falsify it, or which evidence most threatens it. Do not use it to compose
an entire Thesis Lifecycle or to update canonical Thesis state directly.

## Typical Intents

- “Where is this investment logic most likely to fail?”
- “What evidence would falsify the thesis?”

## Inputs

Exact company and canonical thesis claim, bounded dependency projection,
lookback window, signals, acquired evidence, point-in-time cutoff, and source
references.

## Produces

Attack vectors, implicit assumptions, invalidation conditions, qualified
supporting/disconfirming evidence, challenge assessments, bounded report
sections, categorical thesis-fragility assessments, executable kill-criterion
evaluations, and admissible local proposal candidates.

## Methodology

Resolve exactly one active thesis; design falsification questions before
assessment; qualify evidence by source, date, relevance, and corroboration;
separate challenge from verdict; and let deterministic gates decide whether a
proposal is admissible.

## Evidence Requirements

Evidence must be bounded to the company, thesis, and lookback window. Dates,
source IDs, canonical thesis refs, and local proposal refs are validated.

## Deterministic / Model Boundary

The model may design attacks and bounded interpretations. Code owns identity,
reference, date, evidence qualification, proposal admissibility, and Gateway
authority. Fragility is categorical (`critical`, `high`, `medium`, `low`, or
`insufficient_evidence`); the Skill does not invent a numeric confidence score.

## Executable Kill Criteria

An invalidation condition may declare an observable metric, operator, threshold,
period, deadline, source requirement, and threshold source references. A
threshold must be traceable to supplied sources or remain explicitly pending;
the Skill never invents a threshold. Deterministic evaluation may report
`pending`, `met`, `missed`, `expired`, or `insufficient_evidence`, and does not
mutate canonical Thesis state.

## Missing Data

Missing thesis, dependencies, or qualifying evidence produces an explicit gap or
`unavailable` challenge; it never becomes a fabricated contradiction or verdict.

## Validation / QC

Reject forged refs, out-of-window evidence, unsupported dates, unresolved local
links, canonical-looking local IDs, and proposals without qualified support.

## Related Skills

`thesis_formalize`, `expectation_gap`, `catalyst_map`, and `thesis_refresh` are
peer lifecycle methods selected by a Workflow, never invoked here.
