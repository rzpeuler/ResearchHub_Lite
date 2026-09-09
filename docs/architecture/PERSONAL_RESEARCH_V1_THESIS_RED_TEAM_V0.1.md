# Personal Research v1 — Thesis Red Team v0.1

Status: `IMPLEMENTED / CTO ACCEPTANCE PENDING`

Task identity: `RHL-PERSONAL-RESEARCH-V1-M3A-THESIS-RED-TEAM-001`

## 1. Purpose and boundary

Thesis Red Team is an adversarial research vertical for one existing active
canonical Thesis owned by one existing canonical Company. It tests what would
have to be false for the Thesis to fail, seeks disconfirming evidence, records
alternative explanations and failure cases, and calibrates resilience. It is
not a bearish-output generator and does not directly update, supersede, delete,
change the lifecycle of, or replace the target Thesis.

The product path is:

```text
Pi / HTTP
  -> ResearchService.startThesisRedTeam
  -> Thesis Red Team Workflow
  -> exact Company and active Thesis resolution
  -> bounded dependency and recent Signal projection
  -> thesis_attack_design (Stage A)
  -> targeted CNINFO/GDELT acquisition
  -> thesis_red_team_synthesis (Stage B)
  -> deterministic evidence/verdict/proposal gates
  -> KnowledgeProductionGateway / Writer
  -> thesis_red_team ResearchReport
```

Daily ranking, clustering, brief synthesis, Company auto-research, historical
Knowledge replay, generic graph traversal, and new providers are outside this
vertical. There is no canonical `RedTeamResult`, `ThesisReview`, or Thesis
state object.

## 2. Resolution and current-state semantics

Input is a bounded `workflowRunId`, six-digit A-share `symbol`, optional Company
identity fields, mandatory `thesisRef` matching `^claim:[^\\s]+$`, and
`lookbackDays` bounded to 30..1095 with default 365. The workflow resolves
exactly one Company by ticker plus exchange and exactly one active Claim of
`claimType=thesis` whose subjectRefs contain that Company. Missing, ambiguous,
wrong-company, wrong-type, or inactive inputs block before reasoning and
acquisition; no Thesis is fuzzy-selected.

The workflow-local `thesisFingerprint` is derived only from canonical Company
ref and target Thesis ref, with a deterministic `thesis-<24 hex chars>` form.
It excludes run ID, current date, statement wording, and model output. The
workflow reads current canonical Knowledge only. `asOf` is the current workflow
time; `lookbackDays` controls external evidence acquisition only.

## 3. Read-only Knowledge and Signal projections

The only Gateway change is additive read-only exposure from
`projectExistingKnowledge()`: lifecycle, confidence, probability,
supportsClaimRefs, dependsOnClaimRefs, contradictsClaimRefs, supersedes, and
supersededBy. Gateway submit, identity, resolution, ChangeSet, ReviewCase, and
Writer behavior remain unchanged.

The workflow projects the target Thesis, direct outgoing links, direct incoming
Company Claims, and one additional bounded dependency hop. It caps the result
at 40 Claims and prioritizes the Thesis, direct assumptions, supporting and
contradicting Claims, risks, catalysts, facts, viewpoints, forecasts, and
trends. It never traverses unrelated Companies or performs generic graph
search.

Recent `FileDailySignalStore` context is optional, exact-Company only, limited
to the last 30 days and 20 signals, and contains only bounded IDs, titles,
excerpts/narratives, dates, category, and provider. Signals are context, never
evidence and never canonicalized.

## 4. Two-stage reasoning

Stage A operation `thesis_attack_design` receives Company identity, exact
Thesis, bounded dependency projection, existing assumptions/risks/catalysts,
and supporting/contradicting Claim refs. It receives no newly acquired
external evidence. Its contract returns 1..8 attack vectors, 0..6 implicit
assumptions, and 1..6 invalidation conditions with exact Claim allowlists,
bounded safe IDs, questions, mechanisms, evidence needs, and search terms.
Code owns validation and the maximum one repair. Invalid fallback produces an
explicit research gap and no fabricated vectors or durable proposals.

Stage B operation `thesis_red_team_synthesis` receives the exact Thesis,
projection, Stage A design, bounded external evidence, recent Signal context,
and exact reference allowlists. Its semantic core returns evidence assessments,
challenge assessments, a verdict, and interpretations. Proposal candidates are
validated independently after the semantic core. A malformed candidate cannot
invalidate valid attack reasoning; candidate failure only closes the durable
persistence gate.

Evidence relations are `disconfirms`, `supports`, `context`, or `irrelevant`.
Code derives strong disconfirmation from a current official disclosure or two
independent provider/domain identities. Challenges explicitly cover
assumption failure, contradiction, causal breaks, alternatives, failure cases,
risk escalation, invalidation conditions, evidence gaps, and resilience.
Hypothesis challenges are report-only. Durable challenges require verified
evidence or bounded inference, exact refs, and explicit causal chains where
applicable. Numeric statements not grounded in accepted evidence are rejected.

Verdict consistency is code-owned: `inconclusive` cannot claim material impact;
`weakened` requires a material challenge; `materially_challenged` requires a
supported high/critical challenge; and `invalidation_condition_met` requires a
matching condition and strong disconfirming evidence. The model cannot declare
strong verification.

## 5. Durable gate and immutability

Code owns deterministic slots for the Red Team verdict, risk, and alternative
viewpoint, plus structured updates to existing assumptions. No slot uses a
Thesis-specific semantic key. Assumption updates preserve every existing
structured field except the value. The target Thesis hash, lifecycle, source
refs, and claim identity must remain unchanged. No Thesis proposal is ever
submitted.

Only accepted proposal-referenced external evidence reaches Gateway. Unused,
irrelevant, manual-anchor, Daily Signal, and unknown-date context cannot become
canonical evidence. The report is code-assembled with exactly 16 frozen
sections, precise provenance, subjectRefs containing Company and Thesis, and
`reportType=thesis_red_team`.

## 6. Integration and validation

The implementation adds the shared ResearchService entrypoint, Pi
`red_team_thesis` action, and HTTP route through the existing Workflow path.
It adds focused contract/workflow regressions, a pure deterministic Real Pi
gate helper, a real Pi E2E harness using `PiReasoningExecutor` and fresh Schema
0.4 / Storage 1 Knowledge, a separate non-blocking CNINFO/GDELT smoke, and a
row-level evidence matrix. No Schema, Writer, frontend, scheduler, queue,
Graph DB, Vector DB, RAG, provider framework, or multi-agent orchestration is
introduced.

Acceptance requires the real Pi path to execute with valid Stage A/B output,
disconfirming evidence, alternative and failure analysis, affected existing
Knowledge, a non-inconclusive verdict, at least one accepted durable proposal,
unchanged Thesis and Company integrity, no Signal/irrelevant canonicalization,
and a persisted 16-section report. Provider availability remains separately
reported and non-blocking unless a deterministic application defect is found.
