# RHL-TL-001 Implementation Contract Amendment

Date: 2026-09-24

Status: SOL REVIEWED FOR IMPLEMENTATION
Scope: narrow corrections to `2026-09-24-thesis-lifecycle-product-closure-v0.1.md`.

The TL-001 product journey and Knowledge v0.4 model remain binding. This
amendment supersedes only the incompatible operational contract details below.
It does not authorize a generic review framework or a second Knowledge writer.

## Contract conflicts found during Sol review

1. `ReviewCase.impact.affectedProposalRefs` must equal the IDs of suspended
   dependent proposals. Canonical `claim:` references are neither proposal IDs
   nor safe proposal path segments. They cannot be placed in that field as the
   TL-001 design suggests.
2. The v0.1 ReviewCase Claim payload validator accepts only v0.3 Claim types.
   TL-001 propositions can map to v0.4 `assumption` and `catalyst`; coercing
   either to `fact` would misstate the reviewed proposition.
3. `raw_document_block` describes a document block. A real archived research
   source can have a Raw reference without a document block. Synthesizing a
   document/block ID from a proposal ID is not truthful evidence binding.
4. The Gateway currently derives proposal evidence only from source candidates
   in the current submission. A reviewed action using an existing canonical
   Observation or Claim must be able to reuse its actual Source/Raw binding.
5. ResearchReport does not yet accept `thesis_lifecycle` or `thesis:` subjects.
6. A Writer commit can succeed before the adjacent ReviewDecision or report is
   finalized. Replay must reconcile that crash window against the v0.4 Writer
   execution log and current canonical state.

## Narrow Thesis ReviewCase context

Add an optional `thesisScope` to ReviewCase, valid only for a v0.4
`thesis_lifecycle` producer and a Claim root proposal:

```text
thesisScope: {
  thesisRef: canonical Thesis ref,
  rootClaimRef: exact reviewed canonical Claim ref,
  affectedClaimRefs: bounded unique canonical Claim refs,
  evidenceRefs: bounded unique canonical Observation/Claim refs,
  reviewedEvidence: bounded entries {
    evidenceRef: canonical Observation/Claim ref,
    relation: ThesisRefresh evidence relation,
    targetClaimRefs: bounded canonical Claim refs
  },
  candidateTransition: ThesisRefreshTransition,
  asOf: ISO timestamp,
  proposedThesisStatus?: ThesisStatusV04
}
```

The root proposal retains its existing local `proposalId`. The affected
canonical refs live only in `thesisScope`. `impact.affectedProposalRefs` keeps
its existing meaning: IDs of dependent proposals in the suspended bundle.
`rootClaimRef` must belong to `affectedClaimRefs`; it prevents ACCEPT from
rebinding an equivalent but different Claim. The selected Thesis, Claim
membership edges, and evidence refs are re-resolved
from current Knowledge before every decision. The stored scope is a review
request, not mutation authority. `reviewedEvidence` records the exact
evidence-to-proposition interpretation being reviewed so ACCEPT can rebuild
and revalidate the action after restart. Its evidence and target references
must belong to the bounded scope, and the producer must verify that the
current canonical evidence still supports the recorded interpretation.
One refresh run produces one aggregate Thesis case for its changed Claims;
this keeps the proposed Thesis status and reviewed edges atomic when evidence
affects more than one proposition.

For v0.4 cases only, permit v0.4 Claim types in the Claim-root semantic payload
and require `semanticType === claimType`. Existing v0.3 ReviewCases and their
validator behavior remain readable and unchanged. No Claim type fallback is
allowed for `assumption` or `catalyst`.

## Truthful research evidence binding

Add a ReviewEvidenceBinding variant for canonical research evidence:

```text
{
  kind: 'canonical_research_evidence',
  sourceRef: canonical Source ref,
  rawRef: actual archived Raw ref,
  evidenceRef?: canonical Observation/Claim ref,
  locator?: bounded source locator
}
```

The thesis producer must prove that the Source exists, is active and eligible,
contains `rawRef`, and that the Raw archive exists. If `evidenceRef` is present,
its source/provenance must bind that Source and Raw pair. A missing binding
fails closed with `REVIEW_EVIDENCE_BINDING_UNAVAILABLE`. Existing
`raw_document_block` bindings keep their original document-ingestion meaning.

## Existing canonical Source use in Gateway

Add a producer-only, bounded `existingEvidenceBindings` on a semantic proposal,
containing explicit `{ sourceRef, rawRef }` pairs. The Gateway must resolve
each pair from the current revision, verify active Source lifecycle, Source
rights and usage policy, the Source's `rawRefs`, and archived Raw existence.
It then combines verified existing pairs with current-submission source
candidates for Claim provenance and edge `sourceRefs`. It must reject invalid
pairs before Writer, never infer a Raw ref from a URL, and never let an HTTP/Pi
client submit these producer contracts directly. This is distinct from the
existing canonical ReasoningEdge endpoint fields in the TL-001 design.

The normal Source write must retain explicit retention, AI-processing, and
derivative-knowledge permissions from `NormalizedResearchSource.rights`. The
previous Gateway Source constructor stored these values as `null`, which made
normal persisted Sources ineligible for a later evidence-backed refresh. New
admissions with denied permissions fail before Raw archiving; an explicit
existing denial is not loosened by a later acquisition. `providerTermsKnown`
remains false unless separately proven, since the normalized source contract
does not assert it.

## Durable decision and crash recovery

ACCEPT first writes a compare-and-write protected `APPLYING` intent in the
adjacent decision record. The intent contains the case hash, decision payload
hash, observed Knowledge revision, deterministic Writer workflow run ID, and
expected canonical result checks. This is operational state, not Knowledge.

After the Gateway/Writer returns, reload canonical Knowledge and verify the
scoped result before appending `ACCEPTED`. On retry or process restart:

- If the Writer execution log for that workflow run exists and the current
  canonical state satisfies the stored result checks, finalize `ACCEPTED`
  without a second semantic write.
- If no Writer log exists and the reviewed current state still matches the
  intent's base revision and bindings, safely retry the same deterministic
  command.
- If neither condition holds, record `STALE` or a recoverable failure with no
  new semantic write. Never infer success only from a changed revision.

The decision record is serialized under the Review storage lock, and its
revision/hash is checked on every transition. A concurrent request that finds
`APPLYING` must reconcile or return an in-progress state; it must not launch a
second Writer command. REJECT and DEFER remain no-write decisions. The public
states are OPEN, DEFERRED, ACCEPTED, REJECTED, and STALE; APPLYING is an
internal recovery state.

## Known blocker: kill-criterion canonical binding (`DESIGN_SCHEMA_GAP`)

The current Knowledge v0.4 Thesis and Claim contracts do not persist a
precommitted kill-criterion definition, and the REFRESH adapter currently has
no canonical criterion input to pass back to `refreshThesis()`. A ReviewCase
met assessment (condition ID, targets, evidence refs, and rationale) therefore
cannot be authoritatively rebound to a current criterion or re-evaluated from
current Knowledge at ACCEPT. Do not infer a threshold from Claim text, trust
the stored `met` assessment as mutation authority, or write Thesis
`invalidated`. The product builder must fail closed with an explicit
criterion-source diagnostic, and the decision service must fail closed if an
invalidation case is nevertheless persisted. Enabling this path requires a
design decision for the canonical criterion definition and its revision,
provenance, and refresh-input binding; this amendment does not create a new
Knowledge writer or store.

## Report contract

Add `thesis_lifecycle` to the report type union and accept canonical `thesis:`
subject refs for this report. Preserve the existing report validator's source,
claim, date, run ID, section, and output-path checks. Store the before/after
state, PIT decisions, unchanged refs, deltas, ReviewCase/decision status,
Writer run/revision, and error diagnostics. A completed action must have a
durable report or an explicitly recoverable report-write failure; it cannot
claim an invisible successful decision.

## Implementation order

1. Existing canonical edge endpoint support and focused Gateway tests.
2. Thesis ReviewCase context/evidence contract and decision-aware storage.
3. Existing canonical Source/Raw evidence reuse in Gateway.
4. REFRESH-first snapshot/PIT/refresh adapter, review proposal builder, and
   durable decision service, including crash recovery.
5. Small CREATE path using the same Thesis/Claim/`qualifies` convention.
6. ResearchService, report, HTTP, Pi, and client interaction.
7. Deterministic integration/restart/replay tests, followed by a real
   configured-Pi accepted-source attempt and truthful acceptance classification.

The TL-001 acceptance gate still applies. An unavailable external provider or
Pi host must be reported as an external E2E blocker, not replaced with fixture
evidence or described as product completion.
