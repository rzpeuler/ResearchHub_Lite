# Personal Research v1 Foundation Implementation Plan

## Worktree policy

- Branch: `codex/personal-research-v1-foundation`
- Preserve the pre-existing untracked Chinese PDF.
- Do not rewrite Schema 0.3 runtime data or modify unrelated migration artifacts.

## Milestones

### 1. Schema and integrity contracts

Add explicit Schema 0.4 domain contracts and fresh-KB manifest/version selection. Add claim type, dependency, probability, source provenance, and rights validation. Reuse deterministic hashing, path allocation, transaction, and validation patterns where compatible; keep v0.3 APIs intact. Add fresh-KB and regression tests.

### 2. Acquisition and intake

Create the narrow research acquisition plugin. Adapt the original official-announcement shape, add GDELT/RSS discovery, an injected AKShare bridge contract, bounded fetch/normalize behavior, and ResearchSignal persistence outside canonical Knowledge. Keep network tests separate and fixture-driven.

### 3. Report, Skill, and valuation

Add narrow ResearchReport validation/storage, Company Research structured output and Markdown projection, semantic proposal contracts, and deterministic relative/scenario valuation utilities. Ensure no Skill code calls Writer or allocates canonical IDs.

### 4. Workflow and application entry

Implement Company Deep Research orchestration with bounded acquisition, cancellation, deterministic request identity, proposal-to-knowledge production through a focused gateway, atomic Writer use, reload verification, report finalization, and `research_company` Application Service. Extend product adapters only as needed.

### 5. Verification and governance

Add targeted offline tests for every contract and failure mode, run existing full test/typecheck/client build suites, run an independently controlled real-network smoke where local dependencies permit, update README and governance snapshots/changelog/decision log, inspect the complete diff, and commit/push only the implementation branch.

## Review gates

After each milestone: `git diff --check`, targeted tests, typecheck as relevant, and inspection for forbidden architecture terms. Before final commit: full offline suite, client build, real smoke evidence, independent review of Schema 0.3 regression and Writer atomicity, and clean tracked worktree apart from the preserved pre-existing PDF.

