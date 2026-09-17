# Unified Research Entry Mission — Implementation Plan

**Design:** `docs/superpowers/specs/2026-09-17-unified-research-entry-design.md`  
**Date:** 2026-09-17  
**Execution:** sequential bounded slices; do not declare mission completion
until the complete acceptance matrix is verified.

## Working rules

- Preserve unrelated worktree changes and do not reset or overwrite unknown
  files.
- Keep Workflow deterministic execution, Skill methodology, Plugin integration,
  and Knowledge Gateway/ChangeSet/Writer authority separate.
- Reuse existing domain contracts and execution paths. Adapters may normalize
  them; they must not duplicate domain logic or weaken existing evidence gates.
- Treat Raw storage as original-document authority. Derived Source Library data
  must be rebuildable and disposable.
- Never let a model response directly choose a canonical mutation or bypass
  request policy, schema validation, Gateway, or Writer.
- Every slice gets focused tests before the next slice. Full tests and current
  state documentation are required before the mission terminal audit.

## Slice 0 — Baseline and architecture inventory

### Task 0.1: Capture baseline

Inspect and record current branch, HEAD, worktree, package scripts, test totals,
typechecks, client build, and parser preflight where applicable. Run the
existing focused Chat/runtime/report/workflow tests before changing behavior.

Expected evidence:

- clean-or-explained worktree state;
- baseline output saved in the task report, not represented as a claim without
  command output;
- list of existing routes, services, workflow entry points, Raw storage APIs,
  report model, and Pi tool registrations.

### Task 0.2: Confirm authoritative extension points

Use current source as authority for:

- `app/services/contracts.ts`, `research-service.ts`, `workflow-service.ts`,
  `research-report.ts`, `production-service.ts`;
- `app/runtime/contracts.ts`, `application-runtime.ts`, `server.ts`;
- `app/pi/tools.ts`, `session-runtime.ts`, and `system-prompt.ts`;
- `client/src/App.tsx`, `client/src/api/runtime-client.ts`, and
  `client/src/app/run/ResearchRunPage.tsx`;
- `workflows/**`, `skills/**`, `knowledge/raw/**`, and existing tests.

Do not start implementation until each new module has an existing owner and
dependency boundary.

## Slice 1 — Contracts, definitions, registries, and dispatch core

### Task 1.1: Add typed request and decision contracts

Add a focused application contract module, preferably
`app/services/research-dispatch-contracts.ts`, containing:

- `ResearchRequest` with free/explicit mode, query, optional attachments,
  `contextPolicy`, and `persistencePolicy`;
- `ResearchDispatchDecision` v1 and its entity, selected-workflow, selected-
  skill, missing-input, and execution-summary types;
- validated policy defaults and bounded error types;
- request/decision validators that reject unknown unsafe values, invalid
  workflow IDs, non-finite confidence values, and malformed argument objects.

Use runtime schema validation consistent with the repository’s existing
TypeScript/validation style. Keep the model output as an untrusted input to the
validator.

Tests:

- default policy is Knowledge read/search on and write off;
- explicit values survive normalization exactly;
- invalid requests and decisions fail closed;
- decision output cannot enable a policy that the request disabled.

### Task 1.2: Add authoritative Workflow Definition Registry

Create a registry module under `app/services` or `workflows` that exposes the
current user-facing research definitions. Each definition contains ID, label,
intent description, input schema/validator, required inputs, output contract,
Knowledge effects, and an adapter reference.

Register existing Company Research, Industry Research, Earnings Review,
Valuation, Event Research, Thesis Red Team, and applicable Daily Intelligence
definitions from the real service/workflow entry points. Do not create a second
frontend-only list. Expose read-only definitions for API and Pi/application
consumers.

Tests:

- every selector item comes from the registry;
- all six core workflow IDs map to callable adapters;
- required input and schema metadata agree with server validation;
- adding a fixture definition makes it discoverable without editing client
  option code;
- no stale duplicate list remains in the client.

### Task 1.3: Add Research Skill metadata and registry

Add minimal metadata loaders/definitions for existing ResearchHub skills under
`skills/**`. Classify each core asset as `research`, `knowledge`, or `utility`.
Keep `.pi/skills/` absent/separate if the repository has no such directory; do
not scan Pi assets as ResearchHub skills.

Expose enabled-only research candidates to dispatch. Preserve the existing
skill implementation and documentation; metadata is an adapter, not a
rewrite.

Tests:

- company, industry, earnings, event, valuation, and thesis research skills
  are discoverable as `research` where applicable;
- knowledge curation is `knowledge`;
- utility/Pi-native assets never enter the research candidate set;
- malformed metadata is rejected or disabled with a bounded diagnostic.

### Task 1.4: Implement deterministic argument extraction seam

Add an extraction interface and implementation under `app/services` that accepts
the selected Workflow Definition, natural-language query, bounded Knowledge
projections if enabled, and optional attachments. It returns typed candidate
arguments plus field-level confidence/diagnostics.

The first implementation should use deterministic mappings and bounded semantic
executor calls already supported by the repository. It must validate output
against the selected definition and perform at most the repository-approved
bounded repair. It must cover company symbol/name, fiscal year/period, industry
name, valuation method, event anchor, and thesis reference.

Tests use representative Chinese and English prompts and assert exact parsed
fields, invalid output rejection, bounded repair count, and missing-required-
input reporting.

### Task 1.5: Implement ResearchDispatchService

Add `app/services/research-dispatch-service.ts` with these operations:

1. normalize/validate `ResearchRequest`;
2. explicit mode: resolve only the selected definition and extract/validate
   arguments;
3. free mode: produce and validate `ResearchDispatchDecision` using workflow
   definitions first, then eligible research skills, then free research;
4. carry request policies unchanged into the decision/execution context;
5. return a bounded execution summary and missing-input response;
6. start the existing workflow/application service only after validation.

The service must not implement a new planner, multi-agent runtime, or direct
Knowledge writer. It should depend on existing `ResearchService`, Daily
Intelligence service, `KnowledgeService`, and a narrow executor interface.

Tests:

- existing Workflow wins over a matching Skill in Free Research;
- Skill fallback occurs only when no suitable Workflow exists;
- Free Research fallback is returned when no eligible Skill exists;
- explicit Workflow cannot be changed by resolver output;
- Query Knowledge, Source Library, and Write Knowledge policies are enforced;
- execution summary contains decision metadata but no chain-of-thought.

## Slice 2 — Runtime/API and Chat entry

### Task 2.1: Wire dispatch into application runtime

Extend `ResearchHubApplicationServices` and runtime construction so the
dispatch service receives the existing services and definitions. Keep runtime
startup valid without a mounted Knowledge Base where current behavior permits
Free Research.

Add a runtime route such as `POST /api/research/dispatch` (exact path follows
current naming) that validates the request, returns accepted run/decision or a
bounded missing-input response, and uses the existing workflow tracking and
SSE/event behavior. It must not allow a client-supplied run ID to overwrite an
existing run or bypass server validation.

Add a read-only definitions route such as `GET /api/research/workflows` from
the authoritative registry for the Chat selector.

Tests:

- route request/response contracts and auth/token checks;
- malformed request returns `invalid_input`;
- Knowledge-disabled/source-disabled requests cannot expose those tools;
- explicit and Free Research launch use existing workflow tracking;
- cancellation, failure, and streaming remain intact.

### Task 2.2: Bind context policy at the execution boundary

Ensure dispatch execution carries a request-scoped context object to workflow
adapters. Source Library retrieval is not called or exposed when disabled.
Knowledge reads are bounded and not performed when disabled. Write Knowledge
is an explicit persistence flag, not inferred from workflow selection or model
text.

Where current workflows do not yet support a policy argument, add an adapter
boundary that supplies only allowed context and leaves existing domain behavior
unchanged. Do not silently broaden the existing workflow’s source access.

### Task 2.3: Add Chat composer controls and summary

Update `client/src/App.tsx` and client API types/client methods to:

- load Workflow selector options from the definitions route;
- support Free Research plus explicit Workflow selection;
- default Query Knowledge and Search Source Library on, Write Knowledge off;
- preserve manually changed toggle values across the current request;
- submit a typed ResearchRequest instead of concatenating prompt text;
- render execution mode/workflow/arguments/policies/status summary;
- render missing-input prompts without reverting to the full `/run` form.

Preserve existing conversation command, steering, follow-up, stop, upload,
attachment, navigation, and report/graph/review behavior. Keep `/run`, rename
its visible role to Workflow Console / Advanced Research, and keep precise
parameter control.

Tests:

- selector and toggle defaults;
- user policy changes are submitted exactly;
- explicit Workflow selection is visible and retained;
- summary rendering and missing-input state;
- Chat launch and existing pages’ smoke tests;
- no hardcoded duplicate workflow selector list.

## Slice 3 — ResearchBundle, report, and proposal semantics

### Task 3.1: Define ResearchBundle v1 and adapters

Add a focused structured result module, preferably under
`app/services/research-bundle.ts`, with typed evidence/provenance references
and workflow-specific extension fields where required. Include research run,
workflow, subject, as-of, evidence, entities, relations, claims, theses, risks,
catalysts, gaps, provenance, report model, and Knowledge Proposals.

Add adapters around existing Company, Industry, Earnings, Valuation, Event,
Thesis, and Daily outputs. Preserve existing domain IDs, evidence
qualification, report sections, and telemetry. Do not re-run an LLM against a
Markdown report to reconstruct proposals.

Tests:

- each core workflow produces a conforming bundle fixture from its existing
  structured result;
- evidence/claim/relation provenance is retained;
- report and proposal inputs share the same bundle identity and references;
- no adapter makes report Markdown the semantic source.

### Task 3.2: Derive and persist structured reports

Extend the existing report model/persistence to retain sections, source refs,
claim refs, relation refs, evidence linkage, methodology, as-of, workflow run,
and Knowledge revision/context. Keep Markdown as a derived readable artifact
for compatibility. Add report/proposal links needed for later governed commit.

Update list/detail APIs only as needed; preserve existing report catalog and
Daily Brief behavior.

### Task 3.3: Implement Write OFF and Write ON paths

Write OFF must persist the ResearchBundle/report and Knowledge Proposal, record
that canonical persistence was skipped, and leave canonical content/revision
unchanged. Write ON must send proposals through the existing Gateway,
validation/resolution, ChangeSet, Writer, reload, and validation path.

Add a later-commit service boundary if required so a saved proposal can be
governed without re-running semantic research. It must require explicit
authorization and must not become a direct file mutation route.

Tests snapshot canonical Knowledge before/after Write OFF, verify persisted
proposal/report artifacts, and verify Write ON Gateway/Writer/reload provenance.
Add direct-mutation guards or call-path assertions where the existing test
harness supports them.

## Slice 4 — Source Library over Raw

### Task 4.1: Specify and implement derived index

Add a local, rebuildable Source Library module under `knowledge/raw` or a
clearly owned application service. Read original content only from existing Raw
archives and normalized document data. Store deterministic chunks and index
entries with raw/source/document/page/section/span metadata, content hash,
parser version, and chunker version.

Do not create a second original-document store. Avoid heavyweight vector
dependencies; begin with deterministic lexical/full-text search using existing
runtime capabilities.

### Task 4.2: Add indexing/rebuild/retrieval APIs

Implement idempotent index build, explicit rebuild, bounded search, and
provenance-preserving retrieval. Index files must be safe to delete and
recreate without changing Raw or canonical Knowledge.

Expose retrieval only through a policy-aware Research context boundary. A
retrieval result is an evidence candidate, never a Knowledge mutation.

Tests:

- one Raw original is reused;
- identical input produces deterministic chunks/index entries;
- rebuild produces equivalent results;
- deleting derived index leaves Raw readable;
- retrieval returns expected fragment and full provenance;
- Source Library off denies retrieval at the boundary;
- retrieval cannot mutate canonical Knowledge.

### Task 4.3: Integrate retrieval into dispatch/workflows

When enabled, attach bounded retrieved candidates to the ResearchBundle input
and preserve their source lineage. When disabled, do not retrieve or expose
retrieval tools. Add a real local Raw fixture and a Chat/runtime integration
test proving enabled/disabled behavior.

## Slice 5 — External Skill onboarding

### Task 5.1: Add inspect/classify/security contracts

Create an owned Plugin/application module for external Skill onboarding. Define
source metadata, resolved commit, license, classification (`pi_native`,
`research`, `knowledge`, `utility`, `unsupported`/`unsafe`), permissions,
integration mode, enabled state, and diagnostics.

Inspect local fixtures and GitHub URLs only through bounded, auditable input
handling. Identify supported Pi/ResearchHub formats, inspect dependency and
executable files, and detect shell/subprocess, package install, filesystem
outside workspace, network, credentials, dynamic download, and unknown binary
requirements.

### Task 5.2: Implement install/adapt/register flow

Implement the staged flow: inspect → identify → dependency/permission/license
inspection → classification → compatibility decision → install/adapt →
register → validate. Pin the resolved repository commit and write a provenance
manifest. Never follow upstream HEAD implicitly.

Keep Pi-native installation in Pi scope. Adapt only genuine research-method
assets into ResearchHub Skill metadata. Keep knowledge/utility assets out of
Free Research candidates.

Unsafe/high-permission assets fail closed or return an explicit approval
required result. Safe declaration-only fixtures may complete automatically.

Tests:

- Pi-native, research, knowledge, utility, and unsafe fixtures;
- source/repository/commit/license provenance;
- permission extraction and unsafe refusal/approval boundary;
- research install appears in Research Skill Registry and Free Research;
- utility/Pi assets do not appear in research candidates;
- repeated install with the same pinned commit is idempotent.

### Task 5.3: Add controlled API/UI entry if required

Expose onboarding through an authenticated application boundary only if the
current product surface requires it. Provide inspection/classification result
and approval-required state before any high-risk install. Do not execute an
unreviewed external asset as part of inspection.

## Slice 6 — Integrated validation and acceptance

### Task 6.1: Focused regression pass

Run all new and affected tests by slice. Fix failures at the source and rerun;
do not weaken assertions or convert provider failures into synthetic success.
Verify existing Pi conversation/session, SSE, steering, stop, attachments,
Knowledge search/object/graph, reports, Daily Briefs, Reviews, workflow status,
cancellation, and all six core workflows.

### Task 6.2: Realistic cases A–G

Produce runtime artifacts for:

- A: Chat explicit Earnings Review from natural language, with extracted
  period/company and policy-respecting report/proposal;
- B: Free Research auto-routed to a suitable existing Workflow with summary;
- C: Skill fallback using a research Skill only;
- D: Raw-backed Source Library retrieval on/off with lineage;
- E: Write OFF report/proposal persistence and unchanged canonical revision;
- F: Write ON Gateway/ChangeSet/Writer/reload path;
- G: safe external Skill inspect/classify/register/discover flow.

Fixtures may support deterministic cases. If a case claims real provider or
authenticated Pi execution, record actual runtime evidence and limitations.

### Task 6.3: Full repository checks

Run, from the current package configuration:

```text
npm test
npm run typecheck
npm run client:typecheck
npm run client:build
npm run document-parser:check   # if affected paths or acceptance require it
```

Also run all focused tests, runtime route tests, and E2E scripts added by the
mission. Record exact totals and exit statuses.

### Task 6.4: Documentation/state reconciliation

Update current architecture/engineering/product/runtime/project-state/task
documents to describe only verified implementation. Document the contracts,
registries, bundle derivation, policy semantics, Raw/Source relationship,
external onboarding security model, and Workflow Console role. Preserve
historical reports unchanged. Add a final acceptance report mapping every
mission criterion to concrete evidence.

### Task 6.5: Git and remote acceptance

Review the complete diff, inspect secrets, run `git diff --check`, and commit
coherent milestones. Fetch and verify remote state, then push according to the
repository’s current practice when the branch/scope permits. Report exact final
SHA, branch, remote status, tests, E2E artifacts, and bounded external limits.

Only after a requirement-by-requirement audit proves all 38 completion criteria
may the mission be reported as `MISSION_COMPLETE` and the active goal marked
complete.
