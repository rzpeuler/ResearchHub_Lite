# ResearchHub_Lite — Migration Manifest

## 1. Purpose

This document defines the source-to-target migration policy from the original ResearchHub into ResearchHub_Lite.

Source repository:

`https://github.com/rzpeuler/ResearchHub`

Reference baseline:

`4c141172d6ba4123e909f0d8b9481072912e3ef2`

Every migrated asset must be classified as one of:

- `COPY`
- `ADAPT`
- `REFERENCE`
- `EXCLUDE`

ResearchHub_Lite is a selective port, not a repository clone.

---

# 2. COPY

These assets contain domain or deterministic infrastructure that should be preserved with minimal semantic change.

## Knowledge Schema v0.3

Source:

```text
packages/schemas/knowledge/v03/domain.ts
packages/schemas/knowledge/v03/executable-schema.ts
packages/schemas/knowledge/v03/mutation.ts
packages/schemas/knowledge/v03/index.ts
```

Also migrate the corresponding focused tests:

```text
packages/schemas/knowledge/v03/domain.test.ts
packages/schemas/knowledge/v03/executable-schema.test.ts
```

Target:

```text
knowledge/schema/
```

Migration rule:

- preserve Schema 0.3 semantics;
- adjust import paths only where possible;
- do not redesign canonical Knowledge objects during migration.

## Knowledge Storage Core

Initial candidate source files:

```text
packages/shared/knowledge-base/canonical-hash.ts
packages/shared/knowledge-base/canonical-v03-loader.ts
packages/shared/knowledge-base/manifest-loader.ts
packages/shared/knowledge-base/handle.ts
packages/shared/knowledge-base/registry.ts
packages/shared/knowledge-base/raw-identity.ts
packages/shared/knowledge-base/raw-archive.ts
packages/shared/knowledge-base/id-allocation.ts
packages/shared/knowledge-base/ingestion-log.ts
packages/shared/knowledge-base/mutation-lock.ts
packages/shared/knowledge-base/root-transaction.ts
packages/shared/knowledge-base/yaml.ts

packages/shared/knowledge-base/write/errors.ts
packages/shared/knowledge-base/write/path-allocation.ts
packages/shared/knowledge-base/write/path-allocation-v03.ts
packages/shared/knowledge-base/write/writer-v03.ts
```

Migration rule:

- migrate only the actual v0.3 dependency closure;
- preserve deterministic persistence semantics;
- remove legacy compatibility dependencies rather than importing old layers;
- target locations should be organized under `knowledge/`.

The v0.3 Writer is considered a high-value proven asset and should not be rewritten without a specific architecture reason.

---

# 3. ADAPT

These assets contain valuable logic or methodology but rely on old contracts or old runtime assumptions.

## Document Plugin

Source:

```text
packages/plugins/document/docling-document-parser.ts
packages/plugins/document/parser-registry.ts
packages/plugins/document/research-report-input-resolver.ts
packages/plugins/document/types.ts
```

Target:

```text
plugins/document/
```

Preserve where useful:

- Docling invocation;
- parser abstraction;
- input resolution;
- page/locator information;
- deterministic parsing behavior.

Replace the old chunk-oriented document contract with:

```text
StructuredDocument
├── metadata
├── sections[]
└── blocks[]
```

Block is the provenance anchor.

## Knowledge Curation

Source family:

```text
packages/skills/knowledge-curation/
```

High-value reusable components include:

- candidate contracts;
- schema context;
- extraction/reconciliation prompts;
- deterministic output validation;
- error model;
- retry feedback patterns.

Target:

```text
skills/knowledge-curation/
```

Required adaptation:

- evolve `ReportUnderstanding` into `ReportMap`;
- replace old `ExtractionBatch` input with `ExtractionUnit`;
- replace `evidenceChunkRefs` with Block-level provenance refs;
- add `Understand + Plan` capability;
- support `ExtractionPlanProposal`;
- preserve structured output and deterministic validation;
- replace `KnowledgeCurationModel` as the cross-host boundary with `ReasoningExecutor`.

## Reasoning Host

The original `KnowledgeCurationModel.invoke()` abstraction is useful as a conceptual predecessor but is not the final Lite cross-host contract.

Target:

```text
plugins/reasoning/
├── contracts.ts
├── codex/
└── mock/
```

Required contract direction:

```text
ReasoningExecutor
├── capabilities()
└── execute()
```

Minimum capabilities:

- maxContextTokens;
- maxOutputTokens;
- structuredOutputSupport;
- maxConcurrency.

The implementation must allow agent/coding-plan execution and must not require direct model HTTP API calls.

## Knowledge Validation

Source candidates:

```text
packages/skills/knowledge-validation/v03-validation-core.ts
packages/skills/knowledge-validation/v03-change-set-validator.ts
packages/skills/knowledge-validation/v03-validator.ts
packages/skills/knowledge-validation/rules/**
```

Target:

```text
knowledge/validation/
```

Migration direction:

- preserve deterministic Schema 0.3 and ChangeSet integrity rules;
- separate deterministic Knowledge integrity validation from semantic Skill reasoning;
- do not automatically carry the full legacy Skill wrapper.

---

# 4. REFERENCE

These assets are used to preserve validated behavior but should not be ported wholesale.

## Original Ingestion Workflow

Source:

```text
packages/workflows/research-report-knowledge-ingestion/workflow.ts
```

Classification:

`REFERENCE`

Use only to preserve validated invariants, including:

- bounded extraction/reconciliation retry;
- candidate isolation;
- deterministic reference resolution discipline;
- ChangeSet planning safety;
- Writer exactly-once expectations;
- replay/idempotency;
- reload/full validation;
- provenance integrity.

Do not port:

- old fixed batching;
- old model call plumbing;
- old runtime coupling;
- old monolithic orchestration structure.

## Reference Architecture Documents

Selected original Knowledge v0.3 documents may be copied under `docs/reference/` or consulted during engineering, but are not automatically normative for Lite.

Important references include:

```text
RESEARCHHUB_KNOWLEDGE_ARCHITECTURE_V0.3.md
KNOWLEDGE_DATA_SCHEMA_V0.3.md
KNOWLEDGE_CURATION_SKILL_V0.3.md
RESEARCH_REPORT_INGESTION_WORKFLOW_V0.3.md
RESEARCHHUB_KNOWLEDGE_STORAGE_LAYOUT_V0.2.md
RESEARCHHUB_KNOWLEDGE_WRITE_INTERFACE_V0.1.md
```

Lite governance and architecture documents are the current normative source.

---

# 5. EXCLUDE

The following are excluded from Lite v0.1 unless explicitly reauthorized.

## Runtime / Orchestration

```text
dsh/**
DeepSeek Harness runtime
ResearchManager
Planner
Capability
Provider
multi-agent runtime
old LLM runtime adapters
```

## Legacy Knowledge Compatibility

```text
packages/shared/knowledge-base/canonical-v02-loader.ts
packages/shared/knowledge-base/compatibility.ts
packages/shared/knowledge-base/migration/**
legacy Knowledge v0.2 index/loader paths
legacy writer
```

## Retired Extraction Architecture

```text
ExtractionBatch
SectionBatch
fixed chunk batching
chunk-count-driven semantic extraction
page-count path routing
```

## Unrelated Product Assets

```text
company research
equity research
industry research
earnings review
valuation
event analysis
financial/news/market integrations
frontend
Memory
Evaluation
Research Artifact system
large historical product-validation harness
```

---

# 6. Target Conceptual Layout

```text
ResearchHub_Lite/
├── workflows/
│   └── raw-document-knowledge-ingestion/
├── skills/
│   └── knowledge-curation/
├── plugins/
│   ├── document/
│   └── reasoning/
├── knowledge/
│   ├── schema/
│   ├── raw/
│   ├── storage/
│   ├── registry/
│   ├── query/
│   ├── provenance/
│   ├── changeset/
│   ├── validation/
│   └── writer/
├── runtime-data/
│   └── knowledge-bases/
└── tests/
```

This layout is conceptual during Bootstrap. Implementation tasks may refine file placement while preserving the frozen responsibility boundaries.

---

# 7. IMPLEMENTED LITE MIGRATION STATUS

The following adaptations are implemented in the Lite checkout and were reviewed against the source family above:

| Classification | Source asset family | Lite result |
|---|---|---|
| `ADAPT` | `packages/plugins/document/` | `plugins/document/` with stable `StructuredDocument`, Section, Block, parser, resolver, and Docling bridge contracts |
| `ADAPT` | `packages/skills/knowledge-curation/` | `skills/knowledge-curation/` with `ReportMap`, `ExtractionPlanProposal`, Block/Section evidence refs, local symbolic candidates, deterministic validation, and reconciliation coverage |
| `ADAPT` | `KnowledgeCurationModel` conceptual boundary | `plugins/reasoning/contracts.ts` `ReasoningExecutor`, plus Mock and isolated CLI adapters under `plugins/reasoning/` |
| `REFERENCE` | `packages/skills/knowledge-curation/prompts/analyze-schema-gaps.ts` | Not an active Lite operation; no `analyzeSchemaGaps` migration |
| `EXCLUDE` | Legacy batch/chunk and model-context runtime assumptions | No batch/chunk extraction contract, broad existing-Knowledge extraction context, Writer call, or Workflow routing in the migrated Skill |

The Knowledge Core under `knowledge/` remains the authoritative Schema 0.3 / Storage Format 1 implementation. Full Knowledge validation and deterministic ingestion Workflow remain pending for RHL-MIGRATION-005.
